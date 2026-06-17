# Putting Lifeline online (free) — step by step

Goal: turn this folder into a real website with a public URL that families can open on
their phones, with custody alerts running around the clock.

We'll use **GitHub** (to hold the code) + **Render** (to run it, free tier). About 15–20 min.

> You'll create two free accounts. I (Claude) can walk you through each screen and open
> the right pages, but **you** type the passwords and click the final "approve/agree"
> buttons — I don't enter credentials or accept terms on your behalf.

---

## Part 1 — Put the code on GitHub

1. Go to **https://github.com** and create a free account (or log in).
2. Click **New repository**. Name it `lifeline`. Keep it **Public** (or Private — both
   work with Render). Click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Drag in **everything inside the `lifeline-app` folder**: `server.js`, `index.html`,
   `package.json`, `render.yaml`, `.gitignore`, `README.md`, `DEPLOY.md`.
5. Click **Commit changes**.

## Part 2 — Run it on Render

1. Go to **https://render.com** and sign up (the "Sign in with GitHub" option is easiest).
2. Click **New +** → **Web Service**.
3. Connect your **lifeline** GitHub repo.
4. Render reads `render.yaml` automatically. If it asks, confirm:
   - **Runtime:** Node
   - **Start command:** `node server.js`
   - **Plan:** Free
5. Click **Create Web Service**. Wait ~2 minutes for "Live."
6. You'll get a URL like `https://lifeline-xxxx.onrender.com` — that's your live app. 🎉

## Part 3 — Keep alerts running 24/7 (free trick)

Render's free tier "sleeps" after 15 min of no visitors, which would pause the alert
checks. Fix it with a free pinger that also triggers a check:

1. Go to **https://cron-job.org** and make a free account.
2. Create a cron job that requests
   `https://YOUR-APP.onrender.com/api/checknow` every **30 minutes**.
3. Done — this keeps the app awake and forces a custody re-check on schedule.

## Part 4 (optional) — Real SMS / email alerts

The app already shows alerts in the page and as browser notifications. To also get a
**text or email**:

1. Make a free **Zapier** (or IFTTT / Make) account.
2. Create a "Catch Hook" / Webhook trigger → action = "Send SMS" or "Send email."
   Copy the webhook URL it gives you.
3. In Render → your service → **Environment** → add a variable:
   `WEBHOOK_URL = ` (paste the webhook URL). Save. Render redeploys.
4. Now every custody change is also sent to you as a text/email. No passwords ever touch
   Lifeline — Zapier handles the sending.

---

## Notes
- Free hosting is great for testing and small use. For a public service serving many
  families reliably, move to a paid tier (always-on) when you're ready.
- If the Sheriff changes their website, the lookup in `server.js` may need a small tweak.
- `watches.json` (the alert list) resets when Render redeploys — fine for now; a database
  is the upgrade when you outgrow it.
