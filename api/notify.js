/**
 * POST /api/notify  (Vercel serverless function)
 * Sends a phone notification to the other members of a trip group when someone posts.
 *
 * Body: { groupId, body }   Header: Authorization: Bearer <Firebase ID token>
 * Needs the Vercel environment variable FIREBASE_SERVICE_ACCOUNT: the JSON key from
 * Firebase console → Project settings → Service accounts → Generate new private key.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function admin() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(503).json({ error: 'Notifications are not set up on the server' });
  admin();

  // Who is asking?
  const idToken = (req.headers.authorization || '').replace(/^Bearer /, '');
  let uid;
  try {
    uid = (await getAuth().verifyIdToken(idToken)).uid;
  } catch {
    return res.status(401).json({ error: 'Not signed in' });
  }

  const { groupId, body } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  if (typeof groupId !== 'string' || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'groupId and body are required' });

  const db = getFirestore();
  const group = await db.doc(`groups/${groupId}`).get();
  const members = group.exists ? group.get('members') || [] : [];
  if (!members.includes(uid)) return res.status(403).json({ error: 'Not a member of this trip' });

  const sender = (group.get('memberInfo') || {})[uid]?.name || 'Someone';
  const others = members.filter((m) => m !== uid);
  const users = others.length ? await db.getAll(...others.map((m) => db.doc(`users/${m}`))) : [];
  const owners = new Map();
  for (const u of users) for (const t of (u.exists && u.get('tokens')) || []) owners.set(t, u.id);
  const tokens = [...owners.keys()];
  if (!tokens.length) return res.status(200).json({ sent: 0 });

  const text = body.trim();
  const result = await getMessaging().sendEachForMulticast({
    tokens,
    data: {
      title: `${sender} · ${group.get('name') || 'Your trip'}`,
      body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
      tag: `chat-${groupId}`,
      groupId,
    },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });

  // Forget addresses of phones that uninstalled the app or turned notifications off.
  const stale = [];
  result.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') stale.push(tokens[i]);
  });
  await Promise.all(stale.map((t) => db.doc(`users/${owners.get(t)}`).update({ tokens: FieldValue.arrayRemove(t) }).catch(() => undefined)));

  return res.status(200).json({ sent: result.successCount, failed: result.failureCount });
}
