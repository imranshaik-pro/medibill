CREATE TABLE auth_oauth_flows (
  state_hash TEXT PRIMARY KEY NOT NULL,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_oauth_expiry ON auth_oauth_flows(expires_at);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  google_subject TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_session_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_identity_links (
  google_subject TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  created_at INTEGER NOT NULL
);
