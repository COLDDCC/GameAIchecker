-- Cloudflare D1 schema for anonymous game feedback.
-- The Pages Function creates and migrates this table automatically on first
-- request, so running this file is optional. To run it manually:
--   npx wrangler d1 execute gameaichecker-feedback --remote --file=./schema.sql
-- For an existing database created from the old schema, the function adds the
-- ip_hash / updated_at / flagged columns itself.
CREATE TABLE IF NOT EXISTS game_feedback (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 game_key TEXT NOT NULL,
 vote TEXT NOT NULL CHECK(vote IN ('no_ai_suspected','some_ai_suspected','heavy_ai_suspected','all_ai_suspected')),
 visitor_hash TEXT NOT NULL,          -- HMAC of an anonymous per-browser id (prefixed "v:")
 comment TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ip_hash TEXT,                        -- HMAC of the network address, used only for rate limiting
 updated_at TEXT,
 flagged INTEGER NOT NULL DEFAULT 0,  -- 1 = over the per-network limit; excluded from public counts
 UNIQUE(game_key,visitor_hash)
);
CREATE INDEX IF NOT EXISTS idx_game_feedback_game_vote ON game_feedback(game_key,vote);
-- idx_game_feedback_ip (ip_hash, created_at) is created by the function after migration.
