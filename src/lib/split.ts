/** Shared-expense maths: each person's balance, and the fewest payments to settle up. */

export interface SplitExpense {
  amount: number;
  currency: string;
  paidBy: string;
  splitWith: string[];
}

/**
 * Net balance per person in one currency: positive = gets money back, negative = owes.
 * `convert` returns null when there's no rate yet; those expenses are left out (and counted).
 */
export function balances(expenses: SplitExpense[], convert: (amount: number, currency: string) => number | null) {
  const net = new Map<string, number>();
  let skipped = 0;
  const add = (uid: string, v: number) => net.set(uid, (net.get(uid) ?? 0) + v);
  for (const e of expenses) {
    const v = convert(e.amount, e.currency);
    if (v == null || !e.splitWith.length) {
      skipped++;
      continue;
    }
    add(e.paidBy, v);
    const share = v / e.splitWith.length;
    e.splitWith.forEach((u) => add(u, -share));
  }
  return { net, skipped };
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Greedy settle-up: the biggest debtor pays the biggest creditor, repeat. At most n−1 payments. */
export function settleUp(net: Map<string, number>, minAmount = 0.01): Transfer[] {
  const creditors = [...net].filter(([, v]) => v > minAmount).map(([u, v]) => ({ u, v }));
  const debtors = [...net].filter(([, v]) => v < -minAmount).map(([u, v]) => ({ u, v: -v }));
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);
    const c = creditors[0];
    const d = debtors[0];
    const x = Math.min(c.v, d.v);
    out.push({ from: d.u, to: c.u, amount: Math.round(x * 100) / 100 });
    c.v -= x;
    d.v -= x;
    if (c.v <= minAmount) creditors.shift();
    if (d.v <= minAmount) debtors.shift();
  }
  return out;
}
