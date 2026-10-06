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

CREATE TABLE IF NOT EXISTS user_usage (
  client_id TEXT PRIMARY KEY,
  usage_count INTEGER DEFAULT 0,
  last_date TEXT
);

CREATE TABLE IF NOT EXISTS pro_tokens (
  token TEXT PRIMARY KEY,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
