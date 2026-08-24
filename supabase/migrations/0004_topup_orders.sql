-- Topup orders table for tracking Sumopod payment flow.
-- Flow: user clicks buy → row inserted status=pending + payment URL created
--       → user pays via Sumopod → webhook receives PAID → row updated + credits added

CREATE TABLE IF NOT EXISTS topup_orders (
  id             TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rupiah         INTEGER NOT NULL,
  credits        INTEGER NOT NULL,
  credits_base   INTEGER NOT NULL DEFAULT 0,
  credits_bonus  INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'QRIS',
  payment_url    TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topup_orders_user_id ON topup_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_orders_status ON topup_orders(status);

ALTER TABLE topup_orders ENABLE ROW LEVEL SECURITY;

-- Users can see only their own orders
CREATE POLICY "topup_orders_select_own" ON topup_orders
  FOR SELECT USING (auth.uid() = user_id);

-- Only server (service role) can insert / update
CREATE POLICY "topup_orders_service_write" ON topup_orders
  FOR ALL USING (auth.role() = 'service_role');
