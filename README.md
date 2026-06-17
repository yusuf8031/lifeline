# Lifeline — Fresno County Family Navigator (working app)

A real, working web app. You create an account, type an inmate's name, and it pulls
their **live record** from the Fresno County Sheriff's public locator — then organizes
everything a family needs (money, phone, visits, court, bail, resources) in one place.

It is independent and **not** affiliated with any government agency. It only reads
**public** information that anyone can see on the Sheriff's website.

---

## What's in this folder

```
lifeline-app/
├─ server.js          ← the engine (does the live lookup)
├─ public/
│  └─ index.html      ← the dashboard you actually use
├─ package.json
└─ README.md          ← this file
```

---

## Run it on your own computer (about 5 minutes)

You only need **Node.js** (free). It's the one thing that lets the app talk to the
Sheriff's site for you.

### Step 1 — Install Node.js (one time)
Go to **https://nodejs.org** and download the "LTS" version. Install it like any app.

### Step 2 — Start Lifeline
- **Mac:** open the **Terminal** app.
- **Windows:** open **Command Prompt** or **PowerShell**.

Then type these two lines (replace the path with wherever this folder lives):

```
cd "path/to/lifeline-app"
node server.js
```

You'll see:
```
  Lifeline is running.
  Open this in your browser:  http://localhost:3000
```

### Step 3 — Use it
Open a browser and go to **http://localhost:3000**.
Create an account, search a last name (e.g. a real person in custody), pick them from
the list, and the whole dashboard fills in with their real record.

To stop the app, go back to the Terminal/Command window and press **Ctrl + C**.

> Tip: leave the Terminal window open while you use the app. Closing it stops the server.

---

## Put it online so anyone can use it (optional, free tiers available)

Running on your computer is great for you. To make it a **real website** that families
can visit from their phones, deploy it to a host. Easiest options:

- **Render.com** (free tier): create a "Web Service", connect this folder (via a GitHub
  repo), set the start command to `node server.js`. Render gives you a public URL.
- **Railway.app** or **Replit** work the same way — upload the folder, run `node server.js`.

No code changes needed — the app already reads the port from the host (`process.env.PORT`).

(If you want, I can walk you through the Render deploy step by step.)

---

## How the live lookup works (for the curious)

When you search, the server:
1. Loads the Sheriff search form to get its security tokens.
2. Submits the name to `publicinfo.fresnosheriff.org/InmateInfoV2/search.aspx`.
3. Reads the results and, when you pick a person, fetches their detail page
   (`InmateDetail.aspx?BookingNo=…`) — pulling name, booking #, Person ID, housing,
   charges, **per-charge bail amounts**, and **court case numbers**.

Your account and notes are stored privately in your own browser (nothing is sent anywhere
except the public lookup to the Sheriff's site).

---

## Important notes

- **Public data only.** This shows the same information the Sheriff already publishes.
- **Always confirm with the facility.** Records can lag; verify anything important by
  calling **(559) 475-9491**.
- **Court dates** are not in the jail record — the app gives you the case number and a
  one-tap link to the court portal, then lets you save the date for reminders.
- **Not legal advice.** For legal questions, use the Public Defender / an attorney.
- If the Sheriff changes their website, the lookup may need a small update to `server.js`.
