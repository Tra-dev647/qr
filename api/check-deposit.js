import { neon } from "@neondatabase/serverless";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const id = String(req.query?.id || "");
  if (!UUID.test(id)) return res.status(400).json({ error: "Invalid reference." });

  const { DATABASE_URL, BAKONG_API_TOKEN, BAKONG_ACCOUNT_ID } = process.env;
  if (!DATABASE_URL) return res.status(503).json({ error: "Server is not configured." });

  try {
    const sql = neon(DATABASE_URL);
    const rows = await sql`SELECT id, amount, currency, md5, status, expires_at, paid_at FROM deposits WHERE id = ${id}`;
    const d = rows[0];
    if (!d) return res.status(404).json({ error: "Deposit not found." });

    const out = (status, extra = {}) => res.status(200).json({
      id: d.id, amount: Number(d.amount), currency: d.currency, status, ...extra
    });

    if (d.status !== "PENDING") return out(d.status);

    const expired = new Date(d.expires_at).getTime() < Date.now();

    if (!BAKONG_API_TOKEN || BAKONG_API_TOKEN.includes("PASTE_YOUR")) {
      return res.status(503).json({ error: "Bakong API token is not configured." });
    }
    const base = (process.env.BAKONG_API_URL || "https://api-bakong.nbc.gov.kh").replace(/\/$/, "");

    let data;
    try {
      const upstream = await fetch(`${base}/v1/check_transaction_by_md5`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${BAKONG_API_TOKEN}` },
        body: JSON.stringify({ md5: d.md5 })
      });
      data = await upstream.json();
    } catch (e) {
      console.error("bakong check error", e);
      if (expired) {
        await sql`UPDATE deposits SET status = 'EXPIRED' WHERE id = ${id} AND status = 'PENDING'`;
        return out("EXPIRED");
      }
      return out("PENDING", { warning: "Could not reach Bakong. Retrying." });
    }

    const tx = data?.responseCode === 0 ? data.data : null;
    if (tx) {
      // Verify what was actually paid before marking PAID
      const okAmount = Math.abs(Number(tx.amount) - Number(d.amount)) < 0.005;
      const okCurrency = String(tx.currency || "").toUpperCase() === d.currency;
      // The md5 is derived from this exact QR (incl. receiver), so a match already
      // proves the receiver. Bank-specific toAccountId formats vary, so only log it.
      if (tx.toAccountId && tx.toAccountId !== BAKONG_ACCOUNT_ID) {
        console.log("note: toAccountId differs from BAKONG_ACCOUNT_ID", tx.toAccountId);
      }
      if (okAmount && okCurrency) {
        const upd = await sql`UPDATE deposits SET status = 'PAID', paid_at = NOW()
                              WHERE id = ${id} AND status = 'PENDING' RETURNING id`;
        return out("PAID", { newlyPaid: upd.length > 0 });
      }
      console.error("Payment mismatch for", id, { tx });
      await sql`UPDATE deposits SET status = 'FAILED' WHERE id = ${id} AND status = 'PENDING'`;
      return out("FAILED");
    }

    if (expired) {
      await sql`UPDATE deposits SET status = 'EXPIRED' WHERE id = ${id} AND status = 'PENDING'`;
      return out("EXPIRED");
    }
    return out("PENDING", { expiresAt: new Date(d.expires_at).toISOString() });
  } catch (error) {
    console.error("check-deposit error:", error);
    return res.status(500).json({ error: "Could not check deposit." });
  }
}
