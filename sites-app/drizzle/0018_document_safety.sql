CREATE TABLE IF NOT EXISTS document_sequences (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL,
  prefix TEXT NOT NULL,
  last_value INTEGER NOT NULL CHECK(last_value >= 0),
  PRIMARY KEY (tenant_id, kind, prefix)
);
CREATE TABLE IF NOT EXISTS document_requests (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  request_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS document_requests_scope ON document_requests(tenant_id, user_id, kind, request_key);
