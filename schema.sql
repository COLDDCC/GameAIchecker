-- Cloudflare D1 schema for anonymous game feedback.
-- Run: npx wrangler d1 execute gameaichecker-feedback --remote --file=./schema.sql
CREATE TABLE IF NOT EXISTS game_feedback (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 game_key TEXT NOT NULL,
 vote TEXT NOT NULL CHECK(vote IN ('no_ai_suspected','some_ai_suspected','heavy_ai_suspected','all_ai_suspected')),
 visitor_hash TEXT NOT NULL,
 comment TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(game_key,visitor_hash)
);
CREATE INDEX IF NOT EXISTS idx_game_feedback_game_vote ON game_feedback(game_key,vote);
