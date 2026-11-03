-- Access: capabilities an admin grants to members, and the second factor (TOTP) that guards sensitive writes.
CREATE TABLE access_grants (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  capability TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT
);

-- One live grant per user and capability; a revoked row stays as the record.
CREATE UNIQUE INDEX access_grants_live ON access_grants (user_id, capability) WHERE revoked_at IS NULL;

-- One F2A factor per user. The seed is AES-256-GCM sealed with the key in TABULA_KEY_FILE. `enabled` flips once the
-- first code checks out; `last_step` refuses a code that was already used.
CREATE TABLE f2a_factors (
  user_id INTEGER PRIMARY KEY REFERENCES users (id),
  secret_enc TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
