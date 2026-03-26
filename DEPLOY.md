# 🏡 Hearth — Deployment Guide
## Get live in ~20 minutes

---

## STEP 1 — Set up Supabase (your homebuild project)

1. Go to **supabase.com** → open your **homebuild** project
2. Click **SQL Editor** in the left sidebar
3. Paste and run `supabase/migrations/001_initial_schema.sql` → click **Run**
4. Paste and run `supabase/migrations/002_seed_data.sql` → click **Run**
5. After running, note the **Household ID** printed in the output
6. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon/public** key
   - **service_role** key (keep this secret!)

---

## STEP 2 — Set up your environment

1. Copy `.env.example` to `.env.local`:
   ```
   cp .env.example .env.local
   ```

2. Fill in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   NEXT_PUBLIC_HOUSEHOLD_ID=paste-uuid-from-step-1
   ANTHROPIC_API_KEY=sk-ant-...
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```

3. Get your **Anthropic API key** from console.anthropic.com

---

## STEP 3 — Test locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you should see Hearth with your data loaded from Supabase.

---

## STEP 4 — Deploy to Vercel

### Option A: Via Vercel CLI (fastest)
```bash
npm install -g vercel
vercel
# Follow the prompts, select your account
vercel --prod
```

### Option B: Via GitHub (recommended for ongoing updates)
1. Push this folder to a new GitHub repo
2. Go to **vercel.com** → New Project → Import your repo
3. Vercel auto-detects Next.js — click **Deploy**

### Add environment variables to Vercel
In your Vercel project → **Settings → Environment Variables**, add all the same variables from your `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_HOUSEHOLD_ID`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_APP_URL` ← set this to your actual Vercel URL after first deploy
- `CRON_SECRET` ← required for daily Telegram cron (make up a random string e.g. `hearth-cron-abc123`)

After adding variables, **redeploy** once.

---

## STEP 5 — Set up Telegram notifications (optional)

1. Open Telegram → search for **@BotFather**
2. Send `/newbot` → give it a name like "Hearth Home Bot"
3. Copy the **bot token** it gives you
4. Start a conversation with your new bot
5. Visit: `https://api.telegram.org/bot[YOUR_TOKEN]/getUpdates`
6. Find the `chat.id` number in the JSON response
7. In the Hearth app → **Settings tab** → paste token + chat ID → click **Save & Test**

You'll get a test message immediately. After that, Hearth sends daily updates at 8am automatically (via Vercel Cron).

---

## STEP 6 — Add to phone home screen

For a native app experience on both your phones:

**iPhone (Safari):**
1. Open your Vercel URL in Safari
2. Tap the Share button → "Add to Home Screen"
3. Tap "Add" — Hearth appears as an app icon

**Android (Chrome):**
1. Open your Vercel URL in Chrome
2. Tap the three-dot menu → "Add to Home Screen"
3. Tap "Add"

Both of you can do this — you'll both access the same Supabase data in real time.

---

## How the automation works

| Feature | How it works |
|---------|-------------|
| **Chore learning** | Every "Mark Done" writes to `chore_completions`. A Postgres trigger auto-recalculates your actual average interval |
| **Bill alerts** | Bills within 60 days trigger notifications, stored in `notifications` table |
| **Deal searching** | Calls `/api/deals` → Claude uses web search to find real live deals → saved to `bill_deals` |
| **Meal generation** | Calls `/api/meals` → Claude generates a 14-day plan → saved to `meal_plans` |
| **Daily Telegram** | Vercel Cron runs `/api/notify` every day at 8am → sends summary to your Telegram |
| **Real-time sync** | Supabase Realtime subscription → any change on one device instantly updates the other |

---

## File structure

```
hearth/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts        ← AI chat endpoint
│   │   │   ├── deals/route.ts       ← Live deal search
│   │   │   ├── meals/route.ts       ← AI meal generation
│   │   │   └── notify/route.ts      ← Telegram + cron
│   │   ├── page.tsx                 ← Main app
│   │   └── layout.tsx
│   └── lib/
│       └── supabase.ts              ← DB client + all queries
├── supabase/migrations/
│   ├── 001_initial_schema.sql       ← Tables + functions + RLS
│   └── 002_seed_data.sql            ← Default chores + bills
├── public/
│   └── manifest.json                ← PWA config
├── .env.example                     ← Copy to .env.local
├── vercel.json                      ← Cron config
├── next.config.js
└── package.json
```

---

## Troubleshooting

**"household_id is undefined"** → Make sure `NEXT_PUBLIC_HOUSEHOLD_ID` is set in both `.env.local` and Vercel env vars

**Chores not loading** → Check Supabase RLS policies were created (run the schema SQL again)

**Deals not working** → Check `ANTHROPIC_API_KEY` is set and has credits

**Telegram not sending** → Visit `api.telegram.org/bot[TOKEN]/getUpdates` and make sure you've sent at least one message to the bot first

**Daily Telegram not sending** → In Vercel, confirm `CRON_SECRET` is set (and redeploy), then check Function Logs for `/api/notify` (401 = missing/incorrect cron auth, 502 = Telegram API rejected the message)
