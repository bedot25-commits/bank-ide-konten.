CREATE TABLE IF NOT EXISTS contents (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 niche TEXT DEFAULT '',
 audience TEXT DEFAULT '',
 goal TEXT DEFAULT '',
 script TEXT DEFAULT '',
 visual TEXT DEFAULT '',
 stage TEXT NOT NULL DEFAULT 'IDE',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contents_stage ON contents(stage);
