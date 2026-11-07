-- America's Equines Registrum database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS horses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_no TEXT UNIQUE,
  name TEXT NOT NULL,
  barn_name TEXT,
  breed TEXT,
  breed_other TEXT,
  color TEXT,
  color_other TEXT,
  sex TEXT,
  dob TEXT,
  height TEXT,
  markings TEXT,
  microchip TEXT,
  brand TEXT,
  location TEXT,
  allow_public INTEGER DEFAULT 1,
  photo1 TEXT,
  photo2 TEXT,
  optional_covenants TEXT DEFAULT '',
  owner_name TEXT,
  owner_email TEXT,
  owner_signature TEXT,
  owner_signed_at TEXT,
  owner_ip TEXT,
  status TEXT DEFAULT 'pending_payment',
  offering_cents INTEGER,
  stripe_session TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_horses_email ON horses(owner_email);
CREATE INDEX IF NOT EXISTS idx_horses_status ON horses(status);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horse_id INTEGER NOT NULL,
  transfer_type TEXT,
  prev_owner_name TEXT,
  prev_owner_email TEXT,
  new_owner_name TEXT,
  new_owner_email TEXT,
  approve_token TEXT UNIQUE,
  sign_token TEXT UNIQUE,
  status TEXT DEFAULT 'awaiting_owner',
  seller_confirmed INTEGER DEFAULT 0,
  approved_at TEXT,
  signed_name TEXT,
  signed_at TEXT,
  signed_ip TEXT,
  signed_agent TEXT,
  agreement_snapshot TEXT,
  stripe_session TEXT,
  paid_cents INTEGER,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transfers_horse ON transfers(horse_id);

CREATE TABLE IF NOT EXISTS ownership (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horse_id INTEGER NOT NULL,
  owner_name TEXT,
  owner_email TEXT,
  start_at TEXT DEFAULT (datetime('now')),
  end_at TEXT,
  transfer_id INTEGER
);

CREATE TABLE IF NOT EXISTS covenant_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horse_id INTEGER NOT NULL,
  covenant_no INTEGER NOT NULL,
  added_by_name TEXT,
  added_by_email TEXT,
  signature TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mail (
  id TEXT PRIMARY KEY,
  to_list TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leases ( id INTEGER PRIMARY KEY AUTOINCREMENT, horse_id INTEGER NOT NULL, owner_name TEXT, owner_email TEXT, lessee_name TEXT, lessee_email TEXT, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'awaiting_owner', owner_token TEXT UNIQUE, sign_token TEXT UNIQUE, approved_at TEXT, signed_name TEXT, signed_at TEXT, signed_ip TEXT, signed_agent TEXT, agreement_snapshot TEXT, reminders_sent INTEGER DEFAULT 0, last_reminder_at TEXT, ended_at TEXT, ended_reason TEXT, created_at TEXT DEFAULT (datetime('now')) ); CREATE INDEX IF NOT EXISTS idx_leases_horse ON leases(horse_id);
