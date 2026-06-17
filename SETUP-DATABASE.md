# Connect the permanent database (Supabase) — ~10 min

This makes your stats and custody-watches **permanent** (they stop resetting on redeploy)
and lays the foundation for real cross-device accounts. Free, no credit card.

The app already has the database code built in. It stays in "temporary files" mode until
you set two environment variables in Render. Setting them flips it to permanent storage.

## Step 1 — Create a Supabase project
1. Go to **https://supabase.com** → sign up (GitHub sign-in is easiest) — free "Nano" tier.
2. **New project** → give it a name (e.g. `staynear`), set a database password (save it),
   pick the closest region. Wait ~2 min for it to provision.

## Step 2 — Create the table
1. In the project, open **SQL Editor** → **New query**.
2. Paste this and click **Run**:

```sql
create table if not exists kv (
  k text primary key,
  v jsonb,
  updated_at timestamptz default now()
);
```

That single table holds everything (analytics, watches/alerts) as JSON.

## Step 3 — Get your two keys
1. In Supabase, go to **Project Settings → API**.
2. Copy:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **service_role key** (a long secret token — under "Project API keys").
   > Use the **service_role** key, not the anon key. It's only ever used server-side on
   > Render and is never exposed to the browser.

## Step 4 — Add them to Render
1. Render → your **lifeline** service → **Environment** → **Add Environment Variable**:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_KEY` = your service_role key
2. Save. Render redeploys automatically (~2 min).

## Step 5 — Verify
Open **staynear.org/stats?key=…** — the Storage line should now read
**"✅ Permanent database (Supabase)"**. From now on, stats and watches survive every
redeploy and restart.

---
**Security note:** the service_role key is powerful — keep it only in Render's Environment
settings, never in the code or the repo. The app reads it from the environment at runtime.
