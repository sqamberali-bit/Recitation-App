-- Recitation Sync — D1 schema
-- Run with: npx wrangler d1 execute recitation-sync --file=schema.sql

CREATE TABLE IF NOT EXISTS poems (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- full JSON of the Poem object (minus blobs)
  updated_at INTEGER NOT NULL,   -- epoch ms, for conflict resolution
  deleted_at INTEGER             -- non-null = tombstone
);

CREATE TABLE IF NOT EXISTS authors (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS collections (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_poems_updated ON poems(updated_at);
CREATE INDEX IF NOT EXISTS idx_authors_updated ON authors(updated_at);
CREATE INDEX IF NOT EXISTS idx_collections_updated ON collections(updated_at);
