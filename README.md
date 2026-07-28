# Sun Ripe Poultry Farm — M-Pesa (Daraja STK Push) Backend

This is the server that makes real M-Pesa payments work on your website.
It talks to Safaricom's Daraja API, keeps your secret keys safe, verifies
every payment before marking an order "Paid," and stores every
transaction in a local database.

**Your website's HTML/JS cannot do this by itself** — Safaricom requires
a server that can hold a Consumer Secret and Passkey privately, and it
sends payment results to a server URL, not to a browser. This backend is
that server.

---

## 1. What you need before you start

- [Node.js](https://nodejs.org) version 18 or newer installed on your computer/server
- A Safaricom Daraja account: https://developer.safaricom.co.ke (free to sign up)
- Your **Till Number** (Buy Goods): `5282328`

---

## 2. Get your Daraja credentials

1. Log in at https://developer.safaricom.co.ke and go to **My Apps**.
2. Click **Add a new App**, give it a name (e.g. "Sun Ripe Poultry Farm"),
   and select the **Lipa Na M-Pesa Sandbox** product (for testing) — later
   you'll request production access using the same app.
3. Once created, the app page shows your:
   - **Consumer Key**
   - **Consumer Secret**
4. For the **Passkey**:
   - Sandbox testing: use the default passkey shown on Safaricom's
     [Daraja test credentials page](https://developer.safaricom.co.ke/Documentation) — it's public and meant only for the sandbox shortcode `174379`.
   - Production: Safaricom issues your real Passkey when they approve
     your Till Number for **Lipa Na M-Pesa Online**. Apply for this via
     your Safaricom business account manager or the Daraja portal's
     "Go Live" process.
5. Your **Shortcode** for testing is the sandbox demo shortcode
   (`174379`) — your real Till Number (`5282328`) is only used once you
   switch to production and Safaricom has linked it for STK Push.

---

## 3. Install and configure

```bash
cd sunripe-mpesa-backend
npm install
cp .env.example .env
```

Now open `.env` in a text editor and fill in the blanks:

| Variable | Where to get it |
|---|---|
| `MPESA_CONSUMER_KEY` | Daraja portal → My Apps → your app |
| `MPESA_CONSUMER_SECRET` | Daraja portal → My Apps → your app |
| `MPESA_SHORTCODE` | `174379` for sandbox testing, `5282328` once live |
| `MPESA_PASSKEY` | Daraja sandbox test credentials page, or Safaricom (production) |
| `MPESA_CALLBACK_URL` | A **public HTTPS URL** pointing at `/api/mpesa/callback` on this server (see step 4) |
| `MPESA_ENV` | `sandbox` while testing, `production` when live |
| `FRONTEND_ORIGIN` | Your website's URL, e.g. `https://sunripepoultryfarm.com` |

**Never share your `.env` file or commit it to Git.** `.gitignore` is
already set up to exclude it.

---

## 4. Expose your callback URL (development)

Safaricom needs to reach your callback endpoint over the public internet
— `localhost` won't work. While developing on your own machine, use a
tunnel tool like [ngrok](https://ngrok.com):

```bash
ngrok http 4000
```

Copy the `https://xxxx.ngrok-free.app` URL it gives you and set:

```
MPESA_CALLBACK_URL=https://xxxx.ngrok-free.app/api/mpesa/callback
```

In production, deploy this backend to a real server (Render, Railway,
a VPS, etc.) with a real domain and HTTPS, and point
`MPESA_CALLBACK_URL` at that instead.

---

## 5. Run it

```bash
npm start
```

You should see:

```
[INFO] Database ready { path: '.../data/sunripe.db' }
[INFO] Sun Ripe M-Pesa backend running { port: 4000, mpesaEnv: 'sandbox', ... }
```

The database file and tables (`orders`, `mpesa_transactions`) are created
automatically the first time you run it — nothing to set up by hand.

Check it's alive: open `http://localhost:4000/health` in a browser.

---

## 6. Connect your website to it

In `farm-store.html`, find this line near the top of the `<script>` block:

```js
const API_BASE_URL = 'https://your-backend-domain.com/api';
```

Change it to wherever this backend is running, e.g.
`https://api.sunripepoultryfarm.com/api` in production, or
`http://localhost:4000/api` while testing locally.

---

## 7. How a payment flows, end to end

1. Customer taps **Pay with M-Pesa** and enters their phone number.
2. The browser calls `POST /api/orders` (creates a "Pending" order) then
   `POST /api/mpesa/stkpush` (this backend calls Safaricom, which pushes
   a payment prompt to the customer's phone).
3. The browser shows a loading spinner and polls
   `GET /api/mpesa/status/:checkoutRequestId` every few seconds.
4. The customer enters their M-Pesa PIN (or cancels).
5. **Safaricom calls this server directly** at `/api/mpesa/callback` with
   the result — this is the only trusted source of truth for whether
   payment succeeded, which is why verification happens here, not in
   the browser.
6. This server saves the M-Pesa receipt number, phone, amount,
   transaction ID, and timestamp, and marks the order "Paid."
7. The next time the browser polls `/status`, it sees "Success" and shows
   the confirmation screen with the receipt number.

---

## 8. Going to production — checklist

- [ ] Apply to Safaricom for **Go-Live** access to switch from sandbox to
      your real Till Number (`5282328`)
- [ ] Set `MPESA_ENV=production` and update `MPESA_SHORTCODE` /
      `MPESA_PASSKEY` with your production values
- [ ] Deploy this backend behind HTTPS on a real domain
- [ ] Update `MPESA_CALLBACK_URL` and `FRONTEND_ORIGIN` to your real domains
- [ ] Set `NODE_ENV=production`
- [ ] Keep `.env` off any public repository
- [ ] Consider adding a process manager (`pm2`) or containerizing
      (Docker) so the server restarts automatically if it crashes
- [ ] Back up the `data/sunripe.db` file regularly

---

## Project structure

```
sunripe-mpesa-backend/
  src/
    config/env.js            # loads & validates all environment variables
    db/database.js           # SQLite connection + schema
    db/orders.repo.js        # order queries
    db/transactions.repo.js  # M-Pesa transaction queries
    services/mpesa.service.js# talks to Safaricom Daraja API
    controllers/              # request handlers
    routes/                   # Express routes
    middleware/errorHandler.js
    utils/logger.js
    utils/phone.js
    server.js                 # app entry point
  data/sunripe.db             # created automatically
  logs/error.log              # created automatically
  .env.example
  package.json
```
