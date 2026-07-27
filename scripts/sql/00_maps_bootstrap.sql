-- Multi-map bootstrap: create maps + backfill map_id = 1
-- Safe to run before/after drizzle-kit push if columns already partially exist.

CREATE TABLE IF NOT EXISTS maps (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  size INTEGER NOT NULL DEFAULT 8000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS maps_slug_unique ON maps (slug);

INSERT INTO maps (id, slug, name, seed, size)
VALUES (1, 'horizon', 'Gridhorizon', 424242, 8000)
ON CONFLICT (id) DO NOTHING;

-- Keep display column aligned with code constant (gameplay uses MAP_SIZE, not this column)
UPDATE maps SET size = 8000 WHERE id = 1 AND size <> 8000;

SELECT setval(pg_get_serial_sequence('maps', 'id'), GREATEST(1, (SELECT MAX(id) FROM maps)));
