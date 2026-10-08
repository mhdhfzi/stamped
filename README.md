# 🌍 Stamped — plan, share & remember every trip

Stamped is a mobile travel app. Add every country you travel to, fill each one with your photos ("moments"), plan your days on a map, track your spending and packing — and, if you like, share a trip with friends to plan it together, chat, and split expenses.

It's a **Progressive Web App (PWA)** built with React + TypeScript: it runs in any phone browser, installs to the home screen like a native app, works **offline**, and can later be wrapped into an App Store / Play Store app with Capacitor.

> **Local-first & private.** Your photos, personal budget and packing lists live only on your device. Nothing leaves it unless you sign in and share a trip — and even then only that trip's plan, its photos, its group chat and its shared expenses are synced.

---

## Contents
- [Highlights](#-highlights)
- [Features](#-features) — launch & sign-in · home · trip page (Moments, Plan, Budget, Pack) · friends · feed · account
- [How it works](#-how-it-works)
- [Tech stack](#-tech-stack)
- [Getting started](#-getting-started)
- [Setting up sharing (Firebase)](#-setting-up-sharing-firebase)
- [Project structure](#-project-structure)
- [Data model](#-data-model)
- [Privacy & security](#-privacy--security)
- [Design & motion](#-design--motion)
- [Known limits](#-known-limits)
- [Going native](#-going-native-ios--android) · [Roadmap](#-roadmap) · [Credits](#-credits--licences)

---

## ✨ Highlights

| | |
|---|---|
| 📸 **Travel journal** | Photos per trip, compressed on the device, with their real capture date & GPS read from EXIF |
| 🗺️ **Day-by-day planner** | Places on a map with real walking/driving routes, route optimisation, auto-split across days, multi-city hotels |
| ✨ **Popular places** | The most famous sights near your trip (from Wikidata), one tap to add |
| 💰 **Budget** | Expenses in any currency, totals in your home currency, budget meter, by category and by day |
| 🎒 **Packing list** | Smart starter list sized to the trip, extra packs, progress |
| 👥 **Travel with friends** | Shared live plan, group chat with "tomorrow we go…" cards, shared expenses with settle-up |
| 🌐 **Interactive welcome** | A 3D globe you can spin; tap anywhere and a plane flies there |
| 🎞️ **Motion everywhere** | Flag-ring loading screen, stacking cards, scroll reveals, hover zoom |

---

## 🧭 Features

### Launch & sign-in
- **Loading screen on every launch** — two rings of country flags spinning around the Stamped emblem. Says **"Welcome back, Hafizi"** if you're signed in. Stays until your data is loaded and your sign-in is known (at least 2.2 s so the animation plays, at most 5 s on slow networks), then fades into the home page — or into the sign-up page for first-time users.
- **Welcome / sign-up page** (first launch, or Account → *Sign in*):
  - Full-screen **3D globe**: drag to spin (with momentum), it slowly turns by itself, **continent labels**, planes flying great-circle routes with glowing trails
  - **Tap anywhere** — a plane takes off from Kuala Lumpur and flies there, dropping a stamp pin with a ripple ("2 places stamped")
  - Serif headline *"Every place you go, **stamped.**"*, **Continue with Google**, **Continue with email** (slides up a form), **Continue without an account** (the app works fully offline without one)
- Invite links (`…?join=CODE`) skip the welcome and go straight to joining the trip.

### Home — your trips
- **Destination cards**: full-bleed cover, giant clipped title, glass pill ("12 moments" / "✈ In 13 days"), ⋯ menu
- **Stacking deck on scroll**: each card pins under the header and the next slides over it; covered cards shrink, tilt back in 3D and dim, with edges peeking out; photos drift with parallax
- **Hover / press**: cards zoom in (photo pushes in further, name brightens), dip when pressed, and zoom "into" the trip when chosen
- **Upcoming** section (planned trips, soonest first, with countdown) above **Your stamps**
- **Region filter** (tap *Everywhere ▾*) and **year filter** (📅); **+** to add a trip — search 199 countries, choose **Been there** or **Planning a trip**, name the card (e.g. a city)
- ⋯ menu: open, rename, mark as been there / move to upcoming, delete

### Trip page
A hero cover that drifts with the scroll (title fades & lifts; pull down to stretch), four tabs that slide in from the side you tap, and cards that rise in as they scroll into view. 👥 opens sharing / the group chat (red dot = unread).

**Moments**
- Add photos from the gallery (multi-select) or the camera; resized & compressed on the device (max 1800 px, JPEG 85% — a 10 MB photo becomes ~400 KB)
- Reads **EXIF capture time & GPS** first (compression drops EXIF, and phone file dates are often the upload time)
- Grid grouped by **plan day** (*Day 2 · Thu 8 Oct*) during the trip dates, else by month; ♥ favourite and COVER badges; tiles zoom on hover

**Plan**
- **Trip dates** → Day 1, Day 2… (shortening a trip moves later places onto the last day)
- **Add places** by searching OpenStreetMap (limited to the trip's country, ranked near what you've planned) — or from **Popular near Kyoto**: a carousel of the most famous sights (photos, categories) with one-tap **+ Add**; *See all* lists up to 60 with filters (Landmarks, Areas to explore, Temples & shrines, Museums & arts, Nature & parks, Family fun, Shopping) and area chips for multi-city trips
- **Map per day** with numbered pins and the real **walking / driving route**, total distance & time, and time between each stop
- Reorder (↑/↓), tick off as visited, add a time and note, move to another day
- **Where you're staying** — one hotel for the trip, or **one per city** (Days 1–3 Shinjuku, Days 4–6 Kyoto). Each day starts where you slept and ends where you sleep, so **moving days** run hotel → hotel. Search an **area** to browse hotels, hostels & guesthouses on a map (filters, stars, distance, website), use the **area itself** as your base, or pick a hotel by name. **Airbnb / Booking.com / Google Hotels** links open pre-filled with the area and dates. Warns if a hotel is far from that day's places
- **Optimise order** — shortest order for a day using real travel times (exact up to 12 places), keeps ticked-off places first, shows the time saved, **Undo**
- **Split across days** — groups nearby places into the same day, keeps days even (≈75 min per place + travel); on multi-city trips places go to the days of their nearest hotel, and moving days get a lighter load. **Undo**
- **Google Maps** button for turn-by-turn directions of the day (hotel → places → hotel)
- **Memories from Day N**: photos taken that day; geotagged photos within 300 m of a planned place show as a thumbnail on it

**Budget**
- Log expenses in **any currency** (defaults to the trip country's), category (Stay, Food, Transport, Activities, Shopping, Other), note and date; the amount field shows the currency's symbol and flag and *"In Japanese Yen · ≈ RM 62.00"*
- Totals in your **home currency**: spent, **budget meter** with what's left and *≈ RM x a day for the days left* (red ⚠ when over)
- **By category** (stacked bar + list) and **by day** (tap a bar); expenses grouped by trip day, plus *Before the trip* for flights & bookings
- Amounts accept `1,500`, `12,50`, `1.500,50`; rates cached for offline use

**Pack**
- One tap: an **essentials list sized to the trip** (daily clothes up to a week); add-on packs **Beach, Cold weather, Hiking, Work**; your own items; copy a list from another trip
- Tick off, *12 / 30 packed* overall and per category, hide packed, unpack all

### Upcoming trips
- Planned trips show a countdown (*In 13 days*, *Tomorrow*, *Happening now · Day 2*) and open on the Plan tab
- They don't count towards World explored / passport stamps (they appear as **Next stamps**) until you add a moment or tap *Mark as been there*

### Travel with friends *(needs Firebase — see setup)*
- **Sign in** with Google or email
- **Share a trip** → a 6-letter invite code and link; friends join from the link or Account → *Join a trip with a code*
- **One live plan** for everyone: places, days, hotels and dates sync both ways in real time
- **Shared photos**: moments added to a shared trip appear on everyone's phone (including ones added before a friend joined); removing one removes it for all
- **Photos & videos in the chat**, WhatsApp-style: **+** → Camera · Gallery · Video · Day plan, or the 📷 in the message box. In-app camera: **tap for a photo, hold to record** (or the Video mode), flip camera, up to 60 s; pick several photos/videos from the gallery (videos up to 20 MB); preview with a caption before sending; upload progress; full-screen viewer with save
- **Delete messages**: long-press (or right-click) a message → **Delete for everyone** (your own; shows *This message was deleted* and removes its photo/video) · **Delete for me** (any message, hidden on this phone) · Copy text
- **Group chat** per trip: messages, **typing…** indicator, **read receipts** (✓ sent · ✓✓ seen · *Seen by Aina, Ben* — tap your message for who hasn't), automatic notes (*Aina added Tsukiji Outer Market to Day 2*), and 📍 **Remind the group** — a card with tomorrow's places and start/end hotel
- **Shared expenses**: who paid, split equally between chosen people (any currency), each person's balance, **Settle up** with the fewest payments, **Mark paid**
- **Members**: invite code, share link, organiser badge, leave the group (ownership passes on)
- **Notifications** *(optional setup below)*: a phone alert when a friend messages or adds photos, even with the app closed; tap it to open that chat

### Feed, photo viewer & account
- **Feed** — every moment from every trip, newest first; All / Favourites; tap a trip name to jump to it
- **Photo viewer** — swipe, ♥, edit caption / place / date, set as cover, share (native share sheet), delete; shows *Day 2 · 📍 Sensō-ji* when linked to the plan
- **Account** — name & avatar; stats (countries, moments, regions, favourites); **World explored** (x of 195, per region); **Passport stamps** & **Next stamps**; **Friends & sharing** (sign in/out, join a trip, chat notifications); **Money** (home currency, total spent on all trips); **Export / Import backup** (one `.json` with trips, photos, plans, expenses); storage used; delete all data

---

## ⚙️ How it works

**Local-first.** Everything you create is saved immediately in the browser's **IndexedDB** on your device, so the app opens instantly and works offline. A single React context (`store.tsx`) holds the state and all actions.

**One space per account.** Each account's trips live in their own on-device database (`stamped-<uid>`); using the app without an account uses `stamped`. Signing out switches to the no-account space (a clean app) and shows the welcome screen; signing back in brings your trips back. Trips made without an account move into the first account that signs in on that phone. (Data stays on the phone after signing out — use *Delete all data* first to remove it.)

**Opens with no internet.** A service worker (`public/sw.js`) saves every file of the app on the first visit (the build writes the list to `precache.json`), so after that Stamped launches in airplane mode. Opening it online still fetches the newest version; old versions are cleaned up. The same worker shows chat notifications. No account is needed for solo use — *Continue without an account* on the welcome screen.

**Sharing is an optional layer.** Firebase code is loaded only when sharing is configured and needed (a separate ~200 KB download), so solo use stays small and offline. When a trip is shared:
- a **sync engine** (`CloudSync.tsx`) listens to the trip's group in Firestore and applies friends' changes to your local copy, and pushes your local edits up — without echoing changes back and forth;
- the chat, shared expenses and members are read live from Firestore;
- Firestore keeps its own offline cache, so the chat and plan open without a connection.

**Free, key-less online services** (each degrades gracefully offline):

| Service | Used for | Offline / failure |
|---|---|---|
| OpenStreetMap tiles | Maps | Map area stays blank; plan still works |
| Nominatim (OSM) | Place & hotel search | "You're offline" message |
| FOSSGIS OSRM | Walking / driving routes, travel-time tables | Straight-line estimate (marked ≈) |
| Wikidata | Popular places (ranked by Wikipedia coverage) | Cached 30 days on the device |
| open.er-api.com (fallback: currency-api on jsDelivr) | Exchange rates | Cached; refreshed every 12 h |
| Firebase Auth + Firestore | Accounts, shared trips, photos, chat, shared expenses | Firestore offline cache |
| Firebase Cloud Messaging + `api/notify.js` (Vercel function) | Chat notifications | Skipped; the in-app badge still shows |

**Algorithms worth knowing**
- *Optimise order*: exact shortest path (Held–Karp) for up to 12 places, nearest-neighbour + 2-opt above that, with fixed start/end hotels
- *Split across days*: one good tour cut into balanced consecutive chunks (min-max day length), assigned per hotel city, lighter moving days
- *Settle up*: net balances, then greedy biggest-debtor → biggest-creditor (at most n−1 payments)
- *Photos ↔ plan*: EXIF parser (both byte orders), photo day from capture date, nearest planned place within 300 m

---

## 🧱 Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | **React 18** + **TypeScript 5** (strict) | Components & hooks; typed data model |
| Build | **Vite 5** (+ `vite-plugin-singlefile` for a one-file demo) | Fast dev server, code-splitting for Firebase & the globe |
| Styling | **Tailwind CSS 3** + custom CSS | Utilities plus the liquid-glass effect and keyframe animations |
| Fonts & icons | **Inter**, **Instrument Serif** (Google Fonts), **Lucide React** | Clean UI type; elegant display headlines |
| Local database | **IndexedDB** via [`idb`](https://github.com/jakearchibald/idb) | Photos as Blobs (hundreds of MB, unlike localStorage) |
| Images | Canvas + `createImageBitmap`, custom **EXIF** reader | On-device compression, real capture time & GPS |
| Maps | **Leaflet** + OpenStreetMap | Free, no API keys |
| 3D globe | **d3-geo** + **topojson-client** + **world-atlas** (110 m) | Orthographic globe on `<canvas>`, great-circle routes |
| Flags | **flag-icons** (20 bundled SVGs) | Real flag images — Windows can't draw flag emoji |
| Backend (optional) | **Firebase** Auth + Firestore, `firestore.rules` | Sign-in, real-time sync, chat, shared photos, security rules |
| Notifications (optional) | **Firebase Cloud Messaging**, `public/push-sw.js`, `api/notify.js` with `firebase-admin` | Phone alerts for group chats (free; runs as a Vercel function) |
| Local testing | Firebase **Emulator Suite** (firebase-tools 13, Java 11+) | Test sharing without touching the real project |
| Web platform | PWA manifest, Web Share API, IntersectionObserver, `prefers-reduced-motion` | Installable, native share, scroll reveals, accessibility |

---

## 🚀 Getting started

**Requirements:** Node.js 18+ and npm. (Java 11+ only for the Firebase emulators.)

```bash
npm install
npm run dev            # → http://localhost:5173
```

Without a `.env`, the app runs fully **local** (sharing features are hidden). To enable sharing, see [Setting up sharing](#-setting-up-sharing-firebase).

**On your phone (same Wi-Fi):** `npm run dev -- --host`, then open `http://<your-computer-ip>:5173`. Use **email** sign-in there (Google sign-in needs an authorised domain). The camera and "Add to Home Screen" work best over **HTTPS** — deploy, or use a tunnel like `npx localtunnel --port 5173`.

**Install as an app:** deploy `dist/` to Vercel / Netlify / Cloudflare Pages / GitHub Pages (free), open it on your phone → iPhone Safari: *Share → Add to Home Screen*; Android Chrome: *⋮ → Install app*.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (uses `.env`) |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run build:single` | One self-contained `dist-single/index.html` (demo) |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm run emulators` | Local Firebase Auth + Firestore emulators (Java 11+) |
| `npm run dev:emulators` | Dev server wired to the emulators (port of your choice, e.g. `-- --port 5174`) |
| `npm run deploy:rules -- --project <id>` | Publish `firestore.rules` (after `npx firebase-tools@13 login`) |

---

## 👥 Setting up sharing (Firebase)

Sharing needs your own free Firebase project (Spark plan is enough):

1. **Create the project** — [console.firebase.google.com](https://console.firebase.google.com) → *Add project* (Google Analytics not needed).
2. **Add a web app** — Project overview → *</>* (Web) → name it *Stamped* → note the `firebaseConfig` values.
3. **Turn on sign-in** — Build → *Authentication* → Get started → enable **Email/Password** and **Google**.
4. **Create the database** — Build → *Firestore Database* → Create database → *Production mode* → a region near you (e.g. `asia-southeast1` Singapore — can't be changed later).
5. **Add the rules** — Firestore → *Rules* → paste [`firestore.rules`](firestore.rules) → **Publish**.
6. **Connect the app** — copy `.env.example` to `.env` and fill in plain `NAME=value` lines (not the JavaScript snippet):
   ```
   VITE_FIREBASE_API_KEY=…
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_APP_ID=…
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=…
   VITE_FIREBASE_EMULATORS=false
   ```
   then restart `npm run dev`.
7. **When you deploy**, add the same `VITE_FIREBASE_*` variables to the host, and your site's domain under Authentication → Settings → *Authorized domains*.

The config values are public client settings, not secrets — access is protected by the rules. `.env` is git-ignored.

### Chat notifications (optional)

Phone alerts need two keys. Without them everything else works, and *Account → Chat notifications* shows *Not set up yet*.

1. **Web Push key** — Firebase console → Project settings → *Cloud Messaging* → *Web Push certificates* → **Generate key pair** → copy the key. Add it to `.env` **and** to Vercel (Settings → Environment Variables) as `VITE_FIREBASE_VAPID_KEY=…`.
2. **Server key** — Project settings → *Service accounts* → **Generate new private key** (downloads a `.json`). In Vercel add a variable `FIREBASE_SERVICE_ACCOUNT` and paste the **whole file content** as its value. This one is a secret: never commit it or put it in `.env`.
3. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy), then on each phone: *Account → Chat notifications* (or the banner in a group chat) → allow.

On iPhone (iOS 16.4+), notifications only work from the **Home Screen** app, not a Safari tab.

**Test without a project:** `npm run emulators` in one terminal, `npm run dev:emulators` in another — accounts and data stay on your computer.

---

## 📁 Project structure

```
stamped/
├── index.html                    # Fonts, PWA meta tags
├── firestore.rules               # Security rules for shared trips
├── firebase.json                 # Emulator ports, rules path
├── .env.example / .env.emulators # Firebase settings (copy to .env)
├── public/                       # manifest.webmanifest, icon.svg
└── src/
    ├── main.tsx · App.tsx        # Entry; shell with tabs, splash, lazy cloud features
    ├── store.tsx                 # All app state + actions (React context), local-change hooks
    ├── types.ts                  # Trip, Photo, Stop, Expense, HotelStay, PackItem…
    ├── index.css                 # Tailwind, liquid-glass, all animations (reduced-motion aware)
    ├── data/
    │   ├── countries.ts          # 199 countries by region, names, flag emoji
    │   └── currencies.ts         # Country → currency, home-currency guess, currency flags
    ├── lib/
    │   ├── db.ts                 # IndexedDB (v3: trips, photos, stops, expenses, meta) + memory fallback
    │   ├── image.ts · exif.ts    # Compression; EXIF capture time & GPS
    │   ├── geo.ts                # Place/hotel search, routes, Google Maps links
    │   ├── optimize.ts           # Route order, split across days (incl. multi-city)
    │   ├── stays.ts              # Hotels per night, moving days
    │   ├── popular.ts            # Popular places from Wikidata (cached)
    │   ├── money.ts · split.ts   # Rates, conversion, amount parsing; shared-expense balances
    │   ├── tripStatus.ts         # Upcoming status, photo ↔ plan-day matching
    │   ├── cloud.ts              # Firebase: auth, groups, sync, chat, expenses (lazy)
    │   ├── cloudConfig.ts · groupBadge.ts · useReveal.ts · photoSrc.ts · utils.ts
    ├── components/
    │   ├── Splash.tsx · Emblem.tsx            # Flag-ring loading screen, logo
    │   ├── CardStack.tsx · DestinationCard.tsx# Stacking deck, trip card with hover zoom
    │   ├── TripPlan.tsx · DayMap.tsx · PlanSheets.tsx · PopularPlaces.tsx
    │   ├── HotelSheet.tsx · StaysMap.tsx · StaySheet.tsx
    │   ├── TripBudget.tsx · TripPacking.tsx · CloudSync.tsx
    │   ├── PhotoViewer.tsx · AddTripSheet.tsx · TripActionsSheet.tsx · BottomNav.tsx · PhoneFrame.tsx · ui.tsx
    │   ├── login/                # LoginGate, LoginScreen, InteractiveGlobe
    │   └── group/                # GroupScreen (chat/expenses/members), TripGroup, JoinTrip, AuthPanel, AccountCloud
    └── screens/                  # TripsScreen (home), TripScreen, FeedScreen, AccountScreen
```

---

## 🗃️ Data model

**On the device (IndexedDB `stamped`, version 3)** — stores `trips`, `photos`, `stops`, `expenses` (each indexed by trip) and `meta` (profile name, home currency, cached rates & popular places).

```ts
interface Trip {
  id: string; countryCode: string; title: string; coverPhotoId?: string; createdAt: number;
  planned?: boolean;                        // upcoming until it has a moment
  startDate?: string; endDate?: string;     // "2026-10-07"
  travelMode?: 'foot' | 'car';
  stays?: { id: string; place: Place; from: number; to: number }[];  // hotel per range of nights
  budget?: { amount: number; currency: string };
  packing?: { id: string; name: string; category: PackCategory; packed: boolean }[];
  groupId?: string;                         // set when shared with friends
}
interface Photo   { id; tripId; blob?: Blob; url?; caption?; place?; favorite?; takenAt: number; lat?; lng?; createdAt }
interface Stop    { id; tripId; day: number; order: number; name; address?; lat; lng; time?; note?; done?; createdAt }
interface Expense { id; tripId; amount: number; currency: string; category: ExpenseCategory; note?; date: string; createdAt }
```

**In Firestore (shared trips only)**

```
invites/{code}              → { groupId }
groups/{groupId}            → name, countryCode, ownerId, members[], memberInfo{}, inviteCode, currency,
                               trip { title, startDate, endDate, stays, travelMode }
groups/{id}/stops/{stopId}  → the shared plan (one document per place)
groups/{id}/messages/{id}   → chat: text · activity · plan card · photo · video (with kind, size, preview)
groups/{id}/expenses/{id}   → amount, currency, category, note, date, paidBy, splitWith[], createdBy
groups/{id}/photos/{id}     → shared photo details: takenAt, place, caption, lat/lng, addedBy
groups/{id}/photoData/{id}  → the picture (JPEG data URL, ≤ 600 KB, kept apart so the list stays light)
groups/{id}/media/{m}_{n}   → pieces (≤ 900 KB) of photos & videos sent in the chat
groups/{id}/status/{uid}    → typingAt, readAt (typing indicator & read receipts)
users/{uid}                 → tokens[] (this person's devices for notifications)
```

**Backups** are one `.json` file with trips, photos (base64), plans, expenses and settings.

---

## 🔒 Privacy & security
- Photos are **only uploaded for trips you share** (a resized copy, visible to that trip's members). Personal budgets and packing lists are **never uploaded**.
- Shared data is protected by **`firestore.rules`**: only members can read or write a trip; joining needs the invite code; a non-member can only add themselves; nobody can post as someone else; only the organiser can hand over ownership. (Tested on the emulator with an outsider account.)
- No analytics or trackers. Map tiles, search and routing requests go to the public OpenStreetMap / FOSSGIS servers; rates and popular places are fetched anonymously.

---

## 🎨 Design & motion
- Dark, liquid-glass UI; Inter for interface text, **Instrument Serif** for display headlines; a 375×780 iPhone frame on desktop, full-screen on phones (< 520 px).
- **Motion**: flag-ring splash; interactive 3D globe; stacking cards with 3D tilt & parallax; hover zoom & press feedback on cards; scroll-linked trip hero; scroll reveals; sliding tabs; sliding sheets.
- **Accessibility**: every animation respects the system **Reduce motion** setting; focus rings for keyboard use; category colours validated for colour-blind safety and always paired with labels/icons; labelled controls.
- Everyone starts with an empty Trips page — add your own trip or join a friend's with their code.

---

## ⚠️ Known limits
- Reminders are posted by tapping 📍; *scheduled* reminders (e.g. every evening automatically) would need a scheduled server job.
- Chat videos are stored in Firestore pieces (no paid Firebase Storage): in-app recordings are ~1 Mbit/s (about 8 MB a minute), gallery videos are limited to 20 MB. The free 1 GB fills faster with videos.
- Shared photos are resized to fit Firestore's 1 MB document limit (about 1440 px); the free plan's 1 GB holds a few thousand of them.
- Shared plans use last-write-wins if two people edit the same place at the same moment.
- Packing lists aren't shared yet; personal Budget and shared Expenses are separate.
- Expenses convert at today's rates (not the rate on the day paid).
- Optimising doesn't respect fixed times; travel mode is per trip (no train/flight legs yet).
- EXIF is read from JPEG only (iPhone Safari converts HEIC to JPEG on upload).
- Hotel lists come from OpenStreetMap (not every property); Airbnb/booking prices aren't available as open data.
- Popular places: the first load for a new city can take 5–20 s (then cached for 30 days).

---

## 📱 Going native (iOS & Android)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init Stamped com.yourname.stamped --web-dir=dist
npm run build
npx cap add android   # and/or: npx cap add ios (Mac + Xcode)
npx cap sync
npx cap open android
```

Recommended native plugins afterwards: `@capacitor/camera`, `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/push-notifications`.

---

## 🛣️ Roadmap
- 🔔 Automatic "tomorrow's plan" push notifications
- 🚆 Train / flight legs on moving days
- 🎒 Shared "who brings what" packing list
- 🗺️ World map colouring visited countries
- 🎞️ Auto-generated trip recap / slideshow
- 💱 Store the exchange rate on the day you paid
- 🌐 Bahasa Melayu translation

---

## 🙏 Credits & licences
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL); routing by [FOSSGIS OSRM](https://routing.openstreetmap.de); search by [Nominatim](https://nominatim.org)
- Popular places from [Wikidata](https://www.wikidata.org) (CC0); photos from Wikimedia Commons (each under its own licence)
- Globe outlines from [world-atlas](https://github.com/topojson/world-atlas) / Natural Earth (public domain)
- Flags from [flag-icons](https://github.com/lipis/flag-icons) (MIT)
- Exchange rates from [ExchangeRate-API](https://www.exchangerate-api.com) open access and [currency-api](https://github.com/fawazahmed0/exchange-api)

## 📝 License
MIT — free to use and modify.
