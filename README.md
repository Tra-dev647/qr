# Tra Deposit — Bakong KHQR

Generates a real dynamic KHQR (individual account) for a USD/KHR amount, stores the deposit in Neon PostgreSQL, and confirms payment through the Bakong Open API.

## Setup
1. Create a Neon database and run `schema.sql` in its SQL editor.
2. Get a Bakong Open API token (https://api-bakong.nbc.gov.kh/).
3. Copy `.env.example` to `.env` (local) or add the same variables in Vercel > Settings > Environment Variables.
   `BAKONG_ACCOUNT_ID` must be YOUR OWN Bakong ID (format `name@bank`). For ABA also set ACCOUNT_INFO_KHR, ACCOUNT_INFO_USD and ACQUIRING_BANK.

## Run in Termux
```bash
npm install
npx vercel dev
```

## Deploy
Push to GitHub, import in Vercel (framework: Other), add the environment variables, deploy.

## Notes
- A deposit becomes PAID only after Bakong returns a transaction matching its md5, amount, currency and receiver. It never trusts the browser.
- Bakong's API may only accept requests from Cambodian IPs. If checks fail from Vercel, test with a Cambodia-based server/proxy.
- This app only records PAID status. Crediting a user balance is not included; do it server-side only when `newlyPaid` is true.
- Test with a tiny amount (e.g. 100 KHR) before real use. Never put the API token in frontend code.
