import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { BakongKHQR, khqrData, IndividualInfo } from "bakong-khqr";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { DATABASE_URL, BAKONG_ACCOUNT_ID, MERCHANT_NAME, MERCHANT_CITY } = process.env;
  if (!DATABASE_URL || !BAKONG_ACCOUNT_ID || BAKONG_ACCOUNT_ID.includes("your_name")) {
    return res.status(503).json({ error: "Server is not configured (DATABASE_URL / BAKONG_ACCOUNT_ID)." });
  }

  try {
    const amount = Number(req.body?.amount);
    const currency = String(req.body?.currency || "USD").toUpperCase();

    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ error: "Enter a valid amount." });
    }
    if (!["USD", "KHR"].includes(currency)) {
      return res.status(400).json({ error: "Currency must be USD or KHR." });
    }
    if (currency === "KHR" && !Number.isInteger(amount)) {
      return res.status(400).json({ error: "KHR amount must be a whole number." });
    }
    if (currency === "USD" && Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
      return res.status(400).json({ error: "USD amount can have at most 2 decimals." });
    }

    const minutes = Math.max(1, Number(process.env.QR_EXPIRE_MINUTES) || 10);
    const expiresAt = Date.now() + minutes * 60 * 1000;
    const id = randomUUID();

    // Banks like ABA share one Bakong ID for all customers; the customer's own
    // account number and bank name must be added so the money reaches the right person.
    const accountInformation = currency === "USD"
      ? process.env.ACCOUNT_INFO_USD
      : process.env.ACCOUNT_INFO_KHR;
    const acquiringBank = process.env.ACQUIRING_BANK;

    const optional = {
      currency: currency === "USD" ? khqrData.currency.usd : khqrData.currency.khr,
      amount,
      billNumber: id.replace(/-/g, "").slice(0, 20),
      expirationTimestamp: expiresAt
    };
    if (accountInformation) optional.accountInformation = accountInformation;
    if (acquiringBank) optional.acquiringBank = acquiringBank;

    const info = new IndividualInfo(
      BAKONG_ACCOUNT_ID,
      (MERCHANT_NAME || "Tra Deposit").slice(0, 25),
      (MERCHANT_CITY || "Phnom Penh").slice(0, 15),
      optional
    );

    const result = new BakongKHQR().generateIndividual(info);
    if (!result?.data?.qr || !result?.data?.md5) {
      console.error("KHQR generation failed", result?.status);
      return res.status(500).json({ error: "Could not generate KHQR." });
    }
    const { qr, md5 } = result.data;

    const sql = neon(DATABASE_URL);
    await sql`INSERT INTO deposits (id, amount, currency, qr_payload, md5, expires_at)
              VALUES (${id}, ${amount}, ${currency}, ${qr}, ${md5}, ${new Date(expiresAt).toISOString()})`;

    const qrImage = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
    return res.status(201).json({
      id, amount, currency, qrImage, status: "PENDING",
      expiresAt: new Date(expiresAt).toISOString()
    });
  } catch (error) {
    console.error("create-deposit error:", error);
    return res.status(500).json({ error: "Could not create deposit." });
  }
}
