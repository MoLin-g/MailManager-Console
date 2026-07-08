var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var net = require("net");
var tls = require("tls");
var crypto = require("crypto");
var Database = require("better-sqlite3");

var PORT = parseInt(process.env.PORT || "8009", 10);
var HOST = process.env.HOST || "127.0.0.1";
var ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
var DATA_KEY = process.env.DATA_KEY || "dev-only-change-me";
var DEFAULT_REGISTRATION_ENABLED = String(process.env.REGISTRATION_ENABLED || "false").toLowerCase() === "true";
var DATA_DIR = path.join(__dirname, "data");
var DB_FILE = path.join(DATA_DIR, "mail-admin.sqlite");
var OLD_JSON_FILE = path.join(DATA_DIR, "db.json");
var PUBLIC_DIR = path.join(__dirname, "public");
var GRAPH_TOKEN_SCOPES = "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read";
var STARTED_AT = new Date().toISOString();

var db;
var sessions = {};
var loginFailures = {};
var registerFailures = {};
var scanStates = {};
var gptRefreshStates = {};
var deliveryStates = {};

function emptyScanState() {
  return { running: false, stop: false, total: 0, done: 0, safe: 0, used: 0, plus: 0, invalid: 0, errors: 0, log: "" };
}

function initDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email TEXT NOT NULL, password TEXT NOT NULL DEFAULT '', client_id TEXT NOT NULL, refresh_token_enc TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', category TEXT NOT NULL DEFAULT 'new', reason TEXT NOT NULL DEFAULT '', message_count INTEGER NOT NULL DEFAULT 0, last_messages TEXT NOT NULL DEFAULT '[]', last_scan_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, email), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS invites (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, max_uses INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL DEFAULT '', disabled INTEGER NOT NULL DEFAULT 0, created_by INTEGER NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL DEFAULT '', FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS mail_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, base_keywords TEXT NOT NULL DEFAULT '[]', rules TEXT NOT NULL DEFAULT '[]', fallback_category TEXT NOT NULL DEFAULT 'matched', no_match_category TEXT NOT NULL DEFAULT 'safe', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE); CREATE INDEX IF NOT EXISTS idx_accounts_user_status ON accounts(user_id, status); CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code); CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id); CREATE INDEX IF NOT EXISTS idx_mail_rules_user ON mail_rules(user_id);");
  addColumnIfMissing("accounts", "category", "TEXT NOT NULL DEFAULT 'new'");
  db.exec("CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, username TEXT NOT NULL, role TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS api_key_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, api_key_id INTEGER NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS mail_query_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email TEXT NOT NULL, token TEXT NOT NULL UNIQUE, keyword TEXT NOT NULL DEFAULT '', max_age_seconds INTEGER NOT NULL DEFAULT 300, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL DEFAULT '', UNIQUE(user_id,email), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  addColumnIfMissing("users", "disabled", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("users", "last_login_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("accounts", "used", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("accounts", "reserved", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("accounts", "lease_token", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("accounts", "lease_expires_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("accounts", "reserved_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("accounts", "used_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("accounts", "code_health", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing("accounts", "code_poll_count", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("accounts", "code_first_poll_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("accounts", "last_code_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("accounts", "provider", "TEXT NOT NULL DEFAULT 'outlook'");
  addColumnIfMissing("gpt_accounts", "wenas_status", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "wenas_sync_status", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "wenas_card_secret_id", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "wenas_batch_no", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "wenas_sync_error", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "livecheck_status", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "livecheck_result", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "livecheck_message", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "livecheck_checked_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("gpt_accounts", "wenas_check_task_id", "TEXT NOT NULL DEFAULT ''");
  db.prepare("UPDATE accounts SET code_health='unknown' WHERE code_health IS NULL OR code_health=''").run();
  db.exec("CREATE TABLE IF NOT EXISTS api_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', ok INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS gpt_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, dedupe_key TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', bind_email TEXT NOT NULL DEFAULT '', password TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', proxy TEXT NOT NULL DEFAULT '', batch_id TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT 'success', status TEXT NOT NULL DEFAULT 'pending_export', stage TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT '', account_id TEXT NOT NULL DEFAULT '', sub2_group TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', error_category TEXT NOT NULL DEFAULT 'none', tokens TEXT NOT NULL DEFAULT '{}', auth_file TEXT NOT NULL DEFAULT '{}', raw_payload TEXT NOT NULL DEFAULT '{}', export_count INTEGER NOT NULL DEFAULT 0, last_export_at TEXT NOT NULL DEFAULT '', refresh_status TEXT NOT NULL DEFAULT '', last_refresh_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,dedupe_key), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS gpt_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, account_id INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS gpt_error_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '[]', severity TEXT NOT NULL DEFAULT 'warning', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS phone_code_pool (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, provider TEXT NOT NULL DEFAULT '', phone_number TEXT NOT NULL DEFAULT '', api_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'available', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS gpt_exports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, format TEXT NOT NULL, account_ids TEXT NOT NULL DEFAULT '[]', count INTEGER NOT NULL DEFAULT 0, filename TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS gpt_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, account_id INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE TABLE IF NOT EXISTS wenas_configs (user_id INTEGER PRIMARY KEY, config TEXT NOT NULL DEFAULT '{}', configured INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_accounts_user_category ON accounts(user_id, category);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_accounts_user_used ON accounts(user_id, used, reserved, category);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_api_key_logs_user_created ON api_key_logs(user_id, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_mail_query_links_token ON mail_query_links(token);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_gpt_accounts_user_status ON gpt_accounts(user_id, status);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_gpt_events_user_created ON gpt_events(user_id, created_at);");
  db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(new Date().toISOString());
  if (!getSetting("registration_enabled")) setSetting("registration_enabled", DEFAULT_REGISTRATION_ENABLED ? "true" : "false");
  var admin = getUserByUsername(ADMIN_USERNAME);
  if (!admin) createUser(ADMIN_USERNAME, ADMIN_PASSWORD, "admin");
  migrateJsonIfNeeded();
}

function addColumnIfMissing(table, column, definition) {
  var cols = db.prepare("PRAGMA table_info(" + table + ")").all().map(function(c) { return c.name; });
  if (cols.indexOf(column) < 0) db.exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
}

function migrateJsonIfNeeded() {
  if (!fs.existsSync(OLD_JSON_FILE)) return;
  if (db.prepare("SELECT COUNT(*) AS c FROM accounts").get().c > 0) return;
  var old;
  try { old = JSON.parse(fs.readFileSync(OLD_JSON_FILE, "utf8")); } catch (e) { return; }
  if (!old || !Array.isArray(old.accounts) || old.accounts.length === 0) return;
  var admin = getUserByUsername(ADMIN_USERNAME) || createUser(ADMIN_USERNAME, ADMIN_PASSWORD, "admin");
  var insert = db.prepare("INSERT OR IGNORE INTO accounts (user_id,email,password,client_id,refresh_token_enc,tag,status,category,reason,message_count,last_messages,last_scan_at,created_at,updated_at) VALUES (@user_id,@email,@password,@client_id,@refresh_token_enc,@tag,@status,@category,@reason,@message_count,@last_messages,@last_scan_at,@created_at,@updated_at)");
  var tx = db.transaction(function(accounts) {
    accounts.forEach(function(acc) {
      if (!acc.email || !acc.client_id || !acc.refresh_token_enc) return;
      insert.run({ user_id: acc.user_id || admin.id, email: acc.email, password: acc.password || "", client_id: acc.client_id, refresh_token_enc: acc.refresh_token_enc, tag: acc.tag || "", status: acc.status || "new", category: acc.category || acc.status || "new", reason: acc.reason || "", message_count: acc.message_count || 0, last_messages: JSON.stringify(acc.last_messages || []), last_scan_at: acc.last_scan_at || "", created_at: acc.created_at || new Date().toISOString(), updated_at: acc.updated_at || new Date().toISOString() });
    });
  });
  tx(old.accounts);
}

function encryptionKey() { return crypto.createHash("sha256").update(DATA_KEY).digest(); }

function encrypt(text) {
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  var encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

function decrypt(value) {
  var parts = String(value || "").split(":");
  if (parts.length !== 3) throw new Error("bad encrypted token");
  var decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[0], "base64"));
  decipher.setAuthTag(Buffer.from(parts[1], "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64")), decipher.final()]).toString("utf8");
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password || ""), salt, 120000, 32, "sha256").toString("base64");
}

function verifyPassword(user, password) {
  var a = Buffer.from(hashPassword(password, user.password_salt || ""));
  var b = Buffer.from(user.password_hash || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createUser(username, password, role) {
  username = String(username || "").trim();
  if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(username)) throw new Error("bad username");
  if (String(password || "").length < 8) throw new Error("password too short");
  var salt = crypto.randomBytes(16).toString("base64");
  var now = new Date().toISOString();
  var info = db.prepare("INSERT INTO users (username,password_salt,password_hash,role,created_at) VALUES (?,?,?,?,?)").run(username, salt, hashPassword(password, salt), role || "user", now);
  return db.prepare("SELECT id,username,role,created_at FROM users WHERE id=?").get(info.lastInsertRowid);
}

function getSetting(key) {
  var row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? row.value : "";
}

function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value));
}

function registrationEnabled() {
  return getSetting("registration_enabled") === "true";
}

function isAdmin(session) {
  return session && session.role === "admin";
}

function publicInvite(inv) {
  return { id: inv.id, code: inv.code, max_uses: inv.max_uses, used_count: inv.used_count, expires_at: inv.expires_at || "", disabled: !!inv.disabled, created_by: inv.created_by, created_at: inv.created_at };
}

function createInvite(createdBy, maxUses, ttlHours) {
  maxUses = Math.max(1, Math.min(1000, parseInt(maxUses || 1, 10)));
  ttlHours = Math.max(1, Math.min(8760, parseInt(ttlHours || 24, 10)));
  var code = crypto.randomBytes(18).toString("base64url");
  var now = new Date();
  var expires = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
  var info = db.prepare("INSERT INTO invites (code,max_uses,used_count,expires_at,disabled,created_by,created_at) VALUES (?,?,?,?,?,?,?)").run(code, maxUses, 0, expires, 0, createdBy, now.toISOString());
  return db.prepare("SELECT * FROM invites WHERE id=?").get(info.lastInsertRowid);
}

function consumeInvite(code) {
  code = String(code || "").replace(/\s+/g, "");
  var now = new Date().toISOString();
  var inv = db.prepare("SELECT * FROM invites WHERE code=?").get(code);
  if (!inv) throw new Error("invite code not found");
  if (inv.disabled) throw new Error("invite code disabled");
  if (inv.used_count >= inv.max_uses) throw new Error("invite code used up");
  if (inv.expires_at && inv.expires_at <= now) throw new Error("invite code expired");
  db.prepare("UPDATE invites SET used_count=used_count+1 WHERE id=?").run(inv.id);
  return inv;
}

function hashApiKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("base64");
}

function createApiKey(userId, name) {
  var raw = "mak_" + crypto.randomBytes(32).toString("base64url");
  var now = new Date().toISOString();
  var prefix = raw.substring(0, 12);
  var info = db.prepare("INSERT INTO api_keys (user_id,name,key_hash,prefix,disabled,created_at,last_used_at) VALUES (?,?,?,?,?,?,?)").run(userId, String(name || "API Key").trim().substring(0, 80), hashApiKey(raw), prefix, 0, now, "");
  return { id: info.lastInsertRowid, name: name || "API Key", key: raw, prefix: prefix, created_at: now };
}

function publicApiKey(row) {
  return { id: row.id, name: row.name, prefix: row.prefix, disabled: !!row.disabled, created_at: row.created_at, last_used_at: row.last_used_at || "" };
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; }
}

function firstNonEmpty() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function stmtGet(sql, args) { var stmt = db.prepare(sql); return stmt.get.apply(stmt, args || []); }
function stmtAll(sql, args) { var stmt = db.prepare(sql); return stmt.all.apply(stmt, args || []); }
function stmtRun(sql, args) { var stmt = db.prepare(sql); return stmt.run.apply(stmt, args || []); }

function logEvent(userId, action, target, detail, ok) {
  try {
    db.prepare("INSERT INTO api_events (user_id,action,target,detail,ok,created_at) VALUES (?,?,?,?,?,?)").run(userId, String(action || ""), String(target || "").substring(0, 220), String(detail || "").substring(0, 500), ok === false ? 0 : 1, new Date().toISOString());
    db.prepare("DELETE FROM api_events WHERE id NOT IN (SELECT id FROM api_events WHERE user_id=? ORDER BY id DESC LIMIT 300)").run(userId);
  } catch (e) {}
}

function logGptEvent(userId, accountId, type, title, detail) {
  try {
    db.prepare("INSERT INTO gpt_events (user_id,account_id,type,title,detail,created_at) VALUES (?,?,?,?,?,?)").run(userId, accountId || 0, String(type || ""), String(title || "").substring(0, 180), typeof detail === "string" ? detail : JSON.stringify(detail || {}), new Date().toISOString());
    db.prepare("DELETE FROM gpt_events WHERE id NOT IN (SELECT id FROM gpt_events WHERE user_id=? ORDER BY id DESC LIMIT 500)").run(userId);
  } catch (e) {}
}

function truthyParam(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function publicUser(row) {
  return { id: row.id, username: row.username, role: row.role || "user", disabled: !!row.disabled, created_at: row.created_at || "", last_login_at: row.last_login_at || "", account_count: row.account_count || 0, api_key_count: row.api_key_count || 0 };
}

function accountSelectableWhere(url, includeSearch) {
  var where = "user_id=?";
  var args = [];
  var category = url.searchParams.get("category") || "";
  var status = url.searchParams.get("status") || "";
  var search = String(url.searchParams.get("search") || "").trim();
  var includeUsed = truthyParam(url.searchParams.get("include_used"));
  var includeReserved = truthyParam(url.searchParams.get("include_reserved"));
  var includeUnhealthy = truthyParam(url.searchParams.get("include_unhealthy")) || category === "no_code";
  var usedOnly = truthyParam(url.searchParams.get("used"));
  var unused = truthyParam(url.searchParams.get("unused"));
  var takeable = truthyParam(url.searchParams.get("takeable"));
  if (category) { where += " AND category=?"; args.push(category); }
  if (status) { where += " AND status=?"; args.push(status); }
  if (usedOnly) where += " AND used=1";
  if (unused) where += " AND used=0";
  if (takeable) where += " AND used=0 AND reserved=0 AND status NOT IN ('invalid','error','no_code')";
  if (!includeUsed && !usedOnly) where += " AND used=0";
  if (!includeReserved) where += " AND reserved=0";
  if (!includeUnhealthy) where += " AND COALESCE(code_health,'unknown') NOT IN ('no_code','blocked','unhealthy') AND category!='no_code'";
  if (includeSearch && search) { where += " AND (email LIKE ? OR tag LIKE ? OR reason LIKE ?)"; args.push("%" + search + "%", "%" + search + "%", "%" + search + "%"); }
  return { where: where, args: args, search: search };
}

function publicAccountExtended(acc) {
  var base = publicAccount(acc);
  base.used = !!acc.used;
  base.reserved = !!acc.reserved;
  base.code_health = acc.code_health || "unknown";
  base.code_poll_count = acc.code_poll_count || 0;
  base.provider = acc.provider || "outlook";
  base.lease_expires_at = acc.lease_expires_at || "";
  return base;
}

function releaseExpiredLeases(userId) {
  var now = new Date().toISOString();
  db.prepare("UPDATE accounts SET reserved=0, lease_token='', lease_expires_at='', updated_at=? WHERE user_id=? AND reserved=1 AND lease_expires_at!='' AND lease_expires_at<=? AND used=0").run(now, userId, now);
}

function reserveMailbox(userId, body) {
  releaseExpiredLeases(userId);
  var category = String(body.category || "").trim();
  var status = String(body.status || "").trim();
  var consume = body.consume !== false;
  var leaseSeconds = Math.max(60, Math.min(86400, parseInt(body.lease_seconds || 1800, 10)));
  function takeableQuery(includeCategory) {
    var where = "user_id=? AND used=0 AND reserved=0 AND COALESCE(code_health,'unknown') NOT IN ('no_code','blocked','unhealthy') AND category!='no_code' AND status NOT IN ('invalid','error','no_code')";
    var args = [userId];
    if (includeCategory && category) { where += " AND category=?"; args.push(category); }
    if (status) { where += " AND status=?"; args.push(status); }
    return { where: where, args: args };
  }
  var tx = db.transaction(function() {
    var query = takeableQuery(!!category);
    var acc = stmtGet("SELECT * FROM accounts WHERE " + query.where + " ORDER BY last_scan_at DESC, id ASC LIMIT 1", query.args);
    if (!acc && (!category || category.toLowerCase() === "safe")) {
      query = takeableQuery(false);
      acc = stmtGet("SELECT * FROM accounts WHERE " + query.where + " ORDER BY last_scan_at DESC, id ASC LIMIT 1", query.args);
    }
    if (!acc) return null;
    var now = new Date().toISOString();
    if (consume) {
      db.prepare("UPDATE accounts SET used=1,reserved=0,lease_token='',lease_expires_at='',reserved_at=?,used_at=?,status='used',category='used',updated_at=? WHERE id=? AND user_id=?").run(now, now, now, acc.id, userId);
      acc.used = 1; acc.reserved = 0; acc.status = "used"; acc.category = "used"; acc.used_at = now; acc.reserved_at = now;
      return { account: acc, lease_token: "", consumed: true };
    }
    var leaseToken = crypto.randomBytes(18).toString("base64url");
    var expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    db.prepare("UPDATE accounts SET reserved=1,lease_token=?,lease_expires_at=?,reserved_at=?,updated_at=? WHERE id=? AND user_id=?").run(leaseToken, expiresAt, now, now, acc.id, userId);
    acc.reserved = 1; acc.lease_token = leaseToken; acc.lease_expires_at = expiresAt; acc.reserved_at = now;
    return { account: acc, lease_token: leaseToken, consumed: false };
  });
  var out = tx();
  if (!out) return { ok: true, mailbox: null, email: "", reason: "no_available", error: "no available mailbox" };
  logEvent(userId, "reserve", out.account.email, out.consumed ? "consume=true" : "lease");
  var mailbox = publicAccountExtended(out.account);
  if (out.lease_token) mailbox.lease_token = out.lease_token;
  return { ok: true, email: out.account.email, consumed: out.consumed, lease_token: out.lease_token, mailbox: mailbox };
}

function markMailboxUsed(userId, email, leaseToken) {
  var acc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(userId, String(email || "").trim());
  if (!acc) return { ok: false, error: "account not found" };
  if (acc.lease_token && leaseToken && acc.lease_token !== leaseToken) return { ok: false, error: "bad lease token" };
  var now = new Date().toISOString();
  db.prepare("UPDATE accounts SET used=1,reserved=0,lease_token='',lease_expires_at='',status='used',category='used',used_at=?,updated_at=? WHERE id=? AND user_id=?").run(now, now, acc.id, userId);
  logEvent(userId, "mark-used", acc.email, "");
  return { ok: true, email: acc.email, mailbox: publicAccountExtended(db.prepare("SELECT * FROM accounts WHERE id=?").get(acc.id)) };
}

function releaseMailbox(userId, email, leaseToken) {
  var acc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(userId, String(email || "").trim());
  if (!acc) return { ok: false, error: "account not found" };
  if (acc.lease_token && leaseToken && acc.lease_token !== leaseToken) return { ok: false, error: "bad lease token" };
  var now = new Date().toISOString();
  db.prepare("UPDATE accounts SET reserved=0,lease_token='',lease_expires_at='',updated_at=? WHERE id=? AND user_id=?").run(now, acc.id, userId);
  logEvent(userId, "release", acc.email, "");
  return { ok: true, email: acc.email, mailbox: publicAccountExtended(db.prepare("SELECT * FROM accounts WHERE id=?").get(acc.id)) };
}

function classifyGptError(error) {
  var text = (typeof error === "string" ? error : JSON.stringify(error || {})).toLowerCase();
  if (!text) return "none";
  if (/code|验证码|otp|mail|email/.test(text)) return "code";
  if (/proxy|connect|timeout|network/.test(text)) return "proxy";
  if (/risk|verify|captcha|blocked|ban/.test(text)) return "risk";
  if (/token|refresh|401|unauthor/.test(text)) return "token";
  if (/sub2/.test(text)) return "sub2";
  if (/cpa|auth/.test(text)) return "cpa";
  return "unknown";
}

function gptStatusForResult(result) {
  result = String(result || "success");
  if (result === "failed") return "failed";
  if (result === "partial") return "exception";
  return "pending_export";
}

function normalizeGptPayload(payload, defaults) {
  defaults = defaults || {};
  payload = payload || {};
  var account = payload.account || {};
  var tokens = payload.tokens || {};
  ["refresh_token", "access_token", "id_token", "session_token"].forEach(function(key) {
    if (payload[key] && !tokens[key]) tokens[key] = payload[key];
  });
  var chatgpt = payload.chatgpt || {};
  var sub2 = payload.sub2 || {};
  var cpa = payload.cpa || {};
  var authFile = payload.auth_file || cpa.auth_file || {};
  ["refresh_token", "access_token", "id_token", "session_token", "chatgpt_account_id", "chatgpt_plan_type"].forEach(function(key) {
    if (payload[key] && !authFile[key]) authFile[key] = payload[key];
  });
  var email = String(account.email || payload.login_email || payload.account_email || payload.email || "").trim();
  var bindEmail = String(payload.bind_email || payload.mailbox || (account.email && payload.email ? payload.email : "") || "").trim();
  var result = String(payload.result || defaults.result || "success");
  var dedupe = String(payload.dedupe_key || defaults.dedupe_key || [defaults.batch_id || account.batch_id || "", email || bindEmail].filter(Boolean).join(":") || crypto.randomBytes(12).toString("base64url")).trim();
  return {
    dedupe_key: dedupe,
    email: email || bindEmail,
    bind_email: bindEmail,
    password: String(account.password || payload.password || defaults.password || ""),
    phone: String(account.phone || payload.phone || ""),
    proxy: String(account.proxy || payload.proxy || defaults.proxy || ""),
    batch_id: String(account.batch_id || payload.batch_id || defaults.batch_id || ""),
    result: result,
    status: String(payload.status || gptStatusForResult(result)),
    stage: String(payload.stage || defaults.stage || "manual_import"),
    plan: String(chatgpt.plan || payload.chatgpt_plan_type || payload.plan || ""),
    account_id: String(chatgpt.account_id || payload.chatgpt_account_id || authFile.chatgpt_account_id || authFile.account_id || ""),
    sub2_group: String(sub2.group || payload.sub2_group || defaults.sub2_group || ""),
    error: typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error || {}),
    error_category: classifyGptError(payload.error),
    tokens: JSON.stringify(tokens || {}),
    auth_file: JSON.stringify(authFile || {}),
    raw_payload: JSON.stringify(payload || {})
  };
}

function saveGptAccount(userId, payload, defaults) {
  var row = normalizeGptPayload(payload, defaults);
  var now = new Date().toISOString();
  var existing = db.prepare("SELECT id FROM gpt_accounts WHERE user_id=? AND dedupe_key=?").get(userId, row.dedupe_key);
  if (existing) {
    db.prepare("UPDATE gpt_accounts SET email=?,bind_email=?,password=?,phone=?,proxy=?,batch_id=?,result=?,status=?,stage=?,plan=?,account_id=?,sub2_group=?,error=?,error_category=?,tokens=?,auth_file=?,raw_payload=?,updated_at=? WHERE id=? AND user_id=?").run(row.email, row.bind_email, row.password, row.phone, row.proxy, row.batch_id, row.result, row.status, row.stage, row.plan, row.account_id, row.sub2_group, row.error, row.error_category, row.tokens, row.auth_file, row.raw_payload, now, existing.id, userId);
    logGptEvent(userId, existing.id, "upsert", "GPT account updated", row.raw_payload);
    return { id: existing.id, created: false, status: row.status, error_category: row.error_category };
  }
  var info = db.prepare("INSERT INTO gpt_accounts (user_id,dedupe_key,email,bind_email,password,phone,proxy,batch_id,result,status,stage,plan,account_id,sub2_group,error,error_category,tokens,auth_file,raw_payload,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(userId, row.dedupe_key, row.email, row.bind_email, row.password, row.phone, row.proxy, row.batch_id, row.result, row.status, row.stage, row.plan, row.account_id, row.sub2_group, row.error, row.error_category, row.tokens, row.auth_file, row.raw_payload, now, now);
  logGptEvent(userId, info.lastInsertRowid, "create", "GPT account created", row.raw_payload);
  return { id: info.lastInsertRowid, created: true, status: row.status, error_category: row.error_category };
}

function publicGptAccount(row) {
  var tokens = parseJson(row.tokens, {});
  var authFile = parseJson(row.auth_file, {});
  var raw = parseJson(row.raw_payload, {});
  var sub2 = firstNonEmpty(row.sub2api_id, row.sub2_group, raw.sub2api_id, raw.sub2_id, raw.sub2api && raw.sub2api.id, raw.sub2api && raw.sub2api.name, authFile.sub2api_id, authFile.id);
  var plan = firstNonEmpty(row.plan, row.chatgpt_plan_type, authFile.chatgpt_plan_type, authFile.plan_type, authFile.plan, raw.chatgpt_plan_type, raw.plan_type, raw.plan, tokens.chatgpt_plan_type);
  var hasAuthFile = authFile && typeof authFile === "object" && Object.keys(authFile).length > 0;
  return {
    id: row.id, dedupe_key: row.dedupe_key, email: row.email, bind_email: row.bind_email, password: row.password,
    phone: row.phone, proxy: row.proxy, batch_id: row.batch_id, result: row.result, status: row.status,
    stage: row.stage, plan: row.plan, account_id: row.account_id, sub2_group: row.sub2_group,
    error: row.error, error_category: row.error_category, tokens: tokens, auth_file: authFile,
    export_count: row.export_count, last_export_at: row.last_export_at, refresh_status: row.refresh_status,
    last_refresh_at: row.last_refresh_at, created_at: row.created_at, updated_at: row.updated_at,
    exported_at: row.last_export_at || "",
    export_format: row.export_format || raw.export_format || raw.last_export_format || "",
    cpa_ready: hasAuthFile,
    cpa_missing_reason: hasAuthFile ? "" : "missing auth_file",
    sub2api_id: sub2,
    chatgpt_plan_type: plan,
    fail_reason: row.fail_reason || row.error || "",
    wenas_status: row.wenas_status || "",
    wenas_sync_status: row.wenas_sync_status || "",
    wenas_card_secret_id: row.wenas_card_secret_id || "",
    wenas_batch_no: row.wenas_batch_no || "",
    wenas_sync_error: row.wenas_sync_error || "",
    livecheck_status: row.livecheck_status || "",
    livecheck_result: row.livecheck_result || "",
    livecheck_message: row.livecheck_message || "",
    livecheck_checked_at: row.livecheck_checked_at || "",
    wenas_check_task_id: row.wenas_check_task_id || "",
    raw_payload: row.raw_payload || "{}",
    raw_payload_json: raw
  };
}

function parseGptImportText(text, defaults) {
  text = String(text || "").trim();
  if (!text) return [];
  var parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {}
  var rows = [];
  if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && typeof parsed === "object") rows = [parsed];
  else rows = text.split(/[\r\n]+/).map(function(line) {
    var parts = line.split("----");
    if (parts.length < 1 || !parts[0].trim()) return null;
    return { account: { email: parts[0].trim(), password: parts[1] || "", proxy: defaults.proxy || "", batch_id: defaults.batch_id || "" }, tokens: { refresh_token: parts[2] || "", access_token: parts[3] || "", id_token: parts[4] || "", session_token: parts[5] || "" }, auth_file: { email: parts[0].trim(), refresh_token: parts[2] || "", access_token: parts[3] || "", id_token: parts[4] || "", session_token: parts[5] || "" }, result: defaults.result || "success" };
  }).filter(Boolean);
  return rows;
}

function markGptAccountsExported(userId, ids, format, exportedAt) {
  ids.forEach(function(id) {
    var row = db.prepare("SELECT raw_payload FROM gpt_accounts WHERE id=? AND user_id=?").get(id, userId);
    if (!row) return;
    var raw = parseJson(row.raw_payload, {});
    raw.export_format = format;
    raw.last_export_format = format;
    raw.exported_at = exportedAt;
    db.prepare("UPDATE gpt_accounts SET status='exported', export_count=export_count+1,last_export_at=?,raw_payload=?,updated_at=? WHERE user_id=? AND id=?").run(exportedAt, JSON.stringify(raw), exportedAt, userId, id);
  });
}

function gptListResponse(userId, url) {
  var page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  var limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "20", 10)));
  var offset = (page - 1) * limit;
  var where = "user_id=?";
  var args = [userId];
  [["status", "status"], ["result", "result"]].forEach(function(pair) {
    var v = String(url.searchParams.get(pair[0]) || "").trim();
    if (v) { where += " AND " + pair[1] + "=?"; args.push(v); }
  });
  var exportState = String(url.searchParams.get("export") || "").trim();
  if (exportState === "exported") where += " AND (export_count>0 OR status='exported' OR last_export_at!='')";
  else if (exportState === "pending" || exportState === "unexported") where += " AND export_count=0 AND status!='exported' AND last_export_at=''";
  else if (exportState === "archived") where += " AND status='archived'";
  else if (exportState === "cpa") where += " AND export_count>0 AND raw_payload LIKE '%\"export_format\":\"cpa\"%'";
  else if (exportState === "sub2") where += " AND export_count>0 AND (raw_payload LIKE '%\"export_format\":\"sub2%' OR sub2_group!='')";
  var source = String(url.searchParams.get("source") || "").trim();
  if (source) {
    var sourceLike = "%" + source + "%";
    where += " AND (stage LIKE ? OR raw_payload LIKE ? OR batch_id LIKE ? OR dedupe_key LIKE ?)";
    args.push(sourceLike, sourceLike, sourceLike, sourceLike);
  }
  var search = String(url.searchParams.get("search") || "").trim();
  if (search) { where += " AND (email LIKE ? OR bind_email LIKE ? OR batch_id LIKE ? OR error LIKE ?)"; args.push("%" + search + "%", "%" + search + "%", "%" + search + "%", "%" + search + "%"); }
  var total = stmtGet("SELECT COUNT(*) AS c FROM gpt_accounts WHERE " + where, args).c;
  var rows = stmtAll("SELECT * FROM gpt_accounts WHERE " + where + " ORDER BY id DESC LIMIT ? OFFSET ?", args.concat([limit, offset])).map(publicGptAccount);
  var counts = db.prepare("SELECT status, COUNT(*) AS count FROM gpt_accounts WHERE user_id=? GROUP BY status").all(userId);
  var resultCounts = db.prepare("SELECT result, COUNT(*) AS count FROM gpt_accounts WHERE user_id=? GROUP BY result").all(userId);
  return { ok: true, accounts: rows, total: total, page: page, limit: limit, counts: counts, result_counts: resultCounts };
}

function crc32(buffer) {
  var table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
  }
  var crc = 0xffffffff;
  for (var k = 0; k < buffer.length; k++) crc = table[(crc ^ buffer[k]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  var d = date || new Date();
  var time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  var day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time, date: day };
}

function makeZip(files) {
  var localParts = [];
  var centralParts = [];
  var offset = 0;
  files.forEach(function(file) {
    var name = Buffer.from(file.name, "utf8");
    var data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data || ""), "utf8");
    var crc = crc32(data);
    var dt = dosDateTime(new Date());
    var local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dt.time, 10);
    local.writeUInt16LE(dt.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);
    var central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dt.time, 12);
    central.writeUInt16LE(dt.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  });
  var centralSize = centralParts.reduce(function(n, b) { return n + b.length; }, 0);
  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat(localParts.concat(centralParts, [end]));
}

function sendZip(res, filename, files) {
  var zip = makeZip(files);
  res.writeHead(200, securityHeaders({ "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=\"" + filename + "\"", "Content-Length": zip.length, "Cache-Control": "no-store" }));
  res.end(zip);
}

function csvEscape(value) {
  var s = String(value == null ? "" : value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function selectedIds(body) {
  return (Array.isArray(body.ids) ? body.ids : []).map(function(id) { return parseInt(id, 10); }).filter(Boolean);
}

function bearerKey(req) {
  var h = String(req.headers.authorization || "");
  return h.toLowerCase().indexOf("bearer ") === 0 ? h.substring(7).trim() : "";
}

function authApiKey(req) {
  var key = bearerKey(req);
  if (!key) return null;
  var row = db.prepare("SELECT api_keys.*, users.username, users.role FROM api_keys JOIN users ON users.id=api_keys.user_id WHERE key_hash=? AND api_keys.disabled=0").get(hashApiKey(key));
  if (!row) return null;
  db.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?").run(new Date().toISOString(), row.id);
  return { user_id: row.user_id, username: row.username, role: row.role || "user", api_key_id: row.id };
}

function logApiKeyCall(req, session, status, error) {
  if (!session || !session.api_key_id) return;
  try {
    var url = new URL(req.url, "http://localhost");
    db.prepare("INSERT INTO api_key_logs (user_id,api_key_id,method,path,status,error,ip,created_at) VALUES (?,?,?,?,?,?,?,?)").run(session.user_id, session.api_key_id, req.method, url.pathname, status, String(error || "").substring(0, 220), clientIp(req), new Date().toISOString());
    db.prepare("DELETE FROM api_key_logs WHERE id NOT IN (SELECT id FROM api_key_logs WHERE user_id=? ORDER BY id DESC LIMIT 500)").run(session.user_id);
  } catch (e) {}
}

function sendApiKey(res, req, session, status, body) {
  logApiKeyCall(req, session, status, body && body.ok === false ? body.error : "");
  return send(res, status, body);
}

function publicBaseUrl(req) {
  var proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || (req.socket.encrypted ? "https" : "http");
  var host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return proto + "://" + host;
}

function extractCode(messages, keyword) {
  var keywordList = normalizeKeywordList(keyword).map(function(k) { return k.toLowerCase(); });
  var serviceWords = keywordList.filter(function(k) { return /openai|chatgpt|gpt/.test(k); });
  var codeWords = keywordList.filter(function(k) { return /code|验证码|verification|otp|passcode/.test(k); });
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    var text = [msg.subject, msg.body_preview, msg.from_name, msg.from_addr].join(" ").replace(/\s+/g, " ");
    var lower = text.toLowerCase();
    if (serviceWords.length && codeWords.length) {
      if (!serviceWords.some(function(k) { return lower.indexOf(k) >= 0; }) || !codeWords.some(function(k) { return lower.indexOf(k) >= 0; })) continue;
    } else if (keywordList.length && !keywordList.some(function(k) { return lower.indexOf(k) >= 0; })) continue;
    var patterns = [
      /(?:verification|temporary|login|log-in|security|auth(?:entication)?|one[- ]?time|2fa|mfa)\s*(?:code|passcode|otp)?[^0-9]{0,80}(\d{4,8})/i,
      /(?:code|passcode|otp)[^0-9]{0,80}(\d{4,8})/i,
      /(?:enter|use|输入|验证码|校验码|动态码)[^0-9]{0,80}(\d{4,8})/i
    ];
    for (var p = 0; p < patterns.length; p++) {
      var contextual = text.match(patterns[p]);
      if (contextual) return { code: contextual[1], message: msg, index: i };
    }
    var match = text.match(/(^|[^\d])([0-9]{4,8})(?!\d)/);
    if (match && !/^(19|20)\d{2}$/.test(match[2])) return { code: match[2], message: msg, index: i };
  }
  return { code: "", message: messages[0] || null, index: -1 };
}

function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username=?").get(String(username || "").trim());
}

function publicAccount(acc) {
  return { id: acc.id, email: acc.email, client_id: acc.client_id, tag: acc.tag || "", status: acc.status || "new", category: acc.category || acc.status || "new", reason: acc.reason || "", last_scan_at: acc.last_scan_at || "", message_count: acc.message_count || 0, created_at: acc.created_at || "" };
}

function parseAccounts(text) {
  var out = [];
  var seen = {};
  String(text || "").split(/[\r\n]+/).forEach(function(line) {
    var raw = line.trim();
    if (!raw) return;
    var parts = raw.indexOf("----") >= 0 ? raw.split("----") : raw.split("\t");
    var email = "", password = "", clientId = "", refreshToken = "", tag = "";
    if (parts.length >= 4) { email = parts[0].trim(); password = parts[1].trim(); clientId = parts[2].trim(); refreshToken = parts[3].trim(); tag = parts.slice(4).join(" ").trim(); }
    else if (parts.length === 3) { email = parts[0].trim(); clientId = parts[1].trim(); refreshToken = parts[2].trim(); }
    if (!email || !clientId || !refreshToken || seen[email.toLowerCase()]) return;
    seen[email.toLowerCase()] = true;
    out.push({ email: email, password: password, client_id: clientId, refresh_token: refreshToken, tag: tag });
  });
  return out;
}

function exportLine(acc) {
  var token = decrypt(acc.refresh_token_enc);
  if (acc.password) return [acc.email, acc.password, acc.client_id, token, acc.tag || ""].join("----").replace(/----$/, "");
  return [acc.email, acc.client_id, token].join("----");
}

function proxyUrl() {
  return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || "";
}

function proxyConnection(targetHost, targetPort, cb) {
  var p = proxyUrl();
  if (!p) return cb(null, tls.connect({ host: targetHost, port: targetPort, servername: targetHost }));
  var proxy = new URL(p);
  var socket = net.connect(parseInt(proxy.port || "8080", 10), proxy.hostname);
  socket.once("connect", function() {
    var auth = proxy.username ? "Proxy-Authorization: Basic " + Buffer.from(decodeURIComponent(proxy.username) + ":" + decodeURIComponent(proxy.password || "")).toString("base64") + "\r\n" : "";
    socket.write("CONNECT " + targetHost + ":" + targetPort + " HTTP/1.1\r\nHost: " + targetHost + ":" + targetPort + "\r\n" + auth + "Connection: close\r\n\r\n");
  });
  var chunks = [];
  socket.on("data", function(c) {
    chunks.push(c);
    var text = Buffer.concat(chunks).toString("latin1");
    var end = text.indexOf("\r\n\r\n");
    if (end < 0) return;
    socket.removeAllListeners("data");
    if (!/^HTTP\/1\.[01] 2\d\d/.test(text)) return cb(new Error("proxy CONNECT failed"));
    var rest = Buffer.concat(chunks).slice(end + 4);
    if (rest.length) socket.unshift(rest);
    cb(null, tls.connect({ socket: socket, servername: targetHost }));
  });
  socket.on("error", cb);
}

function request(method, urlStr, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var url = new URL(urlStr);
    var body = options.body || "";
    var headers = options.headers || {};
    if (body && headers["Content-Length"] == null) headers["Content-Length"] = Buffer.byteLength(body);
    var req = https.request({ hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search, method: method, headers: headers, createConnection: function(opts, cb) { proxyConnection(url.hostname, url.port || 443, cb); } }, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() { var text = Buffer.concat(chunks).toString("utf8"); var json = null; try { json = JSON.parse(text); } catch (e) {} resolve({ status: res.statusCode, text: text, json: json }); });
    });
    req.on("error", reject);
    req.setTimeout(options.timeout || 30000, function() { req.destroy(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

function requestWithProxy(method, urlStr, proxyUrlStr, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var url = new URL(urlStr);
    var body = options.body || "";
    var headers = options.headers || {};
    var isHttp = url.protocol === "http:";
    var httpModule = isHttp ? http : https;
    if (body && headers["Content-Length"] == null) headers["Content-Length"] = Buffer.byteLength(body);
    var connectOpts = { hostname: url.hostname, port: url.port || (isHttp ? 80 : 443), path: url.pathname + url.search, method: method, headers: headers };
    if (proxyUrlStr && !isHttp) {
      connectOpts.createConnection = function(opts, cb) {
        var proxy = new URL(proxyUrlStr);
        var socket = net.connect(parseInt(proxy.port || "8080", 10), proxy.hostname);
        socket.once("connect", function() {
          var auth = proxy.username ? "Proxy-Authorization: Basic " + Buffer.from(decodeURIComponent(proxy.username) + ":" + decodeURIComponent(proxy.password || "")).toString("base64") + "\r\n" : "";
          socket.write("CONNECT " + url.hostname + ":" + (url.port || 443) + " HTTP/1.1\r\nHost: " + url.hostname + ":" + (url.port || 443) + "\r\n" + auth + "Connection: close\r\n\r\n");
        });
        var chunks = [];
        socket.on("data", function(c) {
          chunks.push(c);
          var text = Buffer.concat(chunks).toString("latin1");
          var end = text.indexOf("\r\n\r\n");
          if (end < 0) return;
          socket.removeAllListeners("data");
          if (!/^HTTP\/1\.[01] 2\d\d/.test(text)) return cb(new Error("proxy CONNECT failed"));
          var rest = Buffer.concat(chunks).slice(end + 4);
          if (rest.length) socket.unshift(rest);
          cb(null, tls.connect({ socket: socket, servername: url.hostname }));
        });
        socket.on("error", cb);
      };
    } else if (proxyUrlStr && isHttp) {
      var proxy = new URL(proxyUrlStr);
      connectOpts.hostname = proxy.hostname;
      connectOpts.port = parseInt(proxy.port || "8080", 10);
      connectOpts.path = urlStr;
      if (proxy.username) headers["Proxy-Authorization"] = "Basic " + Buffer.from(decodeURIComponent(proxy.username) + ":" + decodeURIComponent(proxy.password || "")).toString("base64");
    }
    var req = httpModule.request(connectOpts, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() { var text = Buffer.concat(chunks).toString("utf8"); var json = null; try { json = JSON.parse(text); } catch (e) {} resolve({ status: res.statusCode, text: text, json: json }); });
    });
    req.on("error", reject);
    req.setTimeout(options.timeout || 30000, function() { req.destroy(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

async function refreshAccessToken(acc, scope) {
  var params = { client_id: acc.client_id, refresh_token: decrypt(acc.refresh_token_enc), grant_type: "refresh_token" };
  if (scope) params.scope = scope;
  var body = new URLSearchParams(params).toString();
  var res = await request("POST", "https://login.microsoftonline.com/common/oauth2/v2.0/token", { body: body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (res.status < 200 || res.status >= 300 || !res.json || !res.json.access_token) throw new Error("token refresh failed: " + String(res.json && (res.json.error_description || res.json.error) || res.text || "unknown").substring(0, 220));
  return { access_token: res.json.access_token, refresh_token: res.json.refresh_token || "" };
}

async function refreshGraphAccessToken(acc) {
  try { return await refreshAccessToken(acc, ""); } catch (e) {}
  return refreshAccessToken(acc, GRAPH_TOKEN_SCOPES);
}

function graphFolder(folder) {
  var f = String(folder || "inbox").toLowerCase();
  if (f === "junk" || f === "junkemail" || f === "spam") return "junkemail";
  if (f === "deleted" || f === "deleteditems" || f === "trash") return "deleteditems";
  if (f === "sent" || f === "sentitems") return "sentitems";
  return "inbox";
}

async function fetchFolderMessages(acc, folder, limit) {
  try { return await fetchOutlookRestMessages(acc, folder, limit); } catch (restError) {
    try { return await fetchGraphFolderMessages(acc, folder, limit); } catch (graphError) {
      throw new Error("outlook rest: " + String(restError.message || restError).substring(0, 150) + " | graph: " + String(graphError.message || graphError).substring(0, 150));
    }
  }
}

async function fetchGraphFolderMessages(acc, folder, limit) {
  var token = await refreshGraphAccessToken(acc);
  if (token.refresh_token) {
    acc.refresh_token_enc = encrypt(token.refresh_token);
    db.prepare("UPDATE accounts SET refresh_token_enc=?, updated_at=? WHERE id=? AND user_id=?").run(acc.refresh_token_enc, new Date().toISOString(), acc.id, acc.user_id);
  }
  var url = "https://graph.microsoft.com/v1.0/me/mailFolders/" + graphFolder(folder) + "/messages?$top=" + encodeURIComponent(String(limit || 50)) + "&$select=subject,from,bodyPreview,receivedDateTime&$orderby=receivedDateTime desc";
  var res = await request("GET", url, { headers: { Authorization: "Bearer " + token.access_token, Accept: "application/json" } });
  if (res.status < 200 || res.status >= 300 || !res.json) throw new Error("mail fetch failed: " + String(res.json && res.json.error && (res.json.error.message || res.json.error.code) || res.text || "unknown").substring(0, 220));
  return Array.isArray(res.json.value) ? res.json.value.map(function(item) { var from = item.from && item.from.emailAddress || {}; return { subject: item.subject || "", from_addr: from.address || "", from_name: from.name || "", body_preview: item.bodyPreview || "", received_at: item.receivedDateTime || "" }; }) : [];
}

async function fetchOutlookRestMessages(acc, folder, limit) {
  var token = await refreshAccessToken(acc, "");
  if (token.refresh_token) {
    acc.refresh_token_enc = encrypt(token.refresh_token);
    db.prepare("UPDATE accounts SET refresh_token_enc=?, updated_at=? WHERE id=? AND user_id=?").run(acc.refresh_token_enc, new Date().toISOString(), acc.id, acc.user_id);
  }
  var f = graphFolder(folder);
  var path = f === "inbox" ? "/api/v2.0/me/mailfolders/inbox/messages" : "/api/v2.0/me/mailfolders/" + f + "/messages";
  var url = "https://outlook.office.com" + path + "?$top=" + encodeURIComponent(String(limit || 50)) + "&$select=Subject,From,BodyPreview,ReceivedDateTime&$orderby=ReceivedDateTime desc";
  var res = await request("GET", url, { headers: { Authorization: "Bearer " + token.access_token, Accept: "application/json" } });
  if (res.status < 200 || res.status >= 300 || !res.json) throw new Error("outlook rest fetch failed: " + String(res.json && res.json.error && (res.json.error.message || res.json.error.code) || res.text || "unknown").substring(0, 220));
  return Array.isArray(res.json.value) ? res.json.value.map(function(item) {
    var from = item.From && item.From.EmailAddress || {};
    return { subject: item.Subject || "", from_addr: from.Address || "", from_name: from.Name || "", body_preview: item.BodyPreview || "", received_at: item.ReceivedDateTime || "" };
  }) : [];
}

async function fetchInboxMessages(acc, limit) {
  return fetchFolderMessages(acc, "inbox", limit);
}

async function fetchFoldersMessages(acc, folders, limit) {
  var seen = {};
  var out = [];
  for (var i = 0; i < folders.length; i++) {
    try {
      var messages = await fetchFolderMessages(acc, folders[i], limit);
      messages.forEach(function(m) {
        var key = [m.received_at, m.from_addr, m.subject, m.body_preview].join("|");
        if (!seen[key]) { seen[key] = true; out.push(m); }
      });
    } catch (e) {
      if (!out.length) throw e;
    }
  }
  out.sort(function(a, b) { return new Date(b.received_at || 0) - new Date(a.received_at || 0); });
  return out.slice(0, limit);
}

function normalizeKeywordList(value) {
  if (Array.isArray(value)) return value.map(function(v) { return String(v).trim(); }).filter(Boolean);
  return String(value || "").split(/[\n,，]+/).map(function(v) { return v.trim(); }).filter(Boolean);
}

function defaultRuleConfig() {
  return { base_keywords: ["openai", "chatgpt", "gpt"], rules: [{ category: "套餐", keywords: ["plus", "pro", "team", "billing", "invoice", "receipt", "subscription", "套餐", "订阅"] }], fallback_category: "free", no_match_category: "safe" };
}

function getRuleConfig(userId) {
  var row = db.prepare("SELECT * FROM mail_rules WHERE user_id=? AND enabled=1 ORDER BY id DESC LIMIT 1").get(userId);
  if (!row) return defaultRuleConfig();
  var cfg = defaultRuleConfig();
  try { cfg.base_keywords = normalizeKeywordList(JSON.parse(row.base_keywords)); } catch (e) {}
  try { cfg.rules = JSON.parse(row.rules); } catch (e) {}
  cfg.fallback_category = row.fallback_category || cfg.fallback_category;
  cfg.no_match_category = row.no_match_category || cfg.no_match_category;
  return cfg;
}

function configuredCategories(userId) {
  var cfg = getRuleConfig(userId);
  var out = {};
  (cfg.rules || []).forEach(function(r) { if (r.category) out[r.category] = true; });
  if (cfg.fallback_category) out[cfg.fallback_category] = true;
  if (cfg.no_match_category) out[cfg.no_match_category] = true;
  return Object.keys(out);
}

function saveRuleConfig(userId, data) {
  var now = new Date().toISOString();
  var base = normalizeKeywordList(data.base_keywords);
  var rules = Array.isArray(data.rules) ? data.rules.map(function(r) { return { category: String(r.category || "").trim(), keywords: normalizeKeywordList(r.keywords) }; }).filter(function(r) { return r.category && r.keywords.length; }) : [];
  var fallback = String(data.fallback_category || "matched").trim() || "matched";
  var noMatch = String(data.no_match_category || "safe").trim() || "safe";
  var existing = db.prepare("SELECT id FROM mail_rules WHERE user_id=? ORDER BY id DESC LIMIT 1").get(userId);
  if (existing) db.prepare("UPDATE mail_rules SET name=?, base_keywords=?, rules=?, fallback_category=?, no_match_category=?, enabled=1, updated_at=? WHERE id=? AND user_id=?").run("default", JSON.stringify(base), JSON.stringify(rules), fallback, noMatch, now, existing.id, userId);
  else db.prepare("INSERT INTO mail_rules (user_id,name,base_keywords,rules,fallback_category,no_match_category,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(userId, "default", JSON.stringify(base), JSON.stringify(rules), fallback, noMatch, 1, now, now);
  return getRuleConfig(userId);
}

function classifyMessages(messages, config) {
  config = config || defaultRuleConfig();
  var hasBase = false;
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    var text = [msg.subject, msg.body_preview, msg.from_name, msg.from_addr].join(" ").replace(/\s+/g, " ").toLowerCase();
    var baseHit = !config.base_keywords.length || config.base_keywords.some(function(k) { return text.indexOf(String(k).toLowerCase()) >= 0; });
    if (!baseHit) continue;
    hasBase = true;
    for (var j = 0; j < config.rules.length; j++) {
      var r = config.rules[j];
      var hit = normalizeKeywordList(r.keywords).some(function(k) { return text.indexOf(String(k).toLowerCase()) >= 0; });
      if (hit) return { status: r.category, category: r.category, reason: "matched rule: " + r.category + (msg.subject ? " (" + msg.subject.substring(0, 80) + ")" : "") };
    }
  }
  if (hasBase) return { status: config.fallback_category, category: config.fallback_category, reason: "base keywords matched" };
  return { status: config.no_match_category, category: config.no_match_category, reason: "no base keyword matched" };
}

async function scanOne(acc, limit) {
  try {
    var messages = await fetchFoldersMessages(acc, ["inbox", "junk"], limit);
    var result = classifyMessages(messages, getRuleConfig(acc.user_id));
    acc.status = result.status; acc.category = result.category || result.status; acc.reason = result.reason; acc.message_count = messages.length; acc.last_messages = JSON.stringify(messages.slice(0, 10));
  } catch (e) {
    var msg = String(e.message || e);
    acc.status = /invalid_grant|expired|revoked|AADSTS|permission|consent/i.test(msg) ? "invalid" : "error";
    acc.category = acc.status; acc.reason = msg; acc.message_count = 0; acc.last_messages = "[]";
  }
  acc.last_scan_at = new Date().toISOString();
  db.prepare("UPDATE accounts SET refresh_token_enc=?, status=?, category=?, reason=?, message_count=?, last_messages=?, last_scan_at=?, updated_at=? WHERE id=? AND user_id=?").run(acc.refresh_token_enc, acc.status, acc.category || acc.status, acc.reason, acc.message_count, acc.last_messages, acc.last_scan_at, new Date().toISOString(), acc.id, acc.user_id);
  return acc;
}

async function runScan(userId, ids, concurrency, limit) {
  var owned = db.prepare("SELECT * FROM accounts WHERE user_id=?").all(userId);
  var idSet = ids && ids.length ? ids.reduce(function(m, id) { m[Number(id)] = true; return m; }, {}) : null;
  var selected = idSet ? owned.filter(function(a) { return idSet[a.id]; }) : owned;
  var scanState = scanStates[userId] = emptyScanState();
  scanState.running = true; scanState.total = selected.length;
  var idx = 0;
  async function worker() {
    while (idx < selected.length && !scanState.stop) {
      var acc = selected[idx++];
      await scanOne(acc, limit);
      scanState.done++;
      if (acc.status === "safe") scanState.safe++; else if (acc.status === "used") scanState.used++; else if (acc.status === "plus") scanState.plus++; else if (acc.status === "invalid") scanState.invalid++; else scanState.errors++;
      scanState.log += "[" + new Date().toLocaleTimeString() + "] " + acc.email + " - " + acc.status + " - " + acc.reason + "\n";
    }
  }
  var workers = [];
  for (var i = 0; i < Math.max(1, Math.min(20, concurrency || 3)); i++) workers.push(worker());
  await Promise.all(workers);
  scanState.running = false;
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    var body = "";
    req.on("data", function(c) { body += c; if (body.length > 20 * 1024 * 1024) reject(new Error("request body too large")); });
    req.on("end", function() { resolve(body); });
    req.on("error", reject);
  });
}

function securityHeaders(headers) {
  headers = headers || {};
  headers["X-Content-Type-Options"] = "nosniff";
  headers["X-Frame-Options"] = "DENY";
  headers["Referrer-Policy"] = "no-referrer";
  headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
  headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  return headers;
}

function send(res, status, body, type) {
  res.writeHead(status, securityHeaders({ "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" }));
  res.end(type && type.indexOf("json") < 0 ? body : JSON.stringify(body));
}

function clientIp(req) { return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(); }

function rateBlocked(bucket, ip, max, windowMs, lockMs) {
  var rec = bucket[ip];
  if (!rec) return false;
  if (rec.lockUntil && rec.lockUntil > Date.now()) return true;
  if (Date.now() - rec.first > windowMs) delete bucket[ip];
  return false;
}

function recordFailure(bucket, ip, max, windowMs, lockMs) {
  var now = Date.now();
  var rec = bucket[ip] || { count: 0, first: now, lockUntil: 0 };
  if (now - rec.first > windowMs) rec = { count: 0, first: now, lockUntil: 0 };
  rec.count++;
  if (rec.count >= max) rec.lockUntil = now + lockMs;
  bucket[ip] = rec;
}

function getCookie(req, name) {
  var parts = (req.headers.cookie || "").split(/;\s*/);
  for (var i = 0; i < parts.length; i++) { var p = parts[i].split("="); if (p[0] === name) return decodeURIComponent(p.slice(1).join("=")); }
  return "";
}

function currentSession(req) {
  var sid = getCookie(req, "sid");
  if (!sid) return null;
  if (sessions[sid] && sessions[sid].expires > Date.now()) return sessions[sid];
  var row = db.prepare("SELECT * FROM sessions WHERE sid=? AND expires_at>?").get(sid, new Date().toISOString());
  if (!row) return null;
  var session = { user_id: row.user_id, username: row.username, role: row.role || "user", expires: new Date(row.expires_at).getTime() };
  sessions[sid] = session;
  return session;
}

function touchSession(req, session) {
  var sid = getCookie(req, "sid");
  if (!sid || !session) return;
  var expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  session.expires = new Date(expiresAt).getTime();
  sessions[sid] = session;
  db.prepare("UPDATE sessions SET expires_at=? WHERE sid=?").run(expiresAt, sid);
}

function requireAuth(req, res) {
  var session = currentSession(req);
  if (session) { touchSession(req, session); return true; }
  send(res, 401, { ok: false, error: "unauthorized" });
  return false;
}

function serveStatic(req, res, pathname) {
  var file = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ""));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, securityHeaders({})); res.end("not found"); return; }
  var ext = path.extname(file).toLowerCase();
  var type = ext === ".html" ? "text/html; charset=utf-8" : ext === ".css" ? "text/css; charset=utf-8" : ext === ".js" ? "application/javascript; charset=utf-8" : ext === ".svg" ? "image/svg+xml" : "application/octet-stream";
  res.writeHead(200, securityHeaders({ "Content-Type": type, "Cache-Control": "no-store" }));
  fs.createReadStream(file).pipe(res);
}

function sendMailboxes(res, url, session) {
  releaseExpiredLeases(session.user_id);
  var mbPage = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  var mbLimit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "100", 10)));
  var mbOffset = (mbPage - 1) * mbLimit;
  var q = accountSelectableWhere(url, true);
  var totalMailboxes = stmtGet("SELECT COUNT(*) AS c FROM accounts WHERE " + q.where, [session.user_id].concat(q.args));
  var rowsMailboxes = stmtAll("SELECT * FROM accounts WHERE " + q.where + " ORDER BY id DESC LIMIT ? OFFSET ?", [session.user_id].concat(q.args, [mbLimit, mbOffset])).map(publicAccountExtended);
  return send(res, 200, { ok: true, mailboxes: rowsMailboxes, accounts: rowsMailboxes, total: totalMailboxes.c, page: mbPage, limit: mbLimit });
}

function normalizeImportItems(data) {
  if (data && typeof data.text === "string") return parseAccounts(data.text);
  var rows = Array.isArray(data && data.accounts) ? data.accounts : [data || {}];
  var seen = {};
  return rows.map(function(item) {
    var email = String(item.email || "").trim();
    var clientId = String(item.client_id || item.clientId || "").trim();
    var refreshToken = String(item.refresh_token || item.refreshToken || "").trim();
    if (!email || !clientId || !refreshToken || seen[email.toLowerCase()]) return null;
    seen[email.toLowerCase()] = true;
    return { email: email, password: String(item.password || ""), client_id: clientId, refresh_token: refreshToken, tag: String(item.tag || "") };
  }).filter(Boolean);
}

function importAccountsForUser(userId, data) {
  var parsed = normalizeImportItems(data);
  var added = 0, updated = 0;
  var addedIds = [];
  var find = db.prepare("SELECT id,password FROM accounts WHERE user_id=? AND lower(email)=lower(?)");
  var insert = db.prepare("INSERT INTO accounts (user_id,email,password,client_id,refresh_token_enc,tag,status,category,reason,message_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  var update = db.prepare("UPDATE accounts SET password=?, client_id=?, refresh_token_enc=?, tag=?, status='new', category='new', reason='', message_count=0, used=0, reserved=0, lease_token='', lease_expires_at='', code_health='unknown', code_poll_count=0, updated_at=? WHERE id=? AND user_id=?");
  var tx = db.transaction(function(items) {
    items.forEach(function(item) {
      var now = new Date().toISOString();
      var existing = find.get(userId, item.email);
      if (existing) { update.run(item.password || existing.password || "", item.client_id, encrypt(item.refresh_token), item.tag, now, existing.id, userId); updated++; }
      else { var info = insert.run(userId, item.email, item.password || "", item.client_id, encrypt(item.refresh_token), item.tag, "new", "new", "", 0, now, now); addedIds.push(info.lastInsertRowid); added++; }
    });
  });
  tx(parsed);
  logEvent(userId, "import", "", "parsed=" + parsed.length + ", added=" + added + ", updated=" + updated);
  return { parsed: parsed.length, added: added, updated: updated, added_ids: addedIds };
}

var server = http.createServer(async function(req, res) {
  var url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      var usersCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
      var accountsCount = db.prepare("SELECT COUNT(*) AS c FROM accounts").get().c;
      return send(res, 200, { ok: true, app: "MailOps Console", version: "0.4-local", time: new Date().toISOString(), started_at: STARTED_AT, uptime_seconds: Math.round(process.uptime()), database: { backend: "sqlite", path: DB_FILE, exists: fs.existsSync(DB_FILE), quick_check: "ok" }, counts: { users: usersCount, accounts: accountsCount } });
    }
    if (req.method === "GET" && (url.pathname === "/api/mail/code" || url.pathname === "/api/mail" || url.pathname.indexOf("/api/mail/") === 0)) {
      var apiSession = authApiKey(req);
      if (!apiSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var email = String(url.searchParams.get("email") || "").trim();
      if (!email && url.pathname.indexOf("/api/mail/") === 0) email = decodeURIComponent(url.pathname.substring("/api/mail/".length).split("&")[0]);
      var keyword = String(url.searchParams.get("keyword") || "code,验证码,verification code,OpenAI,ChatGPT,gpt").trim();
      var limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "10", 10)));
      var acc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(apiSession.user_id, email);
      if (!acc) return sendApiKey(res, req, apiSession, 404, { ok: false, error: "account not found" });
      var folders = normalizeKeywordList(url.searchParams.get("folders") || "inbox,junk");
      if (!folders.length) folders = ["inbox", "junk"];
      var includeOld = truthyParam(url.searchParams.get("include_old"));
      var graceSeconds = Math.max(0, Math.min(3600, parseInt(url.searchParams.get("grace_seconds") || "120", 10)));
      var messages = await fetchFoldersMessages(acc, folders, limit);
      if (!includeOld && (acc.reserved_at || acc.used_at)) {
        var after = new Date(acc.reserved_at || acc.used_at).getTime() - graceSeconds * 1000;
        messages = messages.filter(function(m) { var t = new Date(m.received_at || 0).getTime(); return !t || t >= after; });
      }
      var hit = extractCode(messages, keyword);
      var classified = classifyMessages(messages, getRuleConfig(apiSession.user_id));
      var nowCode = new Date().toISOString();
      var health = acc.code_health || "unknown";
      var pollCount = acc.code_poll_count || 0;
      var firstPoll = acc.code_first_poll_at || "";
      var quarantined = false;
      if (hit.code) {
        health = "healthy"; pollCount = 0; firstPoll = "";
        db.prepare("UPDATE accounts SET code_health='healthy', code_poll_count=0, code_first_poll_at='', last_code_at=?, last_messages=?, message_count=?, updated_at=? WHERE id=? AND user_id=?").run(nowCode, JSON.stringify(messages.slice(0, 10)), messages.length, nowCode, acc.id, apiSession.user_id);
        logEvent(apiSession.user_id, "mail-code", email, "found", true);
      } else {
        pollCount += 1;
        if (!firstPoll) firstPoll = nowCode;
        var elapsed = Math.floor((Date.now() - new Date(firstPoll).getTime()) / 1000);
        health = pollCount >= 6 || elapsed >= 120 ? "no_code" : "suspect";
        quarantined = health === "no_code";
        db.prepare("UPDATE accounts SET code_health=?, code_poll_count=?, code_first_poll_at=?, category=CASE WHEN ?=1 THEN 'no_code' ELSE category END, status=CASE WHEN ?=1 THEN 'no_code' ELSE status END, reason=CASE WHEN ?=1 THEN 'verification code timeout' ELSE reason END, updated_at=? WHERE id=? AND user_id=?").run(health, pollCount, firstPoll, quarantined ? 1 : 0, quarantined ? 1 : 0, quarantined ? 1 : 0, nowCode, acc.id, apiSession.user_id);
        logEvent(apiSession.user_id, "mail-code", email, "not found", false);
      }
      return sendApiKey(res, req, apiSession, 200, { ok: true, email: email, code: hit.code, found: !!hit.code, category: classified.category || classified.status, refreshed: true, refresh_error: "", code_health: health, poll_count: pollCount, quarantined: quarantined, message: hit.message });
    }
    if (req.method === "POST" && url.pathname === "/api/mailboxes/reserve" && bearerKey(req)) {
      var reserveSession = authApiKey(req);
      if (!reserveSession) return send(res, 401, { ok: false, error: "invalid api key" });
      return sendApiKey(res, req, reserveSession, 200, reserveMailbox(reserveSession.user_id, JSON.parse(await readBody(req) || "{}")));
    }
    if (req.method === "POST" && url.pathname === "/api/mailboxes/mark-used" && bearerKey(req)) {
      var markSession = authApiKey(req);
      if (!markSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var markBody = JSON.parse(await readBody(req) || "{}");
      return sendApiKey(res, req, markSession, 200, markMailboxUsed(markSession.user_id, markBody.email, markBody.lease_token));
    }
    if (req.method === "POST" && url.pathname === "/api/mailboxes/release" && bearerKey(req)) {
      var releaseSession = authApiKey(req);
      if (!releaseSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var releaseBody = JSON.parse(await readBody(req) || "{}");
      return sendApiKey(res, req, releaseSession, 200, releaseMailbox(releaseSession.user_id, releaseBody.email, releaseBody.lease_token));
    }
    if (req.method === "POST" && url.pathname === "/api/mailboxes/report-code" && bearerKey(req)) {
      var reportSession = authApiKey(req);
      if (!reportSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var reportBody = JSON.parse(await readBody(req) || "{}");
      var reportEmail = String(reportBody.email || "").trim();
      var result = String(reportBody.result || "").trim();
      var threshold = Math.max(1, parseInt(reportBody.threshold || 1, 10));
      var reportAcc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(reportSession.user_id, reportEmail);
      if (!reportAcc) return sendApiKey(res, req, reportSession, 404, { ok: false, error: "account not found" });
      var nowReport = new Date().toISOString();
      var failures = result === "success" ? 0 : (reportAcc.code_poll_count || 0) + 1;
      var noCode = /timeout|no_code|failed/i.test(result) && failures >= threshold;
      db.prepare("UPDATE accounts SET code_health=?, code_poll_count=?, code_first_poll_at=CASE WHEN ?='' THEN ? ELSE code_first_poll_at END, category=CASE WHEN ?=1 THEN 'no_code' ELSE category END, status=CASE WHEN ?=1 THEN 'no_code' ELSE status END, reason=?, updated_at=? WHERE id=? AND user_id=?").run(result === "success" ? "healthy" : (noCode ? "no_code" : "suspect"), failures, reportAcc.code_first_poll_at || "", nowReport, noCode ? 1 : 0, noCode ? 1 : 0, String(reportBody.detail || result).substring(0, 220), nowReport, reportAcc.id, reportSession.user_id);
      logEvent(reportSession.user_id, "report-code", reportEmail, result, result === "success");
      return sendApiKey(res, req, reportSession, 200, { ok: true, email: reportEmail, result: result, code_health: noCode ? "no_code" : (result === "success" ? "healthy" : "suspect"), quarantined: noCode });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-accounts/report" && bearerKey(req)) {
      var gptReportSession = authApiKey(req);
      if (!gptReportSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var savedGpt = saveGptAccount(gptReportSession.user_id, JSON.parse(await readBody(req) || "{}"), {});
      return sendApiKey(res, req, gptReportSession, 200, Object.assign({ ok: true }, savedGpt));
    }
    if (req.method === "GET" && url.pathname === "/api/mailboxes" && bearerKey(req)) {
      var apiMailboxSession = authApiKey(req);
      if (!apiMailboxSession) return send(res, 401, { ok: false, error: "invalid api key" });
      logApiKeyCall(req, apiMailboxSession, 200, "");
      return sendMailboxes(res, url, apiMailboxSession);
    }
    if (req.method === "POST" && url.pathname === "/api/mailboxes" && bearerKey(req)) {
      var apiImportSession = authApiKey(req);
      if (!apiImportSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var apiImportBody = JSON.parse(await readBody(req) || "{}");
      var apiImportResult = importAccountsForUser(apiImportSession.user_id, apiImportBody);
      return sendApiKey(res, req, apiImportSession, 200, { ok: true, parsed: apiImportResult.parsed, added: apiImportResult.added, updated: apiImportResult.updated });
    }
    if ((req.method === "DELETE" && url.pathname === "/api/mailboxes" || req.method === "POST" && url.pathname === "/api/mailboxes/delete") && bearerKey(req)) {
      var apiDeleteSession = authApiKey(req);
      if (!apiDeleteSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var deleteEmail = String(url.searchParams.get("email") || "").trim();
      if (!deleteEmail && req.method === "POST") {
        var deleteBody = JSON.parse(await readBody(req) || "{}");
        deleteEmail = String(deleteBody.email || "").trim();
      }
      if (!deleteEmail) return send(res, 400, { ok: false, error: "email required" });
      db.prepare("DELETE FROM mail_query_links WHERE user_id=? AND email=?").run(apiDeleteSession.user_id, deleteEmail);
      var del = db.prepare("DELETE FROM accounts WHERE user_id=? AND lower(email)=lower(?)").run(apiDeleteSession.user_id, deleteEmail);
      return sendApiKey(res, req, apiDeleteSession, 200, { ok: true, email: deleteEmail, deleted: del.changes });
    }
    if ((req.method === "PATCH" || req.method === "POST") && url.pathname === "/api/mailboxes/category" && bearerKey(req)) {
      var apiCategorySession = authApiKey(req);
      if (!apiCategorySession) return send(res, 401, { ok: false, error: "invalid api key" });
      var categoryBody = JSON.parse(await readBody(req) || "{}");
      var category = String(categoryBody.category || "").trim();
      if (!category || category.length > 80) return sendApiKey(res, req, apiCategorySession, 400, { ok: false, error: "bad category" });
      var emails = Array.isArray(categoryBody.emails) ? categoryBody.emails : [categoryBody.email];
      emails = emails.map(function(email) { return String(email || "").trim(); }).filter(Boolean);
      if (!emails.length) return sendApiKey(res, req, apiCategorySession, 400, { ok: false, error: "email required" });
      var updateCategory = db.prepare("UPDATE accounts SET category=?, updated_at=? WHERE user_id=? AND lower(email)=lower(?)");
      var nowCategory = new Date().toISOString();
      var updatedCategory = 0;
      var categoryTx = db.transaction(function(list) {
        list.forEach(function(email) { updatedCategory += updateCategory.run(category, nowCategory, apiCategorySession.user_id, email).changes; });
      });
      categoryTx(emails);
      return sendApiKey(res, req, apiCategorySession, 200, { ok: true, category: category, requested: emails.length, updated: updatedCategory });
    }
    if (req.method === "POST" && url.pathname === "/api/mail/query-link" && bearerKey(req)) {
      var apiLinkSession = authApiKey(req);
      if (!apiLinkSession) return send(res, 401, { ok: false, error: "invalid api key" });
      var linkBody = JSON.parse(await readBody(req) || "{}");
      var linkEmail = String(linkBody.email || "").trim();
      if (!linkEmail) return sendApiKey(res, req, apiLinkSession, 400, { ok: false, error: "email required" });
      var linkAcc = db.prepare("SELECT id FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(apiLinkSession.user_id, linkEmail);
      if (!linkAcc) return sendApiKey(res, req, apiLinkSession, 404, { ok: false, error: "account not found" });
      var linkKeyword = String(linkBody.keyword || "").trim();
      var maxAgeSeconds = Math.max(30, Math.min(3600, parseInt(linkBody.max_age_seconds || 300, 10)));
      var existingLink = db.prepare("SELECT * FROM mail_query_links WHERE user_id=? AND email=?").get(apiLinkSession.user_id, linkEmail);
      var token = existingLink ? existingLink.token : crypto.randomBytes(24).toString("base64url");
      var nowLink = new Date().toISOString();
      db.prepare("INSERT INTO mail_query_links (user_id,email,token,keyword,max_age_seconds,disabled,created_at,last_used_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,email) DO UPDATE SET keyword=excluded.keyword,max_age_seconds=excluded.max_age_seconds,disabled=0").run(apiLinkSession.user_id, linkEmail, token, linkKeyword, maxAgeSeconds, 0, existingLink ? existingLink.created_at : nowLink, existingLink ? existingLink.last_used_at || "" : "");
      return sendApiKey(res, req, apiLinkSession, 200, { ok: true, email: linkEmail, keyword: linkKeyword, max_age_seconds: maxAgeSeconds, token: token, url: publicBaseUrl(req) + "/q/" + token });
    }
    if (req.method === "GET" && url.pathname.indexOf("/q/") === 0) {
      var queryToken = url.pathname.split("/").pop();
      var queryLink = db.prepare("SELECT * FROM mail_query_links WHERE token=? AND disabled=0").get(queryToken);
      if (!queryLink) return send(res, 404, { ok: false, error: "query link not found", code: null });
      db.prepare("UPDATE mail_query_links SET last_used_at=? WHERE id=?").run(new Date().toISOString(), queryLink.id);
      var queryAcc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(queryLink.user_id, queryLink.email);
      if (!queryAcc) return send(res, 404, { ok: false, error: "account not found", email: queryLink.email, code: null });
      try {
        var latestMessages = await fetchInboxMessages(queryAcc, 10);
        var freshMessages = latestMessages.filter(function(m) {
          var dt = m && m.received_at ? new Date(m.received_at) : null;
          if (!dt || isNaN(dt.getTime())) return false;
          return Math.max(0, Math.floor((Date.now() - dt.getTime()) / 1000)) <= queryLink.max_age_seconds;
        });
        var codeHit = extractCode(freshMessages, queryLink.keyword || "");
        var matched = codeHit.message || latestMessages[0] || null;
        var receivedAt = matched && matched.received_at ? new Date(matched.received_at) : null;
        var ageSeconds = receivedAt && !isNaN(receivedAt.getTime()) ? Math.max(0, Math.floor((Date.now() - receivedAt.getTime()) / 1000)) : null;
        var fresh = !!codeHit.code && ageSeconds !== null && ageSeconds <= queryLink.max_age_seconds;
        return send(res, 200, { ok: true, email: queryLink.email, code: codeHit.code || null, found: !!codeHit.code, fresh: fresh, matched_index: codeHit.index, checked: latestMessages.length, fresh_checked: freshMessages.length, max_age_seconds: queryLink.max_age_seconds, age_seconds: ageSeconds, received_at: matched && matched.received_at || "", subject: matched && matched.subject || "", from_addr: matched && matched.from_addr || "", body_preview: matched && matched.body_preview || "" });
      } catch (e) {
        return send(res, 200, { ok: false, email: queryLink.email, code: null, error: String(e.message || e).substring(0, 220) });
      }
    }
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) return serveStatic(req, res, url.pathname);
    if (req.method === "POST" && url.pathname === "/api/register") {
      var rip = clientIp(req);
      if (!registrationEnabled()) return send(res, 403, { ok: false, error: "registration disabled" });
      if (rateBlocked(registerFailures, rip, 5, 60 * 60 * 1000, 60 * 60 * 1000)) return send(res, 429, { ok: false, error: "too many registration attempts" });
      var reg = JSON.parse(await readBody(req) || "{}");
      try { db.transaction(function() { consumeInvite(reg.invite_code); createUser(reg.username, reg.password, "user"); })(); } catch (e) { recordFailure(registerFailures, rip, 5, 60 * 60 * 1000, 60 * 60 * 1000); return send(res, 200, { ok: false, error: String(e.message || e) }); }
      delete registerFailures[rip];
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      var ip = clientIp(req);
      if (rateBlocked(loginFailures, ip, 8, 10 * 60 * 1000, 10 * 60 * 1000)) return send(res, 429, { ok: false, error: "too many login attempts" });
      var login = JSON.parse(await readBody(req) || "{}");
      var user = getUserByUsername(login.username || "");
      if (!user || user.disabled || !verifyPassword(user, login.password || "")) { recordFailure(loginFailures, ip, 8, 10 * 60 * 1000, 10 * 60 * 1000); return send(res, 200, { ok: false, error: "wrong username or password" }); }
      delete loginFailures[ip];
      var sid = crypto.randomBytes(24).toString("hex");
      var expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      sessions[sid] = { user_id: user.id, username: user.username, role: user.role || "user", expires: new Date(expiresAt).getTime() };
      db.prepare("INSERT INTO sessions (sid,user_id,username,role,expires_at,created_at) VALUES (?,?,?,?,?,?)").run(sid, user.id, user.username, user.role || "user", expiresAt, new Date().toISOString());
      db.prepare("UPDATE users SET last_login_at=? WHERE id=?").run(new Date().toISOString(), user.id);
      res.writeHead(200, securityHeaders({ "Content-Type": "application/json; charset=utf-8", "Set-Cookie": "sid=" + encodeURIComponent(sid) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200", "Cache-Control": "no-store" }));
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === "POST" && url.pathname === "/api/logout") {
      var oldSid = getCookie(req, "sid");
      delete sessions[oldSid];
      if (oldSid) db.prepare("DELETE FROM sessions WHERE sid=?").run(oldSid);
      res.writeHead(200, securityHeaders({ "Content-Type": "application/json; charset=utf-8", "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" }));
      return res.end(JSON.stringify({ ok: true }));
    }
    if (!requireAuth(req, res)) return;
    var session = currentSession(req);
    if (req.method === "GET" && url.pathname === "/api/me") return send(res, 200, { ok: true, user: { username: session.username, role: session.role }, settings: { registration_enabled: registrationEnabled() } });
    if (req.method === "GET" && url.pathname === "/api/stats") {
      releaseExpiredLeases(session.user_id);
      var totalStats = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id=?").get(session.user_id).c;
      var usedStats = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id=? AND used=1").get(session.user_id).c;
      var takeableStats = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id=? AND used=0 AND reserved=0 AND COALESCE(code_health,'unknown') NOT IN ('no_code','blocked','unhealthy') AND category!='no_code'").get(session.user_id).c;
      var healthRows = db.prepare("SELECT code_health, COUNT(*) AS c FROM accounts WHERE user_id=? GROUP BY code_health").all(session.user_id);
      var codeHealth = {};
      healthRows.forEach(function(r) { codeHealth[r.code_health || "unknown"] = r.c; });
      return send(res, 200, {
        ok: true,
        total: totalStats,
        used_count: usedStats,
        available_count: Math.max(0, totalStats - usedStats),
        takeable_count: takeableStats,
        code_health: codeHealth,
        categories: db.prepare("SELECT category, COUNT(*) AS count FROM accounts WHERE user_id=? GROUP BY category ORDER BY count DESC, category").all(session.user_id),
        used_breakdown: db.prepare("SELECT category, COUNT(*) AS count FROM accounts WHERE user_id=? AND used=1 GROUP BY category").all(session.user_id),
        errors: db.prepare("SELECT reason, COUNT(*) AS count FROM accounts WHERE user_id=? AND status IN ('error','invalid','no_code') GROUP BY reason ORDER BY count DESC LIMIT 8").all(session.user_id),
        recent: db.prepare("SELECT email,category,reason,created_at,last_scan_at FROM accounts WHERE user_id=? ORDER BY id DESC LIMIT 8").all(session.user_id),
        api_logs: db.prepare("SELECT action,target,detail,ok,created_at FROM api_events WHERE user_id=? ORDER BY id DESC LIMIT 20").all(session.user_id)
      });
    }
    if (req.method === "POST" && url.pathname === "/api/settings/registration") {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var settingBody = JSON.parse(await readBody(req) || "{}");
      setSetting("registration_enabled", settingBody.enabled ? "true" : "false");
      return send(res, 200, { ok: true, registration_enabled: registrationEnabled() });
    }
    if (req.method === "GET" && url.pathname === "/api/api-keys") {
      var keys = db.prepare("SELECT * FROM api_keys WHERE user_id=? ORDER BY id DESC").all(session.user_id).map(publicApiKey);
      return send(res, 200, { ok: true, api_keys: keys });
    }
    if (req.method === "GET" && url.pathname === "/api/api-key-logs") {
      var logs = db.prepare("SELECT api_key_logs.*, api_keys.prefix FROM api_key_logs LEFT JOIN api_keys ON api_keys.id=api_key_logs.api_key_id WHERE api_key_logs.user_id=? ORDER BY api_key_logs.id DESC LIMIT 100").all(session.user_id).map(function(row) { return { id: row.id, api_key_id: row.api_key_id, prefix: row.prefix || "", method: row.method, path: row.path, status: row.status, error: row.error || "", ip: row.ip || "", created_at: row.created_at }; });
      return send(res, 200, { ok: true, logs: logs });
    }
    if (req.method === "POST" && url.pathname === "/api/api-keys") {
      var keyBody = JSON.parse(await readBody(req) || "{}");
      return send(res, 200, { ok: true, api_key: createApiKey(session.user_id, keyBody.name) });
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/api-keys/") === 0 && url.pathname.endsWith("/enable")) {
      var enableKeyId = parseInt(url.pathname.split("/")[3], 10);
      db.prepare("UPDATE api_keys SET disabled=0 WHERE id=? AND user_id=?").run(enableKeyId, session.user_id);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/api-keys/") === 0 && url.pathname.endsWith("/disable")) {
      var keyId = parseInt(url.pathname.split("/")[3], 10);
      db.prepare("UPDATE api_keys SET disabled=1 WHERE id=? AND user_id=?").run(keyId, session.user_id);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/api-keys/") === 0 && url.pathname.endsWith("/delete")) {
      var delKeyId = parseInt(url.pathname.split("/")[3], 10);
      db.prepare("DELETE FROM api_keys WHERE id=? AND user_id=?").run(delKeyId, session.user_id);
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/gpt-accounts") return send(res, 200, gptListResponse(session.user_id, url));
    if (req.method === "POST" && url.pathname === "/api/gpt-accounts/import") {
      var gptImport = JSON.parse(await readBody(req) || "{}");
      var defaults = gptImport.defaults || {};
      var rows = parseGptImportText(gptImport.text || "", defaults);
      var created = 0, updated = 0;
      rows.forEach(function(row) { var r = saveGptAccount(session.user_id, row, defaults); if (r.created) created++; else updated++; });
      return send(res, 200, { ok: true, total: rows.length, parsed: rows.length, created: created, added: created, updated: updated });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-accounts/bulk-status") {
      var statusBody = JSON.parse(await readBody(req) || "{}");
      var idsStatus = selectedIds(statusBody);
      var statusValue = String(statusBody.status || "archived").trim();
      var changedStatus = idsStatus.length ? stmtRun("UPDATE gpt_accounts SET status=?, updated_at=? WHERE user_id=? AND id IN (" + idsStatus.map(function() { return "?"; }).join(",") + ")", [statusValue, new Date().toISOString(), session.user_id].concat(idsStatus)).changes : 0;
      return send(res, 200, { ok: true, updated: changedStatus });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-accounts/delete") {
      var deleteGpt = JSON.parse(await readBody(req) || "{}");
      var idsGptDel = selectedIds(deleteGpt);
      var deletedGpt = idsGptDel.length ? stmtRun("DELETE FROM gpt_accounts WHERE user_id=? AND id IN (" + idsGptDel.map(function() { return "?"; }).join(",") + ")", [session.user_id].concat(idsGptDel)).changes : 0;
      return send(res, 200, { ok: true, deleted: deletedGpt });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-accounts/export") {
      var exportBody = JSON.parse(await readBody(req) || "{}");
      var idsExport = selectedIds(exportBody);
      if (!idsExport.length) return send(res, 400, { ok: false, error: "ids required" });
      var rowsExport = stmtAll("SELECT * FROM gpt_accounts WHERE user_id=? AND id IN (" + idsExport.map(function() { return "?"; }).join(",") + ") ORDER BY id", [session.user_id].concat(idsExport)).map(publicGptAccount);
      var format = String(exportBody.format || "sub2api");
      var nowExport = new Date().toISOString();
      var filename = (format === "cockpit_tools" ? "cockpit-tools" : format) + "-" + rowsExport.length + ".zip";
      if (exportBody.mark_exported !== false) {
        markGptAccountsExported(session.user_id, idsExport, format, nowExport);
      }
      db.prepare("INSERT INTO gpt_exports (user_id,format,account_ids,count,filename,created_at) VALUES (?,?,?,?,?,?)").run(session.user_id, format, JSON.stringify(idsExport), rowsExport.length, filename, nowExport);
      var csv = ["email,password,bind_email,phone,proxy,batch_id,result,status,plan"].concat(rowsExport.map(function(a) { return [a.email, a.password, a.bind_email, a.phone, a.proxy, a.batch_id, a.result, a.status, a.plan].map(csvEscape).join(","); })).join("\n");
      return sendZip(res, filename, [
        { name: "manifest.json", data: JSON.stringify({ format: format, count: rowsExport.length, exported_at: nowExport }, null, 2) },
        { name: "account-info/accounts-" + rowsExport.length + ".json", data: JSON.stringify(rowsExport, null, 2) },
        { name: "accounts.csv", data: csv + "\n" },
        { name: format + "-" + rowsExport.length + ".json", data: JSON.stringify(rowsExport.map(function(a) { return a.auth_file && Object.keys(a.auth_file).length ? a.auth_file : a; }), null, 2) }
      ]);
    }
    if (req.method === "GET" && url.pathname === "/api/gpt-refresh-jobs") return send(res, 200, { ok: true, jobs: db.prepare("SELECT * FROM gpt_jobs WHERE user_id=? AND type='refresh' ORDER BY id DESC LIMIT 100").all(session.user_id) });
    if (req.method === "GET" && url.pathname === "/api/gpt-inspection-jobs") return send(res, 200, { ok: true, jobs: db.prepare("SELECT * FROM gpt_jobs WHERE user_id=? AND type='inspection' ORDER BY id DESC LIMIT 100").all(session.user_id) });
    if (req.method === "POST" && (url.pathname === "/api/gpt-refresh-jobs" || url.pathname === "/api/gpt-inspection-jobs")) {
      var createJobBody = JSON.parse(await readBody(req) || "{}");
      var createJobType = url.pathname.indexOf("inspection") >= 0 ? "inspection" : "refresh";
      var createIds = selectedIds(createJobBody);
      var createdJobs = 0;
      var nowCreateJob = new Date().toISOString();
      createIds.forEach(function(id) {
        db.prepare("INSERT INTO gpt_jobs (user_id,account_id,type,status,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(session.user_id, id, createJobType, "queued", createJobBody.target || "", nowCreateJob, nowCreateJob);
        createdJobs++;
      });
      return send(res, 200, { ok: true, created: createdJobs, queued: createdJobs });
    }
    if (req.method === "POST" && (url.pathname === "/api/gpt-refresh-jobs/update" || url.pathname === "/api/gpt-inspection-jobs/update")) {
      var jobBody = JSON.parse(await readBody(req) || "{}");
      var jobType = url.pathname.indexOf("inspection") >= 0 ? "inspection" : "refresh";
      if (jobBody.id) {
        db.prepare("UPDATE gpt_jobs SET status=?,detail=?,updated_at=? WHERE id=? AND user_id=? AND type=?").run(jobBody.status || "done", jobBody.error || jobBody.result || "", new Date().toISOString(), parseInt(jobBody.id, 10), session.user_id, jobType);
        return send(res, 200, { ok: true, updated: 1 });
      }
      var jobIds = selectedIds(jobBody);
      var infoJob = 0;
      var nowJob = new Date().toISOString();
      jobIds.forEach(function(id) { db.prepare("INSERT INTO gpt_jobs (user_id,account_id,type,status,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(session.user_id, id, jobType, "queued", "", nowJob, nowJob); infoJob++; });
      return send(res, 200, { ok: true, queued: infoJob, created: infoJob });
    }
    if (req.method === "GET" && url.pathname === "/api/gpt-error-rules") return send(res, 200, { ok: true, rules: db.prepare("SELECT * FROM gpt_error_rules WHERE user_id=? ORDER BY id DESC").all(session.user_id).map(function(r) { r.keywords = parseJson(r.keywords, []); return r; }) });
    if (req.method === "POST" && url.pathname === "/api/gpt-error-rules") {
      var ruleGpt = JSON.parse(await readBody(req) || "{}");
      var nowRule = new Date().toISOString();
      var kw = JSON.stringify(normalizeKeywordList(ruleGpt.keywords));
      if (ruleGpt.id) db.prepare("UPDATE gpt_error_rules SET name=?,category=?,keywords=?,severity=?,updated_at=? WHERE id=? AND user_id=?").run(ruleGpt.name || "", ruleGpt.category || "", kw, ruleGpt.severity || "warning", nowRule, ruleGpt.id, session.user_id);
      else db.prepare("INSERT INTO gpt_error_rules (user_id,name,category,keywords,severity,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(session.user_id, ruleGpt.name || "", ruleGpt.category || "", kw, ruleGpt.severity || "warning", nowRule, nowRule);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/gpt-error-rules/") === 0 && url.pathname.endsWith("/delete")) {
      db.prepare("DELETE FROM gpt_error_rules WHERE id=? AND user_id=?").run(parseInt(url.pathname.split("/")[3], 10), session.user_id);
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/phone-code-pool") return send(res, 200, { ok: true, phones: db.prepare("SELECT * FROM phone_code_pool WHERE user_id=? ORDER BY id DESC").all(session.user_id).map(function(p) { p.phone = p.phone_number; return p; }) });
    if (req.method === "POST" && url.pathname === "/api/phone-code-pool") {
      var phone = JSON.parse(await readBody(req) || "{}");
      var nowPhone = new Date().toISOString();
      var phoneNumber = phone.phone_number || phone.number || phone.phone || "";
      if (phone.id) db.prepare("UPDATE phone_code_pool SET provider=?,phone_number=?,api_url=?,status=?,note=?,updated_at=? WHERE id=? AND user_id=?").run(phone.provider || "", phoneNumber, phone.api_url || "", phone.status || "available", phone.note || "", nowPhone, phone.id, session.user_id);
      else db.prepare("INSERT INTO phone_code_pool (user_id,provider,phone_number,api_url,status,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(session.user_id, phone.provider || "", phoneNumber, phone.api_url || "", phone.status || "available", phone.note || "", nowPhone, nowPhone);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/phone-code-pool/") === 0 && url.pathname.endsWith("/delete")) {
      db.prepare("DELETE FROM phone_code_pool WHERE id=? AND user_id=?").run(parseInt(url.pathname.split("/")[3], 10), session.user_id);
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/gpt-exports") return send(res, 200, { ok: true, exports: db.prepare("SELECT * FROM gpt_exports WHERE user_id=? ORDER BY id DESC LIMIT 100").all(session.user_id) });
    if (req.method === "GET" && url.pathname === "/api/gpt-export") {
      var expQueryId = parseInt(url.searchParams.get("id") || "0", 10);
      var expQuery = db.prepare("SELECT * FROM gpt_exports WHERE id=? AND user_id=?").get(expQueryId, session.user_id);
      if (!expQuery) return send(res, 404, { ok: false, error: "not found" });
      var expQueryIds = parseJson(expQuery.account_ids, []);
      var expQueryRows = expQueryIds.length ? stmtAll("SELECT * FROM gpt_accounts WHERE user_id=? AND id IN (" + expQueryIds.map(function() { return "?"; }).join(",") + ")", [session.user_id].concat(expQueryIds)).map(publicGptAccount) : [];
      return send(res, 200, { ok: true, export: expQuery, accounts: expQueryRows });
    }
    if (req.method === "GET" && url.pathname === "/api/gpt-export/download") {
      var expDownId = parseInt(url.searchParams.get("id") || "0", 10);
      var expDown = db.prepare("SELECT * FROM gpt_exports WHERE id=? AND user_id=?").get(expDownId, session.user_id);
      if (!expDown) return send(res, 404, { ok: false, error: "not found" });
      var downIds = parseJson(expDown.account_ids, []);
      var downRows = downIds.length ? stmtAll("SELECT * FROM gpt_accounts WHERE user_id=? AND id IN (" + downIds.map(function() { return "?"; }).join(",") + ")", [session.user_id].concat(downIds)).map(publicGptAccount) : [];
      return sendZip(res, expDown.filename || ("gpt-export-" + expDown.id + ".zip"), [
        { name: "manifest.json", data: JSON.stringify(expDown, null, 2) },
        { name: "account-info/accounts-" + downRows.length + ".json", data: JSON.stringify(downRows, null, 2) }
      ]);
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/gpt-exports/") === 0 && url.pathname.endsWith("/delete")) {
      db.prepare("DELETE FROM gpt_exports WHERE id=? AND user_id=?").run(parseInt(url.pathname.split("/")[3], 10), session.user_id);
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname.indexOf("/api/gpt-exports/") === 0) {
      var expId = parseInt(url.pathname.split("/")[3], 10);
      var exp = db.prepare("SELECT * FROM gpt_exports WHERE id=? AND user_id=?").get(expId, session.user_id);
      if (!exp) return send(res, 404, { ok: false, error: "not found" });
      var expIds = parseJson(exp.account_ids, []);
      var expRows = expIds.length ? stmtAll("SELECT * FROM gpt_accounts WHERE user_id=? AND id IN (" + expIds.map(function() { return "?"; }).join(",") + ")", [session.user_id].concat(expIds)).map(publicGptAccount) : [];
      return send(res, 200, { ok: true, export: exp, accounts: expRows });
    }
    if (req.method === "GET" && url.pathname === "/api/gpt-events") return send(res, 200, { ok: true, events: db.prepare("SELECT * FROM gpt_events WHERE user_id=? ORDER BY id DESC LIMIT 100").all(session.user_id).map(function(e) { e.gpt_account_id = e.account_id; e.event = e.type; return e; }) });
    if (req.method === "GET" && url.pathname === "/api/gpt-workbench/config") {
      var cfg = parseJson(getSetting("gpt_workbench_config_" + session.user_id), {});
      return send(res, 200, { ok: true, config: cfg });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-workbench/config") {
      var wb = JSON.parse(await readBody(req) || "{}");
      setSetting("gpt_workbench_config_" + session.user_id, JSON.stringify(wb.config || wb || {}));
      return send(res, 200, { ok: true, config: wb.config || wb || {} });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-workbench/sync-mailboxes") {
      var syncBody = JSON.parse(await readBody(req) || "{}");
      var syncUrl = new URL("http://localhost/api/mailboxes");
      if (syncBody.category) syncUrl.searchParams.set("category", syncBody.category);
      syncUrl.searchParams.set("include_used", "1");
      syncUrl.searchParams.set("include_reserved", "1");
      syncUrl.searchParams.set("include_unhealthy", "1");
      var qSync = accountSelectableWhere(syncUrl, false);
      var synced = stmtGet("SELECT COUNT(*) AS c FROM accounts WHERE " + qSync.where, [session.user_id].concat(qSync.args)).c;
      logGptEvent(session.user_id, 0, "sync-mailboxes", "Mailbox credentials synced", { count: synced });
      return send(res, 200, { ok: true, synced: synced });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-workbench/proxy-check") {
      var proxyBody = JSON.parse(await readBody(req) || "{}");
      var proxyUrlStr = String(proxyBody.proxy_url || "").trim();
      if (!proxyUrlStr) return send(res, 200, { ok: true, reachable: false, message: "no proxy configured" });
      try {
        var proxyRes = await requestWithProxy("GET", "https://httpbin.org/ip", proxyUrlStr, { timeout: 15000 });
        var ipData = proxyRes.json || {};
        var ip = ipData.origin || "-";
        return send(res, 200, { ok: true, reachable: true, ip: ip, message: "proxy reachable, IP: " + ip });
      } catch (e) {
        return send(res, 200, { ok: true, reachable: false, message: "proxy unreachable: " + String(e.message || e).substring(0, 120) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-workbench/refresh-start") {
      var refreshBody = JSON.parse(await readBody(req) || "{}");
      var refreshAccountId = parseInt(refreshBody.account_id || 0, 10);
      var refreshNow = new Date().toISOString();
      var gptAcc = db.prepare("SELECT * FROM gpt_accounts WHERE id=? AND user_id=?").get(refreshAccountId, session.user_id);
      if (!gptAcc) {
        var failJob = db.prepare("INSERT INTO gpt_jobs (user_id,account_id,type,status,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(session.user_id, refreshAccountId, "refresh", "failed", "account not found", refreshNow, refreshNow);
        return send(res, 200, { ok: false, error: "account not found", job_id: failJob.lastInsertRowid, local_job_id: failJob.lastInsertRowid, status: "failed" });
      }
      var raw = parseJson(gptAcc.raw_payload, {});
      var tokens = parseJson(gptAcc.tokens, {});
      var authFile = parseJson(gptAcc.auth_file, {});
      var refreshToken = tokens.refresh_token || authFile.refresh_token || raw.refresh_token || "";
      if (!refreshToken) {
        var noTokenJob = db.prepare("INSERT INTO gpt_jobs (user_id,account_id,type,status,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(session.user_id, refreshAccountId, "refresh", "failed", "no refresh_token available", refreshNow, refreshNow);
        db.prepare("UPDATE gpt_accounts SET refresh_status='failed',updated_at=? WHERE id=? AND user_id=?").run(refreshNow, refreshAccountId, session.user_id);
        return send(res, 200, { ok: false, error: "no refresh_token available", job_id: noTokenJob.lastInsertRowid, local_job_id: noTokenJob.lastInsertRowid, status: "failed" });
      }
      var job = db.prepare("INSERT INTO gpt_jobs (user_id,account_id,type,status,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(session.user_id, refreshAccountId, "refresh", "running", "OAuth token refresh started", refreshNow, refreshNow);
      try {
        var clientId = raw.client_id || tokens.client_id || "9b4b5e8c-6fb5-4f60-9d3e-9b4b5e8c6fb5";
        var tokenParams = { client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token", scope: "offline_access https://graph.microsoft.com/.default" };
        var tokenBody = new URLSearchParams(tokenParams).toString();
        var tokenRes;
        if (refreshBody.proxy_url) {
          tokenRes = await requestWithProxy("POST", "https://login.microsoftonline.com/common/oauth2/v2.0/token", refreshBody.proxy_url, { body: tokenBody, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 30000 });
        } else {
          tokenRes = await request("POST", "https://login.microsoftonline.com/common/oauth2/v2.0/token", { body: tokenBody, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 30000 });
        }
        if (tokenRes.status < 200 || tokenRes.status >= 300 || !tokenRes.json || !tokenRes.json.access_token) {
          var errMsg = String(tokenRes.json && (tokenRes.json.error_description || tokenRes.json.error) || tokenRes.text || "token refresh failed").substring(0, 220);
          db.prepare("UPDATE gpt_jobs SET status='failed',detail=?,updated_at=? WHERE id=?").run(errMsg, refreshNow, job.lastInsertRowid);
          db.prepare("UPDATE gpt_accounts SET refresh_status='failed',error=?,error_category='refresh_failed',updated_at=? WHERE id=? AND user_id=?").run(errMsg, refreshNow, refreshAccountId, session.user_id);
          return send(res, 200, { ok: false, error: errMsg, job_id: job.lastInsertRowid, local_job_id: job.lastInsertRowid, status: "failed" });
        }
        var newTokens = tokenRes.json;
        var newAuthFile = Object.assign({}, authFile, { refresh_token: newTokens.refresh_token || refreshToken, access_token: newTokens.access_token, id_token: newTokens.id_token || authFile.id_token || "", session_token: newTokens.session_token || authFile.session_token || "", expires_at: newTokens.expires_at || "" });
        var newRawPayload = Object.assign({}, raw, { refresh_token: newTokens.refresh_token || refreshToken, access_token: newTokens.access_token, id_token: newTokens.id_token || raw.id_token || "", session_token: newTokens.session_token || raw.session_token || "" });
        db.prepare("UPDATE gpt_accounts SET tokens=?,auth_file=?,raw_payload=?,refresh_status='done',last_refresh_at=?,error='',error_category='none',updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(newTokens), JSON.stringify(newAuthFile), JSON.stringify(newRawPayload), refreshNow, refreshNow, refreshAccountId, session.user_id);
        db.prepare("UPDATE gpt_jobs SET status='done',detail='OAuth token refresh completed successfully',updated_at=? WHERE id=?").run(refreshNow, job.lastInsertRowid);
        logGptEvent(session.user_id, refreshAccountId, "refresh-success", "GPT account token refreshed", { email: gptAcc.email });
        return send(res, 200, { ok: true, job_id: job.lastInsertRowid, local_job_id: job.lastInsertRowid, status: "done" });
      } catch (e) {
        var catchMsg = String(e.message || e).substring(0, 220);
        db.prepare("UPDATE gpt_jobs SET status='failed',detail=?,updated_at=? WHERE id=?").run(catchMsg, refreshNow, job.lastInsertRowid);
        db.prepare("UPDATE gpt_accounts SET refresh_status='failed',error=?,updated_at=? WHERE id=? AND user_id=?").run(catchMsg, refreshNow, refreshAccountId, session.user_id);
        return send(res, 200, { ok: false, error: catchMsg, job_id: job.lastInsertRowid, local_job_id: job.lastInsertRowid, status: "failed" });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/gpt-workbench/refresh-status") {
      var refreshId = parseInt(url.searchParams.get("job_id") || url.searchParams.get("local_job_id") || "0", 10);
      var refreshJob = refreshId ? db.prepare("SELECT * FROM gpt_jobs WHERE id=? AND user_id=?").get(refreshId, session.user_id) : null;
      return send(res, 200, { ok: true, done: true, status: refreshJob && refreshJob.status || "done", job: refreshJob || null, log: refreshJob && refreshJob.detail || "" });
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-workbench/cpa-scan") {
      var cpaBody = JSON.parse(await readBody(req) || "{}");
      var cpaBaseUrl = String(cpaBody.base_url || "").trim();
      var cpaKey = String(cpaBody.management_key || "").trim();
      if (!cpaBaseUrl || !cpaKey) return send(res, 400, { ok: false, error: "CPA base_url and management_key required" });
      var cpaMaxItems = parseInt(cpaBody.max_items, 10) || 50;
      var cpaProxyUrl = cpaBody.use_proxy ? (String(cpaBody.proxy_url || "").trim() || "") : "";
      try {
        var cpaScanUrl = cpaBaseUrl + "/api/v1/auths?limit=" + cpaMaxItems;
        var cpaHeaders = { "Authorization": "Bearer " + cpaKey, "Accept": "application/json" };
        var cpaRes = cpaProxyUrl ? await requestWithProxy("GET", cpaScanUrl, cpaProxyUrl, { headers: cpaHeaders, timeout: 30000 }) : await request("GET", cpaScanUrl, { headers: cpaHeaders, timeout: 30000 });
        if (cpaRes.status < 200 || cpaRes.status >= 300) return send(res, 200, { ok: false, error: "CPA API error: HTTP " + cpaRes.status + " - " + String(cpaRes.text || "").substring(0, 120) });
        var cpaData = cpaRes.json || {};
        var cpaItems = Array.isArray(cpaData.auths || cpaData.items || cpaData.data || cpaData) ? (cpaData.auths || cpaData.items || cpaData.data || cpaData) : [];
        var candidates = cpaItems.slice(0, cpaMaxItems).map(function(item) {
          var authFile = item.auth_file || item.authFile || item.session || {};
          var email = item.email || item.account || authFile.email || "";
          var statusVal = item.status || item.state || "unknown";
          var statusLabel = statusVal;
          if (statusVal === "banned" || statusVal === "disabled") statusLabel = "封禁";
          else if (statusVal === "restricted" || statusVal === "risk") statusLabel = "风控";
          else if (statusVal === "needs_login" || statusVal === "expired") statusLabel = "需登录";
          else if (statusVal === "healthy" || statusVal === "active" || statusVal === "ok") statusLabel = "可用";
          return {
            name: item.id || item.name || "",
            id: item.id || item.name || "",
            email: email,
            auth_index: item.auth_index || "",
            status: statusVal,
            status_label: statusLabel,
            message: item.message || item.error || "",
            refreshable: statusVal === "needs_login" || statusVal === "expired" || statusVal === "restricted",
            action_hint: statusVal === "needs_login" || statusVal === "expired" ? "建议重新登录刷新" : "",
            auth_file: typeof authFile === "string" ? authFile : JSON.stringify(authFile)
          };
        });
        var cpaSummary = {
          total: cpaItems.length,
          candidates: candidates.length,
          needs_login: candidates.filter(function(c) { return c.refreshable; }).length,
          credential_ok: candidates.filter(function(c) { return c.status === "healthy" || c.status === "active" || c.status === "ok"; }).length,
          banned: candidates.filter(function(c) { return c.status === "banned" || c.status === "disabled"; }).length,
          risk: candidates.filter(function(c) { return c.status === "restricted" || c.status === "risk"; }).length,
          limited: candidates.filter(function(c) { return c.status === "limited" || c.status === "capped"; }).length
        };
        logGptEvent(session.user_id, 0, "cpa-scan", "CPA scan completed", { total: cpaSummary.total, candidates: cpaSummary.candidates });
        return send(res, 200, { ok: true, candidates: candidates, summary: cpaSummary, diagnostics: candidates });
      } catch (e) {
        return send(res, 200, { ok: false, error: "CPA scan failed: " + String(e.message || e).substring(0, 120) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/gpt-workbench/cpa-delete") {
      var cpaDelBody = JSON.parse(await readBody(req) || "{}");
      var cpaDelBaseUrl = String(cpaDelBody.base_url || "").trim();
      var cpaDelKey = String(cpaDelBody.management_key || "").trim();
      var cpaDelItems = Array.isArray(cpaDelBody.items) ? cpaDelBody.items : [];
      if (!cpaDelBaseUrl || !cpaDelKey) return send(res, 400, { ok: false, error: "CPA base_url and management_key required" });
      var cpaDelProxyUrl = String(cpaDelBody.proxy_url || cpaDelBody.use_proxy ? cpaDelBody.proxy_url : "").trim();
      var deletedCount = 0;
      var deleteErrors = [];
      for (var dIdx = 0; dIdx < cpaDelItems.length; dIdx++) {
        var delItem = cpaDelItems[dIdx];
        var delId = delItem.name || delItem.id;
        if (!delId) continue;
        try {
          var delUrl = cpaDelBaseUrl + "/api/v1/auths/" + encodeURIComponent(delId);
          var delHeaders = { "Authorization": "Bearer " + cpaDelKey, "Accept": "application/json" };
          var delRes = cpaDelProxyUrl ? await requestWithProxy("DELETE", delUrl, cpaDelProxyUrl, { headers: delHeaders, timeout: 15000 }) : await request("DELETE", delUrl, { headers: delHeaders, timeout: 15000 });
          if (delRes.status >= 200 && delRes.status < 300) deletedCount++;
          else deleteErrors.push(delId + ": HTTP " + delRes.status);
        } catch (delErr) {
          deleteErrors.push(delId + ": " + String(delErr.message || delErr).substring(0, 60));
        }
      }
      logGptEvent(session.user_id, 0, "cpa-delete", "CPA auths deleted", { deleted: deletedCount, errors: deleteErrors.length });
      return send(res, 200, { ok: true, deleted: deletedCount, errors: deleteErrors, summary: { deleted: deletedCount, failed: deleteErrors.length } });
    }
    if (req.method === "GET" && url.pathname === "/api/wenas/config") {
      var wenas = db.prepare("SELECT * FROM wenas_configs WHERE user_id=?").get(session.user_id);
      return send(res, 200, { ok: true, configured: !!(wenas && wenas.configured), config: wenas ? parseJson(wenas.config, {}) : {} });
    }
    if (req.method === "POST" && url.pathname === "/api/wenas/config") {
      var wenasBody = JSON.parse(await readBody(req) || "{}");
      var wcfg = wenasBody.config || {};
      var configured = !!(wcfg.base_url && wcfg.api_key && wcfg.api_secret);
      db.prepare("INSERT INTO wenas_configs (user_id,config,configured,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET config=excluded.config,configured=excluded.configured,updated_at=excluded.updated_at").run(session.user_id, JSON.stringify(wcfg), configured ? 1 : 0, new Date().toISOString());
      return send(res, 200, { ok: true, configured: configured, config: wcfg });
    }
    if (req.method === "POST" && url.pathname === "/api/wenas/test") {
      var wenasTestWcfg = db.prepare("SELECT config FROM wenas_configs WHERE user_id=?").get(session.user_id);
      if (!wenasTestWcfg) return send(res, 200, { ok: false, error: "wenas config not saved" });
      var wenasTestConfig = parseJson(wenasTestWcfg.config, {});
      var wenasTestBaseUrl = String(wenasTestConfig.base_url || "").trim();
      if (!wenasTestBaseUrl) return send(res, 200, { ok: false, error: "wenas base_url not configured" });
      try {
        var wenasTestRes = await request("GET", wenasTestBaseUrl + "/api/v1/ping", { headers: { "X-API-Key": wenasTestConfig.api_key || "", "X-API-Secret": wenasTestConfig.api_secret || "", "Accept": "application/json" }, timeout: 10000 });
        if (wenasTestRes.status >= 200 && wenasTestRes.status < 300) {
          return send(res, 200, { ok: true, reachable: true, message: "wenas connection test successful", response: wenasTestRes.json || {} });
        }
        return send(res, 200, { ok: true, reachable: false, message: "wenas returned HTTP " + wenasTestRes.status });
      } catch (wenasTestErr) {
        return send(res, 200, { ok: true, reachable: false, message: "wenas connection failed: " + String(wenasTestErr.message || wenasTestErr).substring(0, 120) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/wenas/inventory/sync") {
      var wSyncBody = JSON.parse(await readBody(req) || "{}");
      var wSyncIds = Array.isArray(wSyncBody.ids) ? wSyncBody.ids.map(Number).filter(Boolean) : [];
      if (!wSyncIds.length) return send(res, 200, { ok: true, created: 0, skipped: 0 });
      var wSyncWcfg = db.prepare("SELECT config FROM wenas_configs WHERE user_id=?").get(session.user_id);
      if (!wSyncWcfg) return send(res, 200, { ok: false, error: "wenas not configured" });
      var wSyncConfig = parseJson(wSyncWcfg.config, {});
      var wSyncBaseUrl = String(wSyncConfig.base_url || "").trim();
      if (!wSyncBaseUrl) return send(res, 200, { ok: false, error: "wenas base_url not configured" });
      var wSyncCreated = 0;
      var wSyncSkipped = 0;
      var wSyncErrors = [];
      var wSyncHeaders = { "X-API-Key": wSyncConfig.api_key || "", "X-API-Secret": wSyncConfig.api_secret || "", "Content-Type": "application/json", "Accept": "application/json" };
      for (var wsi = 0; wsi < wSyncIds.length; wsi++) {
        var wsAccId = wSyncIds[wsi];
        var wsAcc = db.prepare("SELECT * FROM gpt_accounts WHERE id=? AND user_id=?").get(wsAccId, session.user_id);
        if (!wsAcc) { wSyncSkipped++; continue; }
        var wsPayload = {
          product_id: parseInt(wSyncConfig.product_id, 10) || 0,
          product_slug: wSyncConfig.product_slug || "",
          external_product_id: wSyncConfig.external_product_id || "",
          sku_id: parseInt(wSyncConfig.sku_id, 10) || 0,
          sku_code: wSyncConfig.sku_code || "",
          batch_no: (wSyncConfig.batch_no_prefix || "mailops") + "-" + crypto.randomBytes(4).toString("hex"),
          card_secret: wsAcc.email + ":" + (wsAcc.password || ""),
          source_platform: wSyncConfig.source_platform || "mailops",
          metadata: { email: wsAcc.email, account_id: wsAcc.account_id || wsAcc.id, plan: wsAcc.plan || "", status: wsAcc.status || "" },
          supplier_callback_url: wSyncConfig.supplier_callback_url || ""
        };
        try {
          var wsRes = await request("POST", wSyncBaseUrl + "/api/v1/cards", { body: JSON.stringify(wsPayload), headers: wSyncHeaders, timeout: 15000 });
          if (wsRes.status >= 200 && wsRes.status < 300 && wsRes.json && wsRes.json.ok) {
            var wsCardData = wsRes.json;
            wSyncCreated++;
            db.prepare("UPDATE gpt_accounts SET wenas_status='synced',wenas_sync_status='created',wenas_card_secret_id=?,wenas_batch_no=?,wenas_sync_error='',updated_at=? WHERE id=? AND user_id=?").run(String(wsCardData.card_secret_id || wsCardData.id || ""), String(wsPayload.batch_no), new Date().toISOString(), wsAccId, session.user_id);
          } else {
            wSyncSkipped++;
            var wsErrMsg = String(wsRes.json && (wsRes.json.error || wsRes.json.message) || wsRes.text || "sync failed").substring(0, 120);
            db.prepare("UPDATE gpt_accounts SET wenas_sync_error=?,updated_at=? WHERE id=? AND user_id=?").run(wsErrMsg, new Date().toISOString(), wsAccId, session.user_id);
            wSyncErrors.push(wsAcc.email + ": " + wsErrMsg);
          }
        } catch (wsErr) {
          wSyncSkipped++;
          wSyncErrors.push(wsAcc.email + ": " + String(wsErr.message || wsErr).substring(0, 60));
          db.prepare("UPDATE gpt_accounts SET wenas_sync_error=?,updated_at=? WHERE id=? AND user_id=?").run(String(wsErr.message || wsErr).substring(0, 60), new Date().toISOString(), wsAccId, session.user_id);
        }
      }
      logGptEvent(session.user_id, 0, "wenas-sync", "Wenas inventory sync", { created: wSyncCreated, skipped: wSyncSkipped, errors: wSyncErrors.length });
      return send(res, 200, { ok: true, created: wSyncCreated, skipped: wSyncSkipped, errors: wSyncErrors });
    }
    if (req.method === "POST" && url.pathname === "/api/wenas/check-tasks") {
      var wTaskBody = JSON.parse(await readBody(req) || "{}");
      var wTaskIds = Array.isArray(wTaskBody.ids) ? wTaskBody.ids.map(Number).filter(Boolean) : [];
      if (!wTaskIds.length) return send(res, 200, { ok: true, created: [] });
      var wTaskWcfg = db.prepare("SELECT config FROM wenas_configs WHERE user_id=?").get(session.user_id);
      if (!wTaskWcfg) return send(res, 200, { ok: false, error: "wenas not configured" });
      var wTaskConfig = parseJson(wTaskWcfg.config, {});
      var wTaskBaseUrl = String(wTaskConfig.base_url || "").trim();
      if (!wTaskBaseUrl) return send(res, 200, { ok: false, error: "wenas base_url not configured" });
      var wTaskHeaders = { "X-API-Key": wTaskConfig.api_key || "", "X-API-Secret": wTaskConfig.api_secret || "", "Content-Type": "application/json", "Accept": "application/json" };
      var wTaskCreated = [];
      var wTaskResult = String(wTaskBody.result || "success");
      var wTaskMessage = String(wTaskBody.message || "");
      var wTaskConfidence = parseFloat(wTaskBody.confidence) || 1;
      for (var wtIdx = 0; wtIdx < wTaskIds.length; wtIdx++) {
        var wtAccId = wTaskIds[wtIdx];
        var wtAcc = db.prepare("SELECT * FROM gpt_accounts WHERE id=? AND user_id=?").get(wtAccId, session.user_id);
        if (!wtAcc) continue;
        var wtPayload = {
          card_secret_id: wtAcc.wenas_card_secret_id || "",
          batch_no: wtAcc.wenas_batch_no || "",
          email: wtAcc.email || "",
          result: wTaskResult,
          confidence: wTaskConfidence,
          message: wTaskMessage || "Account check: " + wTaskResult,
          source_platform: wTaskConfig.source_platform || "mailops",
          supplier_callback_url: wTaskConfig.supplier_callback_url || ""
        };
        try {
          var wtRes = await request("POST", wTaskBaseUrl + "/api/v1/check-tasks", { body: JSON.stringify(wtPayload), headers: wTaskHeaders, timeout: 15000 });
          var wtTaskId = String(wtRes.json && wtRes.json.task_id || wtRes.json && wtRes.json.id || "local-" + wtAccId);
          wTaskCreated.push({ id: wtAccId, task_id: wtTaskId });
          db.prepare("UPDATE gpt_accounts SET wenas_check_task_id=?,livecheck_status='pending',updated_at=? WHERE id=? AND user_id=?").run(wtTaskId, new Date().toISOString(), wtAccId, session.user_id);
        } catch (wtErr) {
          wTaskCreated.push({ id: wtAccId, task_id: "error", error: String(wtErr.message || wtErr).substring(0, 60) });
        }
      }
      logGptEvent(session.user_id, 0, "wenas-check", "Wenas check tasks created", { count: wTaskCreated.length });
      return send(res, 200, { ok: true, created: wTaskCreated });
    }
    if (req.method === "POST" && url.pathname === "/api/wenas/check-tasks/result") {
      var wResultBody = JSON.parse(await readBody(req) || "{}");
      var wResultIds = Array.isArray(wResultBody.ids) ? wResultBody.ids.map(Number).filter(Boolean) : [];
      if (!wResultIds.length) return send(res, 200, { ok: true });
      var wResultWcfg = db.prepare("SELECT config FROM wenas_configs WHERE user_id=?").get(session.user_id);
      if (!wResultWcfg) return send(res, 200, { ok: false, error: "wenas not configured" });
      var wResultConfig = parseJson(wResultWcfg.config, {});
      var wResultBaseUrl = String(wResultConfig.base_url || "").trim();
      if (!wResultBaseUrl) return send(res, 200, { ok: false, error: "wenas base_url not configured" });
      var wResultHeaders = { "X-API-Key": wResultConfig.api_key || "", "X-API-Secret": wResultConfig.api_secret || "", "Content-Type": "application/json", "Accept": "application/json" };
      var wResultResult = String(wResultBody.result || "success");
      var wResultMessage = String(wResultBody.message || "");
      var wResultConfidence = parseFloat(wResultBody.confidence) || 1;
      var wResultApply = wResultBody.apply_result !== false;
      for (var wrIdx = 0; wrIdx < wResultIds.length; wrIdx++) {
        var wrAccId = wResultIds[wrIdx];
        var wrAcc = db.prepare("SELECT * FROM gpt_accounts WHERE id=? AND user_id=?").get(wrAccId, session.user_id);
        if (!wrAcc) continue;
        try {
          var wrPayload = {
            task_id: wrAcc.wenas_check_task_id || "",
            card_secret_id: wrAcc.wenas_card_secret_id || "",
            result: wResultResult,
            confidence: wResultConfidence,
            message: wResultMessage,
            apply_business_status: wResultApply
          };
          await request("POST", wResultBaseUrl + "/api/v1/check-tasks/result", { body: JSON.stringify(wrPayload), headers: wResultHeaders, timeout: 15000 });
          db.prepare("UPDATE gpt_accounts SET livecheck_status=?,livecheck_result=?,livecheck_message=?,livecheck_checked_at=?,updated_at=? WHERE id=? AND user_id=?").run(wResultResult, wResultResult, wResultMessage, new Date().toISOString(), new Date().toISOString(), wrAccId, session.user_id);
        } catch (wrErr) {
          db.prepare("UPDATE gpt_accounts SET livecheck_status='error',livecheck_message=?,updated_at=? WHERE id=? AND user_id=?").run(String(wrErr.message || wrErr).substring(0, 60), new Date().toISOString(), wrAccId, session.user_id);
        }
      }
      logGptEvent(session.user_id, 0, "wenas-result", "Wenas check results submitted", { count: wResultIds.length });
      return send(res, 200, { ok: true, count: wResultIds.length });
    }
    if (req.method === "GET" && url.pathname === "/api/delivery-test/status") return send(res, 200, { ok: true, state: deliveryStates[session.user_id] || { running: false, total: 0, done: 0, log: "", results: [] } });
    if (req.method === "POST" && url.pathname === "/api/delivery-test/start") {
      var dtBody = JSON.parse(await readBody(req) || "{}");
      var dtEmail = String(dtBody.email || "").trim();
      if (!dtEmail) return send(res, 400, { ok: false, error: "email required" });
      var dtAcc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(session.user_id, dtEmail);
      if (!dtAcc) return send(res, 404, { ok: false, error: "account not found" });
      var dtCode = "DT-" + crypto.randomBytes(4).toString("hex").toUpperCase();
      deliveryStates[session.user_id] = { running: true, email: dtEmail, code: dtCode, total: 1, done: 0, log: "实测开始: 测试码 " + dtCode + "\n正在发送测试邮件到 " + dtEmail + "...", results: [], started_at: new Date().toISOString() };
      try {
        var dtToken = await refreshGraphAccessToken(dtAcc);
        if (dtToken.refresh_token) {
          db.prepare("UPDATE accounts SET refresh_token_enc=?,updated_at=? WHERE id=? AND user_id=?").run(encrypt(dtToken.refresh_token), new Date().toISOString(), dtAcc.id, session.user_id);
        }
        var dtMailBody = JSON.stringify({ message: { subject: "Delivery Test " + dtCode, body: { contentType: "Text", content: "This is an automated delivery test. Code: " + dtCode + ". Timestamp: " + new Date().toISOString() }, toRecipients: [{ emailAddress: { address: dtEmail } }] } });
        var dtSendRes = await request("POST", "https://graph.microsoft.com/v1.0/me/sendMail", { body: dtMailBody, headers: { Authorization: "Bearer " + dtToken.access_token, "Content-Type": "application/json" } });
        if (dtSendRes.status >= 200 && dtSendRes.status < 300) {
          deliveryStates[session.user_id].log += "\n测试邮件已发送，等待收件确认...";
        } else {
          deliveryStates[session.user_id].log += "\n发送失败: HTTP " + dtSendRes.status;
          deliveryStates[session.user_id].running = false;
        }
      } catch (dtErr) {
        deliveryStates[session.user_id].log += "\n发送测试邮件出错: " + String(dtErr.message || dtErr).substring(0, 120);
        deliveryStates[session.user_id].running = false;
      }
      return send(res, 200, { ok: true, smtp_configured: true, state: deliveryStates[session.user_id], code: dtCode });
    }
    if (req.method === "POST" && url.pathname === "/api/delivery-test/check") {
      var dtCheckBody = JSON.parse(await readBody(req) || "{}");
      var dtState = deliveryStates[session.user_id];
      if (!dtState || !dtState.running) return send(res, 200, { ok: true, state: dtState || { running: false, total: 0, done: 0, log: "", results: [] } });
      var dtCheckEmail = dtState.email;
      var dtCheckCode = dtState.code;
      var dtCheckAcc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(session.user_id, dtCheckEmail);
      if (!dtCheckAcc) {
        dtState.running = false;
        dtState.log += "\n账户不存在，实测终止";
        return send(res, 200, { ok: true, state: dtState });
      }
      try {
        var dtCheckToken = await refreshGraphAccessToken(dtCheckAcc);
        if (dtCheckToken.refresh_token) {
          db.prepare("UPDATE accounts SET refresh_token_enc=?,updated_at=? WHERE id=? AND user_id=?").run(encrypt(dtCheckToken.refresh_token), new Date().toISOString(), dtCheckAcc.id, session.user_id);
        }
        var folders = ["inbox", "junkemail"];
        for (var fIdx = 0; fIdx < folders.length; fIdx++) {
          var dtFolder = folders[fIdx];
          var dtMsgUrl = "https://graph.microsoft.com/v1.0/me/mailFolders/" + dtFolder + "/messages?$top=10&$select=subject,receivedDateTime&$orderby=receivedDateTime desc&$filter=subject eq 'Delivery Test " + dtCheckCode + "'";
          var dtMsgRes = await request("GET", dtMsgUrl, { headers: { Authorization: "Bearer " + dtCheckToken.access_token, Accept: "application/json" } });
          if (dtMsgRes.json && Array.isArray(dtMsgRes.json.value) && dtMsgRes.json.value.length > 0) {
            var dtFound = dtMsgRes.json.value[0];
            var dtFolderLabel = dtFolder === "junkemail" ? "垃圾箱" : "收件箱";
            dtState.done = 1;
            dtState.running = false;
            dtState.log += "\n找到测试邮件！位于" + dtFolderLabel + "，主题: " + (dtFound.subject || "") + "，时间: " + (dtFound.receivedDateTime || "");
            dtState.results.push({ email: dtCheckEmail, folder: dtFolderLabel, found: true, subject: dtFound.subject || "", received_at: dtFound.receivedDateTime || "" });
            return send(res, 200, { ok: true, state: dtState, found: true, folder: dtFolderLabel });
          }
        }
        dtState.log += "\n尚未在收件箱或垃圾箱找到测试邮件，继续等待...";
        return send(res, 200, { ok: true, state: dtState, found: false });
      } catch (dtCheckErr) {
        dtState.log += "\n检查收件箱出错: " + String(dtCheckErr.message || dtCheckErr).substring(0, 120);
        return send(res, 200, { ok: true, state: dtState, found: false });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/delivery-test/batch") {
      var dtBatchBody = JSON.parse(await readBody(req) || "{}");
      var dtBatchIds = Array.isArray(dtBatchBody.ids) ? dtBatchBody.ids.map(Number).filter(Boolean) : [];
      var dtBatchWait = parseInt(dtBatchBody.wait_seconds, 10) || 90;
      var dtBatchConcurrency = parseInt(dtBatchBody.concurrency, 10) || 2;
      if (!dtBatchIds.length) {
        var dtBatchUrl = new URL("http://localhost/api/mailboxes");
        if (dtBatchBody.category) dtBatchUrl.searchParams.set("category", dtBatchBody.category);
        dtBatchUrl.searchParams.set("include_used", "0");
        dtBatchUrl.searchParams.set("include_reserved", "0");
        dtBatchUrl.searchParams.set("include_unhealthy", "0");
        var qDt = accountSelectableWhere(dtBatchUrl, false);
        dtBatchIds = stmtAll("SELECT id FROM accounts WHERE " + qDt.where, [session.user_id].concat(qDt.args)).map(function(r) { return r.id; }).slice(0, parseInt(dtBatchBody.limit, 10) || 50);
      }
      deliveryStates[session.user_id] = { running: true, total: dtBatchIds.length, done: 0, log: "批量实测开始: " + dtBatchIds.length + " 个邮箱\n", results: [], codes: {}, wait_seconds: dtBatchWait };
      async function runDeliveryBatch() {
        for (var bIdx = 0; bIdx < dtBatchIds.length; bIdx++) {
          if (!deliveryStates[session.user_id] || !deliveryStates[session.user_id].running) break;
          var bAccId = dtBatchIds[bIdx];
          var bAcc = db.prepare("SELECT * FROM accounts WHERE id=? AND user_id=?").get(bAccId, session.user_id);
          if (!bAcc) {
            deliveryStates[session.user_id].log += bAcc ? "" : "\n#" + (bIdx + 1) + ": ID " + bAccId + " 不存在";
            deliveryStates[session.user_id].done++;
            continue;
          }
          var bCode = "DT-" + crypto.randomBytes(3).toString("hex").toUpperCase();
          deliveryStates[session.user_id].codes[bAccId] = bCode;
          try {
            var bToken = await refreshGraphAccessToken(bAcc);
            if (bToken.refresh_token) db.prepare("UPDATE accounts SET refresh_token_enc=?,updated_at=? WHERE id=? AND user_id=?").run(encrypt(bToken.refresh_token), new Date().toISOString(), bAcc.id, session.user_id);
            var bMailBody = JSON.stringify({ message: { subject: "Delivery Test " + bCode, body: { contentType: "Text", content: "Delivery test code: " + bCode }, toRecipients: [{ emailAddress: { address: bAcc.email } }] } });
            await request("POST", "https://graph.microsoft.com/v1.0/me/sendMail", { body: bMailBody, headers: { Authorization: "Bearer " + bToken.access_token, "Content-Type": "application/json" } });
            deliveryStates[session.user_id].log += "\n#" + (bIdx + 1) + " " + bAcc.email + ": 已发送 (code=" + bCode + ")";
          } catch (bErr) {
            deliveryStates[session.user_id].log += "\n#" + (bIdx + 1) + " " + bAcc.email + ": 发送失败 - " + String(bErr.message || bErr).substring(0, 60);
            deliveryStates[session.user_id].done++;
            deliveryStates[session.user_id].results.push({ email: bAcc.email, found: false, error: String(bErr.message || bErr).substring(0, 60) });
            continue;
          }
          await new Promise(function(r) { setTimeout(r, 2000); });
          try {
            var bToken2 = await refreshGraphAccessToken(bAcc);
            var bFolders = ["inbox", "junkemail"];
            var bFound = false;
            for (var bfIdx = 0; bfIdx < bFolders.length && !bFound; bfIdx++) {
              var bMsgRes = await request("GET", "https://graph.microsoft.com/v1.0/me/mailFolders/" + bFolders[bfIdx] + "/messages?$top=5&$select=subject,receivedDateTime&$orderby=receivedDateTime desc&$filter=subject eq 'Delivery Test " + bCode + "'", { headers: { Authorization: "Bearer " + bToken2.access_token, Accept: "application/json" } });
              if (bMsgRes.json && Array.isArray(bMsgRes.json.value) && bMsgRes.json.value.length > 0) {
                bFound = true;
                var bFolderLabel = bFolders[bfIdx] === "junkemail" ? "垃圾箱" : "收件箱";
                deliveryStates[session.user_id].log += " → 在" + bFolderLabel + "收到";
                deliveryStates[session.user_id].results.push({ email: bAcc.email, found: true, folder: bFolderLabel, code: bCode });
              }
            }
            if (!bFound) {
              deliveryStates[session.user_id].log += " → 尚未收到(将在后续检查)";
              deliveryStates[session.user_id].results.push({ email: bAcc.email, found: false, pending: true, code: bCode });
            }
          } catch (bCheckErr) {
            deliveryStates[session.user_id].log += " → 检查失败: " + String(bCheckErr.message || bCheckErr).substring(0, 40);
            deliveryStates[session.user_id].results.push({ email: bAcc.email, found: false, error: String(bCheckErr.message || bCheckErr).substring(0, 60) });
          }
          deliveryStates[session.user_id].done++;
        }
        deliveryStates[session.user_id].running = false;
        deliveryStates[session.user_id].log += "\n批量实测完成";
      }
      runDeliveryBatch();
      return send(res, 200, { ok: true, smtp_configured: true, state: deliveryStates[session.user_id] });
    }
    if (req.method === "POST" && url.pathname === "/api/delivery-test/stop") {
      if (deliveryStates[session.user_id]) {
        deliveryStates[session.user_id].running = false;
        deliveryStates[session.user_id].log += "\n实测已手动停止";
      }
      return send(res, 200, { ok: true, state: deliveryStates[session.user_id] || { running: false, total: 0, done: 0, log: "", results: [] } });
    }
    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var users = db.prepare("SELECT users.*, (SELECT COUNT(*) FROM accounts WHERE accounts.user_id=users.id) AS account_count, (SELECT COUNT(*) FROM api_keys WHERE api_keys.user_id=users.id) AS api_key_count FROM users ORDER BY id").all().map(publicUser);
      return send(res, 200, { ok: true, users: users });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/users") {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var newUserBody = JSON.parse(await readBody(req) || "{}");
      try { return send(res, 200, { ok: true, user: createUser(newUserBody.username, newUserBody.password, newUserBody.role || "user") }); } catch (e) { return send(res, 200, { ok: false, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/admin/users/") === 0) {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var userParts = url.pathname.split("/");
      var targetUserId = parseInt(userParts[4], 10);
      var actionUser = userParts[5];
      var userBody = JSON.parse(await readBody(req) || "{}");
      if (targetUserId === session.user_id && (actionUser === "disable" || actionUser === "delete")) return send(res, 400, { ok: false, error: "cannot modify current user this way" });
      if (actionUser === "role") db.prepare("UPDATE users SET role=? WHERE id=?").run(userBody.role === "admin" ? "admin" : "user", targetUserId);
      else if (actionUser === "password") {
        if (String(userBody.password || "").length < 8) return send(res, 400, { ok: false, error: "password too short" });
        var saltUser = crypto.randomBytes(16).toString("base64");
        db.prepare("UPDATE users SET password_salt=?,password_hash=? WHERE id=?").run(saltUser, hashPassword(userBody.password, saltUser), targetUserId);
      } else if (actionUser === "disable") {
        db.prepare("UPDATE users SET disabled=? WHERE id=?").run(userBody.disabled ? 1 : 0, targetUserId);
        if (userBody.disabled) db.prepare("DELETE FROM sessions WHERE user_id=?").run(targetUserId);
      } else if (actionUser === "delete") db.prepare("DELETE FROM users WHERE id=?").run(targetUserId);
      else return send(res, 404, { ok: false, error: "not found" });
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/mail-rules") return send(res, 200, { ok: true, rules: getRuleConfig(session.user_id) });
    if (req.method === "POST" && url.pathname === "/api/mail-rules") {
      var ruleBody = JSON.parse(await readBody(req) || "{}");
      return send(res, 200, { ok: true, rules: saveRuleConfig(session.user_id, ruleBody) });
    }
    if (req.method === "GET" && url.pathname === "/api/mailboxes") {
      return sendMailboxes(res, url, session);
    }
    if (req.method === "GET" && url.pathname === "/api/categories") {
      releaseExpiredLeases(session.user_id);
      var cats = db.prepare("SELECT category, COUNT(*) AS count FROM accounts WHERE user_id=? GROUP BY category ORDER BY count DESC, category").all(session.user_id);
      var byCat = {};
      cats.forEach(function(c) { byCat[c.category] = c; });
      configuredCategories(session.user_id).forEach(function(c) { if (!byCat[c]) { byCat[c] = { category: c, count: 0 }; cats.push(byCat[c]); } });
      ["new", "invalid", "error"].forEach(function(c) { if (!byCat[c]) cats.push({ category: c, count: 0 }); });
      var totalCat = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id=?").get(session.user_id).c;
      var usedCat = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id=? AND used=1").get(session.user_id).c;
      var takeableCat = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id=? AND used=0 AND reserved=0 AND COALESCE(code_health,'unknown') NOT IN ('no_code','blocked','unhealthy') AND category!='no_code'").get(session.user_id).c;
      return send(res, 200, { ok: true, categories: cats, total: totalCat, used_count: usedCat, available_count: Math.max(0, totalCat - usedCat), takeable_count: takeableCat, used_breakdown: db.prepare("SELECT category, COUNT(*) AS count FROM accounts WHERE user_id=? AND used=1 GROUP BY category").all(session.user_id) });
    }
    if (req.method === "GET" && url.pathname === "/api/messages") {
      var msgEmail = String(url.searchParams.get("email") || "").trim();
      var folder = url.searchParams.get("folder") || "inbox";
      var msgLimit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
      if (!msgEmail) return send(res, 400, { ok: false, error: "email required" });
      var msgAcc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(session.user_id, msgEmail);
      if (!msgAcc) return send(res, 404, { ok: false, error: "account not found" });
      try {
        var msgs = await fetchFolderMessages(msgAcc, folder, msgLimit);
        return send(res, 200, { ok: true, email: msgAcc.email, folder: graphFolder(folder), messages: msgs });
      } catch (e) {
        var cachedMessages = parseJson(msgAcc.last_messages, []).slice(0, msgLimit);
        if (cachedMessages.length) return send(res, 200, { ok: true, email: msgAcc.email, folder: graphFolder(folder), messages: cachedMessages, cached: true, refresh_error: String(e.message || e).substring(0, 220) });
        throw e;
      }
    }
    if (req.method === "POST" && url.pathname === "/api/accounts/test") {
      var testBody = JSON.parse(await readBody(req) || "{}");
      var testEmail = String(testBody.email || "").trim();
      var testAcc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND lower(email)=lower(?)").get(session.user_id, testEmail);
      if (!testAcc) return send(res, 404, { ok: false, error: "account not found" });
      try {
        var testMessages = await fetchFolderMessages(testAcc, testBody.folder || "inbox", 1);
        return send(res, 200, { ok: true, email: testEmail, readable: true, message_count: testMessages.length, sample_subject: testMessages[0] && testMessages[0].subject || "" });
      } catch (e) {
        var testMsg = String(e.message || e).substring(0, 220);
        var testStatus = /invalid_grant|expired|revoked|AADSTS|permission|consent/i.test(testMsg) ? "invalid" : "error";
        return send(res, 200, { ok: false, email: testEmail, readable: false, status: testStatus, error: testMsg });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/invites") {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var invites = db.prepare("SELECT * FROM invites ORDER BY id DESC LIMIT 200").all().map(publicInvite);
      return send(res, 200, { ok: true, invites: invites });
    }
    if (req.method === "POST" && url.pathname === "/api/invites") {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var inviteBody = JSON.parse(await readBody(req) || "{}");
      var inv = createInvite(session.user_id, inviteBody.max_uses, inviteBody.ttl_hours);
      return send(res, 200, { ok: true, invite: publicInvite(inv) });
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/invites/") === 0 && url.pathname.endsWith("/disable")) {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var inviteId = parseInt(url.pathname.split("/")[3], 10);
      db.prepare("UPDATE invites SET disabled=1 WHERE id=?").run(inviteId);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname.indexOf("/api/invites/") === 0 && url.pathname.endsWith("/delete")) {
      if (!isAdmin(session)) return send(res, 403, { ok: false, error: "admin only" });
      var inviteDeleteId = parseInt(url.pathname.split("/")[3], 10);
      var inviteDelete = db.prepare("DELETE FROM invites WHERE id=?").run(inviteDeleteId);
      return send(res, 200, { ok: true, deleted: inviteDelete.changes });
    }
    if (req.method === "GET" && url.pathname === "/api/accounts") {
      var page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      var limitPage = Math.max(10, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));
      var offset = (page - 1) * limitPage;
      var accountListUrl = new URL(url.toString());
      if (!accountListUrl.searchParams.has("used") && !accountListUrl.searchParams.has("unused") && !accountListUrl.searchParams.has("takeable")) {
        if (!accountListUrl.searchParams.has("include_used")) accountListUrl.searchParams.set("include_used", "1");
        if (!accountListUrl.searchParams.has("include_reserved")) accountListUrl.searchParams.set("include_reserved", "1");
        if (!accountListUrl.searchParams.has("include_unhealthy")) accountListUrl.searchParams.set("include_unhealthy", "1");
      }
      var qAccounts = accountSelectableWhere(accountListUrl, true);
      var totalRow = stmtGet("SELECT COUNT(*) AS c FROM accounts WHERE " + qAccounts.where, [session.user_id].concat(qAccounts.args));
      var rows = stmtAll("SELECT * FROM accounts WHERE " + qAccounts.where + " ORDER BY id DESC LIMIT ? OFFSET ?", [session.user_id].concat(qAccounts.args, [limitPage, offset]));
      return send(res, 200, { ok: true, accounts: rows.map(publicAccountExtended), total: totalRow.c, page: page, limit: limitPage });
    }
    if (req.method === "POST" && url.pathname === "/api/accounts/import") {
      var data = JSON.parse(await readBody(req) || "{}");
      var importResult = importAccountsForUser(session.user_id, data);
      if (data.auto_scan && importResult.added_ids.length) runScan(session.user_id, importResult.added_ids, parseInt(data.concurrency || 3, 10), parseInt(data.limit || 20, 10));
      return send(res, 200, { ok: true, parsed: importResult.parsed, added: importResult.added, updated: importResult.updated });
    }
    if (req.method === "POST" && url.pathname === "/api/accounts/bulk-delete") {
      var bulkDel = JSON.parse(await readBody(req) || "{}");
      var idsDel = Array.isArray(bulkDel.ids) ? bulkDel.ids.map(Number).filter(Boolean) : [];
      var changesDel = 0;
      var txDel = db.transaction(function(ids) { ids.forEach(function(id) { changesDel += db.prepare("DELETE FROM accounts WHERE id=? AND user_id=?").run(id, session.user_id).changes; }); });
      txDel(idsDel);
      return send(res, 200, { ok: true, requested: idsDel.length, deleted: changesDel, matched: changesDel });
    }
    if (req.method === "POST" && url.pathname === "/api/accounts/bulk-restore-safe") {
      var restoreSafe = JSON.parse(await readBody(req) || "{}");
      var idsSafe = Array.isArray(restoreSafe.ids) ? restoreSafe.ids.map(Number).filter(Boolean) : [];
      var changedSafe = idsSafe.length ? stmtRun("UPDATE accounts SET category='safe',status='safe',used=0,reserved=0,lease_token='',lease_expires_at='',code_health='unknown',code_poll_count=0,reason='restored to safe',updated_at=? WHERE user_id=? AND id IN (" + idsSafe.map(function() { return "?"; }).join(",") + ")", [new Date().toISOString(), session.user_id].concat(idsSafe)).changes : 0;
      return send(res, 200, { ok: true, requested: idsSafe.length, restored: changedSafe, matched: changedSafe });
    }
    if (req.method === "POST" && url.pathname === "/api/accounts/bulk-restore-used") {
      var restoreUsed = JSON.parse(await readBody(req) || "{}");
      var idsUsed = Array.isArray(restoreUsed.ids) ? restoreUsed.ids.map(Number).filter(Boolean) : [];
      var changedUsed = idsUsed.length ? stmtRun("UPDATE accounts SET category='used',status='used',used=1,reserved=0,lease_token='',lease_expires_at='',reason='restored to used',updated_at=? WHERE user_id=? AND id IN (" + idsUsed.map(function() { return "?"; }).join(",") + ")", [new Date().toISOString(), session.user_id].concat(idsUsed)).changes : 0;
      return send(res, 200, { ok: true, requested: idsUsed.length, restored: changedUsed, matched: changedUsed });
    }
    if (req.method === "POST" && url.pathname === "/api/accounts/delete-category") {
      var delCatBody = JSON.parse(await readBody(req) || "{}");
      var delCategory = String(delCatBody.category || "").trim();
      if (!delCategory) return send(res, 400, { ok: false, error: "category required" });
      db.prepare("DELETE FROM mail_query_links WHERE user_id=? AND email IN (SELECT email FROM accounts WHERE user_id=? AND category=?)").run(session.user_id, session.user_id, delCategory);
      var delCatWeb = db.prepare("DELETE FROM accounts WHERE user_id=? AND category=?").run(session.user_id, delCategory);
      return send(res, 200, { ok: true, category: delCategory, deleted: delCatWeb.changes });
    }
    if (req.method === "POST" && url.pathname === "/api/scan/start") {
      var userScan = scanStates[session.user_id] || emptyScanState();
      if (userScan.running) return send(res, 200, { ok: false, error: "scan already running" });
      var body = JSON.parse(await readBody(req) || "{}");
      runScan(session.user_id, Array.isArray(body.ids) ? body.ids : [], parseInt(body.concurrency || 3, 10), parseInt(body.limit || 50, 10));
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/scan/filter") {
      var userScan2 = scanStates[session.user_id] || emptyScanState();
      if (userScan2.running) return send(res, 200, { ok: false, error: "scan already running" });
      var fb = JSON.parse(await readBody(req) || "{}");
      var where = "user_id=?", args = [session.user_id];
      if (fb.scope === "unused") where += " AND used=0 AND category IN ('safe','new')";
      else if (fb.scope === "takeable") where += " AND used=0 AND reserved=0 AND COALESCE(code_health,'unknown') NOT IN ('no_code','blocked','unhealthy') AND category!='no_code'";
      if (fb.used || fb.include_used) { where += " AND used=1"; }
      if (fb.category) { where += " AND category=?"; args.push(String(fb.category)); }
      if (fb.status) { where += " AND status=?"; args.push(String(fb.status)); }
      var idsForScan = stmtAll("SELECT id FROM accounts WHERE " + where + " ORDER BY id DESC", args).map(function(r) { return r.id; });
      runScan(session.user_id, idsForScan, parseInt(fb.concurrency || 3, 10), parseInt(fb.limit || 50, 10));
      return send(res, 200, { ok: true, count: idsForScan.length });
    }
    if (req.method === "POST" && url.pathname === "/api/scan/stop") { if (!scanStates[session.user_id]) scanStates[session.user_id] = emptyScanState(); scanStates[session.user_id].stop = true; return send(res, 200, { ok: true }); }
    if (req.method === "GET" && url.pathname === "/api/scan/status") return send(res, 200, { ok: true, state: scanStates[session.user_id] || emptyScanState() });
    if (req.method === "GET" && url.pathname === "/api/export") {
      var exportCategory = url.searchParams.get("category") || "";
      var exportStatus = url.searchParams.get("status") || "";
      var filter = exportCategory || exportStatus || "safe";
      var rows2 = exportCategory ? db.prepare("SELECT * FROM accounts WHERE user_id=? AND category=? ORDER BY id DESC").all(session.user_id, exportCategory) : db.prepare("SELECT * FROM accounts WHERE user_id=? AND status=? ORDER BY id DESC").all(session.user_id, filter);
      var lines = rows2.map(exportLine);
      res.writeHead(200, securityHeaders({ "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": "attachment; filename=accounts_" + filter + ".txt", "Cache-Control": "no-store" }));
      return res.end(lines.join("\n") + (lines.length ? "\n" : ""));
    }
    if (req.method === "DELETE" && url.pathname.indexOf("/api/accounts/") === 0) {
      var id = parseInt(url.pathname.split("/").pop(), 10);
      db.prepare("DELETE FROM accounts WHERE id=? AND user_id=?").run(id, session.user_id);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    send(res, 500, { ok: false, error: String(e.message || e) });
  }
});

initDb();
server.listen(PORT, HOST, function() {
  console.log("Mail Admin started");
  console.log("Open: http://" + HOST + ":" + PORT);
  console.log("Database: " + DB_FILE);
  if (ADMIN_PASSWORD === "admin123") console.log("Warning: using default ADMIN_PASSWORD=admin123");
  if (DATA_KEY === "dev-only-change-me") console.log("Warning: set DATA_KEY before real use");
  if (proxyUrl()) console.log("Outbound proxy enabled: " + proxyUrl().replace(/\/\/.*@/, "//***@"));
});
