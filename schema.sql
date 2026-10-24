CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'KHR')),
  qr_payload TEXT NOT NULL,
  md5 TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS deposits_created_at_idx ON deposits (created_at DESC);
