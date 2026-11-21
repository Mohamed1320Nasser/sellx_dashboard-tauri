//! Offline selling: the PC's local database.
//!
//! One SQLite file (WAL, synchronous=FULL, so a committed action survives a power cut) with:
//!   * `kv`     the local copy of the shop's data (products, customers, ...) and provisional records,
//!              stored as JSON per namespace
//!   * `outbox` the actions the cashier did, oldest first, until the server confirms them
//!   * `meta`   small values: device token, receipt counter, last sync, ...
//! Every queued action is also appended to a plain journal file (and an optional mirror folder, e.g.
//! a USB stick), so it can be re-queued if the database file is ever lost or damaged.
//!
//! Backups are `VACUUM INTO` snapshots, verified before they are kept. A restore is staged and applied
//! at the next start, after a safety snapshot. At start the database is checked; a damaged file is
//! kept aside, the newest good snapshot is restored and the journal re-adds anything newer (an action
//! the server already has comes back "duplicate", so nothing is doubled).

use chrono::{Datelike, Local, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

const SCHEMA_VERSION: i64 = 1;
/// (label, how many are kept); "manual" backups are never removed automatically
const RETENTION: &[(&str, usize)] = &[
    ("auto", 12),
    ("daily", 14),
    ("weekly", 8),
    ("monthly", 6),
    ("shift", 10),
    ("exit", 5),
    ("pre-restore", 5),
    ("pre-migrate", 5),
    ("recovery", 5),
];
const AUTO_EVERY: Duration = Duration::from_secs(4 * 3600);
const PBKDF2_ROUNDS: u32 = 120_000;

pub struct Store {
    conn: Connection,
    root: PathBuf,
    db_path: PathBuf,
    mirror: Option<PathBuf>,
    /// what happened at start (recovery, restore), shown once in the app
    start_note: Option<String>,
}

pub struct OfflineState(pub Mutex<Option<Store>>);

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub label: String,
    pub size: u64,
    pub created_at: String,
    pub pending: i64,
}

type R<T> = Result<T, String>;
fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

fn pragmas(conn: &Connection) -> R<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    )
    .map_err(e)
}

fn migrate(conn: &Connection) -> R<()> {
    let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
    if v > SCHEMA_VERSION {
        return Err(format!("local database is from a newer SellX (schema {v}); update the app"));
    }
    if v < 1 {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE IF NOT EXISTS kv (ns TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (ns, id));
             CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS outbox (
               seq INTEGER PRIMARY KEY AUTOINCREMENT,
               id TEXT NOT NULL UNIQUE,
               kind TEXT NOT NULL,
               body TEXT NOT NULL,
               status TEXT NOT NULL DEFAULT 'pending',
               attempts INTEGER NOT NULL DEFAULT 0,
               last_error TEXT,
               result TEXT,
               created_at TEXT NOT NULL,
               done_at TEXT
             );
             CREATE INDEX IF NOT EXISTS outbox_status ON outbox (status, seq);
             PRAGMA user_version = 1;
             COMMIT;",
        )
        .map_err(e)?;
    }
    Ok(())
}

/// open + integrity check; Err(reason) when the file is damaged
fn open_checked(path: &Path) -> R<Connection> {
    let conn = Connection::open(path).map_err(e)?;
    pragmas(&conn)?;
    let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(e)?;
    if check != "ok" {
        return Err(format!("quick_check: {check}"));
    }
    migrate(&conn)?;
    Ok(conn)
}

/// A snapshot is usable: opens, passes integrity_check, has our tables. Returns pending actions.
fn verify_file(path: &Path) -> R<i64> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
    let check: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(e)?;
    if check != "ok" {
        return Err(format!("integrity_check: {check}"));
    }
    let tables: i64 = conn
        .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('kv','meta','outbox')", [], |r| r.get(0))
        .map_err(e)?;
    if tables != 3 {
        return Err("not a SellX offline database".into());
    }
    conn.query_row("SELECT COUNT(*) FROM outbox WHERE status='pending'", [], |r| r.get(0)).map_err(e)
}

fn sha256_file(path: &Path) -> R<String> {
    let mut f = File::open(path).map_err(e)?;
    let mut h = Sha256::new();
    std::io::copy(&mut f, &mut h).map_err(e)?;
    Ok(hex::encode(h.finalize()))
}

fn label_of(name: &str) -> Option<&str> {
    // sellx-offline-<label>-YYYYMMDD-HHMMSS.db
    let stem = name.strip_prefix("sellx-offline-")?.strip_suffix(".db")?;
    let mut parts = stem.rsplitn(3, '-');
    let (_t, _d) = (parts.next()?, parts.next()?);
    parts.next()
}

impl Store {
    pub fn open(root: &Path) -> R<Store> {
        fs::create_dir_all(root.join("backups")).map_err(e)?;
        fs::create_dir_all(root.join("journal")).map_err(e)?;
        let db_path = root.join("sellx-offline.db");
        let mut note: Option<String> = None;

        // a restore chosen in the app is applied now, before the file is opened
        let pending = sidecar(&db_path, ".restore-pending");
        if pending.exists() {
            match verify_file(&pending) {
                Ok(_) => {
                    if db_path.exists() {
                        if let Ok(c) = Connection::open(&db_path) {
                            let _ = Self::vacuum_into(&c, &root.join("backups"), "pre-restore");
                        }
                    }
                    for s in ["-wal", "-shm"] {
                        let _ = fs::remove_file(sidecar(&db_path, s));
                    }
                    fs::rename(&pending, &db_path).map_err(e)?;
                    note = Some("تمت استعادة النسخة الاحتياطية المختارة".into());
                }
                Err(err) => {
                    let _ = fs::rename(&pending, sidecar(&db_path, ".restore-rejected"));
                    note = Some(format!("النسخة المختارة للاستعادة تالفة ولم تُستخدم ({err})"));
                }
            }
        }

        let conn = match open_checked(&db_path) {
            Ok(c) => c,
            Err(err) => {
                // damaged: keep it aside, restore the newest good snapshot, re-add the journal
                log::error!("[offline] local database damaged: {err}");
                let stamp = Local::now().format("%Y%m%d-%H%M%S");
                let aside = root.join(format!("damaged-{stamp}.db"));
                let _ = fs::rename(&db_path, &aside);
                for s in ["-wal", "-shm"] {
                    let _ = fs::rename(sidecar(&db_path, s), sidecar(&aside, s));
                }
                let mut restored = None;
                for b in list_backups(&root.join("backups")).unwrap_or_default() {
                    let p = root.join("backups").join(&b.name);
                    if verify_file(&p).is_ok() && fs::copy(&p, &db_path).is_ok() {
                        restored = Some(b.name.clone());
                        break;
                    }
                }
                let conn = open_checked(&db_path)?;
                note = Some(match &restored {
                    Some(n) => format!("قاعدة البيانات المحلية كانت تالفة: تمت الاستعادة من {n} وإعادة العمليات من السجل"),
                    None => "قاعدة البيانات المحلية كانت تالفة: بدأت قاعدة جديدة وأُعيدت العمليات من السجل".into(),
                });
                conn
            }
        };
        let mut store = Store { conn, root: root.to_path_buf(), db_path, mirror: None, start_note: note };
        store.mirror = store.meta_get("journalMirror")?.map(PathBuf::from);
        // journal lines newer than what the database has are queued again (no-op when all present)
        let readded = store.replay_journal()?;
        if readded > 0 {
            let n = format!("أُعيدت {readded} عملية من سجل العمليات");
            store.start_note = Some(match store.start_note.take() {
                Some(s) => format!("{s}. {n}"),
                None => n,
            });
        }
        Ok(store)
    }

    // ---------------------------------------------------------------- meta and kv

    pub fn meta_get(&self, key: &str) -> R<Option<String>> {
        self.conn
            .query_row("SELECT value FROM meta WHERE key=?1", [key], |r| r.get(0))
            .optional()
            .map_err(e)
    }

    pub fn meta_set(&self, key: &str, value: Option<&str>) -> R<()> {
        match value {
            Some(v) => self.conn.execute("INSERT INTO meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, v]),
            None => self.conn.execute("DELETE FROM meta WHERE key=?1", [key]),
        }
        .map(|_| ())
        .map_err(e)
    }

    /// counter that only goes up (offline receipt numbers), saved before it is returned
    pub fn next_seq(&self, key: &str) -> R<i64> {
        let tx = self.conn.unchecked_transaction().map_err(e)?;
        let cur: i64 = tx
            .query_row("SELECT value FROM meta WHERE key=?1", [key], |r| r.get::<_, String>(0))
            .optional()
            .map_err(e)?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let next = cur + 1;
        tx.execute("INSERT INTO meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, next.to_string()])
            .map_err(e)?;
        tx.commit().map_err(e)?;
        Ok(next)
    }

    pub fn kv_replace(&self, ns: &str, rows: &[Value]) -> R<usize> {
        let tx = self.conn.unchecked_transaction().map_err(e)?;
        tx.execute("DELETE FROM kv WHERE ns=?1", [ns]).map_err(e)?;
        let now = now_iso();
        {
            let mut st = tx.prepare("INSERT OR REPLACE INTO kv(ns,id,data,updated_at) VALUES(?1,?2,?3,?4)").map_err(e)?;
            for row in rows {
                let id = row.get("id").map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string())).ok_or("row without id")?;
                st.execute(params![ns, id, row.to_string(), now]).map_err(e)?;
            }
        }
        tx.commit().map_err(e)?;
        Ok(rows.len())
    }

    pub fn kv_put(&self, ns: &str, id: &str, data: Option<&Value>) -> R<()> {
        match data {
            Some(d) => self.conn.execute("INSERT OR REPLACE INTO kv(ns,id,data,updated_at) VALUES(?1,?2,?3,?4)", params![ns, id, d.to_string(), now_iso()]),
            None => self.conn.execute("DELETE FROM kv WHERE ns=?1 AND id=?2", params![ns, id]),
        }
        .map(|_| ())
        .map_err(e)
    }

    pub fn kv_get(&self, ns: &str, id: &str) -> R<Option<Value>> {
        let s: Option<String> = self.conn.query_row("SELECT data FROM kv WHERE ns=?1 AND id=?2", params![ns, id], |r| r.get(0)).optional().map_err(e)?;
        Ok(s.and_then(|s| serde_json::from_str(&s).ok()))
    }

    pub fn kv_list(&self, ns: &str) -> R<Vec<Value>> {
        let mut st = self.conn.prepare("SELECT data FROM kv WHERE ns=?1").map_err(e)?;
        let rows = st.query_map([ns], |r| r.get::<_, String>(0)).map_err(e)?;
        Ok(rows.filter_map(|r| r.ok()).filter_map(|s| serde_json::from_str(&s).ok()).collect())
    }

    // ---------------------------------------------------------------- the queue

    /// Save an action and its provisional effects in one transaction, then append it to the journal.
    pub fn enqueue(&self, action: &Value, effects: &[Value]) -> R<()> {
        let id = action.get("id").and_then(|v| v.as_str()).ok_or("action without id")?;
        let kind = action.get("kind").and_then(|v| v.as_str()).ok_or("action without kind")?;
        let tx = self.conn.unchecked_transaction().map_err(e)?;
        let now = now_iso();
        let inserted = tx
            .execute("INSERT OR IGNORE INTO outbox(id,kind,body,created_at) VALUES(?1,?2,?3,?4)", params![id, kind, action.to_string(), now])
            .map_err(e)?;
        for fx in effects {
            let ns = fx.get("ns").and_then(|v| v.as_str()).ok_or("effect without ns")?;
            let fid = fx.get("id").map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string())).ok_or("effect without id")?;
            match fx.get("data") {
                Some(d) if !d.is_null() => tx.execute("INSERT OR REPLACE INTO kv(ns,id,data,updated_at) VALUES(?1,?2,?3,?4)", params![ns, fid, d.to_string(), now]),
                _ => tx.execute("DELETE FROM kv WHERE ns=?1 AND id=?2", params![ns, fid]),
            }
            .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        if inserted > 0 {
            self.journal_append(action)?;
        }
        Ok(())
    }

    fn journal_path(&self) -> PathBuf {
        self.root.join("journal").join(format!("actions-{}.jsonl", Local::now().format("%Y%m")))
    }

    fn journal_append(&self, action: &Value) -> R<()> {
        let line = format!("{}\n", action);
        let mut f = OpenOptions::new().create(true).append(true).open(self.journal_path()).map_err(e)?;
        f.write_all(line.as_bytes()).map_err(e)?;
        f.sync_all().map_err(e)?;
        if let Some(dir) = &self.mirror {
            // best effort: a missing USB stick must not stop a sale (the app shows the warning)
            let res = fs::create_dir_all(dir).and_then(|_| {
                let p = dir.join(self.journal_path().file_name().unwrap());
                let mut m = OpenOptions::new().create(true).append(true).open(p)?;
                m.write_all(line.as_bytes())?;
                m.sync_all()
            });
            let _ = self.meta_set("mirrorError", res.err().map(|x| x.to_string()).as_deref());
        }
        Ok(())
    }

    /// Queue again any journal action the database does not have (after a restore or a damaged file).
    fn replay_journal(&self) -> R<usize> {
        let mut added = 0;
        let mut dirs = vec![self.root.join("journal")];
        if let Some(m) = &self.mirror {
            dirs.push(m.clone());
        }
        for dir in dirs {
            let Ok(entries) = fs::read_dir(&dir) else { continue };
            let mut files: Vec<PathBuf> = entries.filter_map(|x| x.ok()).map(|x| x.path()).filter(|p| p.extension().map(|x| x == "jsonl").unwrap_or(false)).collect();
            files.sort();
            for path in files {
                let Ok(f) = File::open(&path) else { continue };
                for line in BufReader::new(f).lines().map_while(Result::ok) {
                    let Ok(action) = serde_json::from_str::<Value>(&line) else { continue }; // a torn last line
                    let (Some(id), Some(kind)) = (action.get("id").and_then(|v| v.as_str()), action.get("kind").and_then(|v| v.as_str())) else { continue };
                    let n = self
                        .conn
                        .execute("INSERT OR IGNORE INTO outbox(id,kind,body,created_at) VALUES(?1,?2,?3,?4)", params![id, kind, line, now_iso()])
                        .map_err(e)?;
                    added += n;
                }
            }
        }
        Ok(added)
    }

    pub fn pending(&self, limit: i64) -> R<Vec<Value>> {
        let mut st = self.conn.prepare("SELECT body FROM outbox WHERE status='pending' ORDER BY seq LIMIT ?1").map_err(e)?;
        let rows = st.query_map([limit], |r| r.get::<_, String>(0)).map_err(e)?;
        Ok(rows.filter_map(|r| r.ok()).filter_map(|s| serde_json::from_str(&s).ok()).collect())
    }

    /// results: [{id, status: applied|duplicate|rejected|retry, result?, error?}]
    pub fn mark(&self, results: &[Value]) -> R<()> {
        let tx = self.conn.unchecked_transaction().map_err(e)?;
        let now = now_iso();
        for r in results {
            let Some(id) = r.get("id").and_then(|v| v.as_str()) else { continue };
            let status = r.get("status").and_then(|v| v.as_str()).unwrap_or("retry");
            let err = r.get("error").map(|v| v.to_string());
            let result = r.get("result").map(|v| v.to_string());
            match status {
                "applied" | "duplicate" => tx.execute("UPDATE outbox SET status='sent', result=?2, last_error=NULL, done_at=?3 WHERE id=?1", params![id, result, now]),
                "rejected" => tx.execute("UPDATE outbox SET status='rejected', attempts=attempts+1, last_error=?2, done_at=?3 WHERE id=?1", params![id, err, now]),
                _ => tx.execute("UPDATE outbox SET attempts=attempts+1, last_error=?2 WHERE id=?1", params![id, err]),
            }
            .map_err(e)?;
        }
        tx.commit().map_err(e)
    }

    pub fn actions(&self, status: Option<&str>, limit: i64) -> R<Vec<Value>> {
        let sql = "SELECT seq,id,kind,body,status,attempts,last_error,result,created_at,done_at FROM outbox WHERE (?1 IS NULL OR status=?1) ORDER BY seq DESC LIMIT ?2";
        let mut st = self.conn.prepare(sql).map_err(e)?;
        let rows = st
            .query_map(params![status, limit], |r| {
                Ok(json!({
                    "seq": r.get::<_, i64>(0)?, "id": r.get::<_, String>(1)?, "kind": r.get::<_, String>(2)?,
                    "body": serde_json::from_str::<Value>(&r.get::<_, String>(3)?).unwrap_or(Value::Null),
                    "status": r.get::<_, String>(4)?, "attempts": r.get::<_, i64>(5)?,
                    "error": r.get::<_, Option<String>>(6)?.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
                    "result": r.get::<_, Option<String>>(7)?.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
                    "createdAt": r.get::<_, String>(8)?, "doneAt": r.get::<_, Option<String>>(9)?,
                }))
            })
            .map_err(e)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// rejected -> pending (try again) or -> discarded (a manager chose to drop it)
    pub fn set_status(&self, id: &str, status: &str) -> R<()> {
        let n = match status {
            "pending" => self.conn.execute("UPDATE outbox SET status='pending', last_error=NULL WHERE id=?1 AND status='rejected'", [id]),
            "discarded" => self.conn.execute("UPDATE outbox SET status='discarded', done_at=?2 WHERE id=?1 AND status IN ('rejected','pending')", params![id, now_iso()]),
            _ => return Err("unknown status".into()),
        }
        .map_err(e)?;
        if n == 0 {
            return Err("العملية غير موجودة أو حالتها لا تسمح بذلك".into());
        }
        Ok(())
    }

    pub fn counts(&self) -> R<Value> {
        let mut st = self.conn.prepare("SELECT status, COUNT(*), MIN(created_at) FROM outbox GROUP BY status").map_err(e)?;
        let mut out = json!({"pending": 0, "rejected": 0, "sent": 0, "discarded": 0, "oldestPending": null});
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?))).map_err(e)?;
        for row in rows.flatten() {
            out[&row.0] = json!(row.1);
            if row.0 == "pending" {
                out["oldestPending"] = json!(row.2);
            }
        }
        Ok(out)
    }

    /// confirmed actions older than `days` are removed (the server has them)
    pub fn prune(&self, days: i64) -> R<usize> {
        let cutoff = (Utc::now() - chrono::Duration::days(days)).to_rfc3339();
        self.conn.execute("DELETE FROM outbox WHERE status IN ('sent','discarded') AND done_at < ?1", [cutoff]).map_err(e)
    }

    // ---------------------------------------------------------------- offline sign-in

    /// After a successful online sign-in: remember a salted hash of the password on this PC only.
    pub fn save_login(&self, username: &str, password: &str, profile: &Value) -> R<()> {
        let mut salt = [0u8; 16];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut salt);
        let mut hash = [0u8; 32];
        pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, PBKDF2_ROUNDS, &mut hash);
        let row = json!({
            "id": username.trim().to_lowercase(), "salt": hex::encode(salt), "hash": hex::encode(hash),
            "rounds": PBKDF2_ROUNDS, "profile": profile, "savedAt": now_iso(),
        });
        self.kv_put("login", &username.trim().to_lowercase(), Some(&row))
    }

    pub fn check_login(&self, username: &str, password: &str) -> R<Value> {
        let row = self.kv_get("login", &username.trim().to_lowercase())?.ok_or("لم يسجّل هذا المستخدم الدخول على هذا الجهاز من قبل وهو متصل بالإنترنت")?;
        let salt = hex::decode(row["salt"].as_str().unwrap_or("")).map_err(e)?;
        let rounds = row["rounds"].as_u64().unwrap_or(PBKDF2_ROUNDS as u64) as u32;
        let mut hash = [0u8; 32];
        pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, rounds, &mut hash);
        // constant-time compare
        let want = hex::decode(row["hash"].as_str().unwrap_or("")).map_err(e)?;
        let same = want.len() == hash.len() && want.iter().zip(hash.iter()).fold(0u8, |a, (x, y)| a | (x ^ y)) == 0;
        if !same {
            return Err("كلمة المرور غير صحيحة".into());
        }
        Ok(json!({ "profile": row["profile"], "savedAt": row["savedAt"] }))
    }

    // ---------------------------------------------------------------- backups

    fn vacuum_into(conn: &Connection, dir: &Path, label: &str) -> R<PathBuf> {
        fs::create_dir_all(dir).map_err(e)?;
        let mut dest = dir.join(format!("sellx-offline-{label}-{}.db", Local::now().format("%Y%m%d-%H%M%S")));
        let mut n = 1;
        while dest.exists() {
            dest = dir.join(format!("sellx-offline-{label}-{}{}.db", Local::now().format("%Y%m%d-%H%M%S"), n));
            n += 1;
        }
        conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().to_string()]).map_err(e)?;
        Ok(dest)
    }

    /// Snapshot, verify, record its checksum, then apply retention. A bad snapshot is deleted.
    pub fn backup(&self, label: &str) -> R<BackupInfo> {
        let dir = self.root.join("backups");
        let dest = Self::vacuum_into(&self.conn, &dir, label)?;
        let pending = match verify_file(&dest) {
            Ok(p) => p,
            Err(err) => {
                let _ = fs::remove_file(&dest);
                return Err(format!("النسخة الاحتياطية لم تنجح في الفحص: {err}"));
            }
        };
        let sum = sha256_file(&dest)?;
        let name = dest.file_name().unwrap().to_string_lossy().to_string();
        let mut f = OpenOptions::new().create(true).append(true).open(dir.join("manifest.txt")).map_err(e)?;
        let _ = writeln!(f, "{name} sha256={sum} pending={pending} at={}", now_iso());
        self.meta_set("lastBackupAt", Some(&now_iso()))?;
        rotate(&dir)?;
        let size = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        Ok(BackupInfo { name, label: label.into(), size, created_at: now_iso(), pending })
    }

    /// Every 4 hours of use (and the first daily / weekly / monthly of the period)
    pub fn backup_if_due(&self) -> R<Option<BackupInfo>> {
        let dir = self.root.join("backups");
        let all = list_backups(&dir)?;
        let today = Local::now().format("%Y%m%d").to_string();
        let has = |label: &str, pred: &dyn Fn(&str) -> bool| all.iter().any(|b| b.label == label && pred(&b.name));
        let stamp_of = |name: &str| name.rsplitn(3, '-').nth(1).unwrap_or("").to_string();
        let now = Local::now();
        let label = if !has("daily", &|n| stamp_of(n) == today) {
            "daily"
        } else if now.weekday() == chrono::Weekday::Sun && !has("weekly", &|n| stamp_of(n) == today) {
            "weekly"
        } else if now.day() == 1 && !has("monthly", &|n| stamp_of(n) == today) {
            "monthly"
        } else {
            let last = self.meta_get("lastBackupAt")?.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok());
            match last {
                Some(t) if (Utc::now() - t.with_timezone(&Utc)).to_std().unwrap_or_default() < AUTO_EVERY => return Ok(None),
                _ => "auto",
            }
        };
        self.backup(label).map(Some)
    }

    pub fn stage_restore(&self, name: &str) -> R<()> {
        if name.contains(['/', '\\']) || label_of(name).is_none() {
            return Err("اسم نسخة غير صالح".into());
        }
        let src = self.root.join("backups").join(name);
        verify_file(&src)?;
        let pending = sidecar(&self.db_path, ".restore-pending");
        fs::copy(&src, &pending).map_err(e)?;
        Ok(())
    }

    pub fn set_mirror(&mut self, dir: Option<String>) -> R<()> {
        if let Some(d) = &dir {
            let p = PathBuf::from(d);
            fs::create_dir_all(&p).map_err(|x| format!("لا يمكن الكتابة في المجلد: {x}"))?;
            // copy the journal so far, so the mirror is complete from today
            for entry in fs::read_dir(self.root.join("journal")).map_err(e)?.flatten() {
                let _ = fs::copy(entry.path(), p.join(entry.file_name()));
            }
        }
        self.meta_set("journalMirror", dir.as_deref())?;
        self.meta_set("mirrorError", None)?;
        self.mirror = dir.map(PathBuf::from);
        Ok(())
    }

    pub fn status(&mut self) -> R<Value> {
        let backups = list_backups(&self.root.join("backups"))?;
        Ok(json!({
            "ready": true,
            "path": self.root.to_string_lossy(),
            "counts": self.counts()?,
            "startNote": self.start_note.take(),
            "lastBackupAt": self.meta_get("lastBackupAt")?,
            "backups": backups.len(),
            "journalMirror": self.mirror.as_ref().map(|p| p.to_string_lossy().to_string()),
            "mirrorError": self.meta_get("mirrorError")?,
            "restorePending": sidecar(&self.db_path, ".restore-pending").exists(),
        }))
    }
}

pub fn list_backups(dir: &Path) -> R<Vec<BackupInfo>> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else { return Ok(out) };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(label) = label_of(&name).map(String::from) else { continue };
        let meta = entry.metadata().map_err(e)?;
        let created: chrono::DateTime<Utc> = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH).into();
        out.push(BackupInfo { name, label, size: meta.len(), created_at: created.to_rfc3339(), pending: -1 });
    }
    out.sort_by(|a, b| b.name.rsplitn(3, '-').take(2).collect::<Vec<_>>().cmp(&a.name.rsplitn(3, '-').take(2).collect::<Vec<_>>()));
    Ok(out)
}

fn rotate(dir: &Path) -> R<()> {
    let all = list_backups(dir)?;
    for (label, keep) in RETENTION {
        for b in all.iter().filter(|b| b.label == *label).skip(*keep) {
            let _ = fs::remove_file(dir.join(&b.name));
        }
    }
    Ok(())
}

// -------------------------------------------------------------------- Tauri commands

fn with<T>(state: &tauri::State<OfflineState>, f: impl FnOnce(&mut Store) -> R<T>) -> R<T> {
    let mut guard = state.0.lock().map_err(|_| "local database busy".to_string())?;
    let store = guard.as_mut().ok_or("local database is not open")?;
    f(store)
}

#[tauri::command]
pub fn offline_status(state: tauri::State<OfflineState>) -> R<Value> {
    with(&state, |s| s.status())
}
#[tauri::command]
pub fn offline_meta_get(state: tauri::State<OfflineState>, key: String) -> R<Option<String>> {
    with(&state, |s| s.meta_get(&key))
}
#[tauri::command]
pub fn offline_meta_set(state: tauri::State<OfflineState>, key: String, value: Option<String>) -> R<()> {
    with(&state, |s| s.meta_set(&key, value.as_deref()))
}
#[tauri::command]
pub fn offline_next_seq(state: tauri::State<OfflineState>, key: String) -> R<i64> {
    with(&state, |s| s.next_seq(&key))
}
#[tauri::command]
pub fn offline_kv_replace(state: tauri::State<OfflineState>, ns: String, rows: Vec<Value>) -> R<usize> {
    with(&state, |s| s.kv_replace(&ns, &rows))
}
#[tauri::command]
pub fn offline_kv_put(state: tauri::State<OfflineState>, ns: String, id: String, data: Option<Value>) -> R<()> {
    with(&state, |s| s.kv_put(&ns, &id, data.as_ref()))
}
#[tauri::command]
pub fn offline_kv_get(state: tauri::State<OfflineState>, ns: String, id: String) -> R<Option<Value>> {
    with(&state, |s| s.kv_get(&ns, &id))
}
#[tauri::command]
pub fn offline_kv_list(state: tauri::State<OfflineState>, ns: String) -> R<Vec<Value>> {
    with(&state, |s| s.kv_list(&ns))
}
#[tauri::command]
pub fn offline_enqueue(state: tauri::State<OfflineState>, action: Value, effects: Vec<Value>) -> R<()> {
    with(&state, |s| s.enqueue(&action, &effects))
}
#[tauri::command]
pub fn offline_pending(state: tauri::State<OfflineState>, limit: i64) -> R<Vec<Value>> {
    with(&state, |s| s.pending(limit))
}
#[tauri::command]
pub fn offline_mark(state: tauri::State<OfflineState>, results: Vec<Value>) -> R<()> {
    with(&state, |s| s.mark(&results))
}
#[tauri::command]
pub fn offline_actions(state: tauri::State<OfflineState>, status: Option<String>, limit: i64) -> R<Vec<Value>> {
    with(&state, |s| s.actions(status.as_deref(), limit))
}
#[tauri::command]
pub fn offline_set_status(state: tauri::State<OfflineState>, id: String, status: String) -> R<()> {
    with(&state, |s| s.set_status(&id, &status))
}
#[tauri::command]
pub fn offline_prune(state: tauri::State<OfflineState>, days: i64) -> R<usize> {
    with(&state, |s| s.prune(days))
}
#[tauri::command]
pub fn offline_save_login(state: tauri::State<OfflineState>, username: String, password: String, profile: Value) -> R<()> {
    with(&state, |s| s.save_login(&username, &password, &profile))
}
#[tauri::command]
pub fn offline_check_login(state: tauri::State<OfflineState>, username: String, password: String) -> R<Value> {
    with(&state, |s| s.check_login(&username, &password))
}
#[tauri::command]
pub fn offline_backup_now(state: tauri::State<OfflineState>, label: Option<String>) -> R<BackupInfo> {
    let label = label.unwrap_or_else(|| "manual".into());
    if !["manual", "shift", "exit"].contains(&label.as_str()) {
        return Err("unknown backup label".into());
    }
    with(&state, |s| s.backup(&label))
}
#[tauri::command]
pub fn offline_backup_list(state: tauri::State<OfflineState>) -> R<Vec<BackupInfo>> {
    with(&state, |s| list_backups(&s.root.join("backups")))
}
#[tauri::command]
pub fn offline_backup_restore(state: tauri::State<OfflineState>, name: String) -> R<()> {
    with(&state, |s| s.stage_restore(&name))
}
#[tauri::command]
pub fn offline_set_mirror(state: tauri::State<OfflineState>, dir: Option<String>) -> R<()> {
    with(&state, |s| s.set_mirror(dir))
}

/// Open the store at start, and make a snapshot every 4 hours of use (checked every 10 minutes).
pub fn init(app: &tauri::AppHandle) {
    use tauri::Manager;
    let root = match app.path().app_data_dir() {
        Ok(d) => d.join("offline"),
        Err(err) => {
            log::error!("[offline] no app data dir: {err}");
            return;
        }
    };
    let state: tauri::State<OfflineState> = app.state();
    match Store::open(&root) {
        Ok(store) => {
            log::info!("[offline] local database ready at {}", root.display());
            *state.0.lock().unwrap() = Some(store);
        }
        Err(err) => log::error!("[offline] cannot open the local database: {err}"),
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(600));
        loop {
            tick.tick().await;
            let st: tauri::State<OfflineState> = handle.state();
            let res = st.0.lock().ok().and_then(|g| g.as_ref().map(|s| s.backup_if_due()));
            if let Some(Err(err)) = res {
                log::error!("[offline] scheduled backup failed: {err}");
            }
        }
    });
}

/// On exit: one last snapshot (only when something is queued or changed since the last one)
pub fn on_exit(app: &tauri::AppHandle) {
    use tauri::Manager;
    let st: tauri::State<OfflineState> = app.state();
    if let Ok(g) = st.0.lock() {
        if let Some(s) = g.as_ref() {
            if let Err(err) = s.backup("exit") {
                log::error!("[offline] exit backup failed: {err}");
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let p = std::env::temp_dir().join(format!("sellx-offline-test-{}", uuid_like()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    fn uuid_like() -> String {
        let mut b = [0u8; 8];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut b);
        hex::encode(b)
    }
    fn sale(id: &str) -> Value {
        json!({"id": id, "kind": "sale.create", "userId": 1, "at": now_iso(), "payload": {"items": [{"productId": "p", "quantity": 1}]}})
    }

    #[test]
    fn queue_order_mark_and_counts() {
        let root = tmp();
        let s = Store::open(&root).unwrap();
        s.enqueue(&sale("a1111111"), &[json!({"ns": "sale", "id": "a1111111", "data": {"id": "a1111111", "total": 10}})]).unwrap();
        s.enqueue(&sale("b2222222"), &[]).unwrap();
        s.enqueue(&sale("a1111111"), &[]).unwrap(); // same id twice: kept once
        let p = s.pending(10).unwrap();
        assert_eq!(p.len(), 2);
        assert_eq!(p[0]["id"], "a1111111", "oldest first");
        assert_eq!(s.kv_get("sale", "a1111111").unwrap().unwrap()["total"], 10, "provisional record saved with it");
        s.mark(&[json!({"id": "a1111111", "status": "applied", "result": {"id": 5}}), json!({"id": "b2222222", "status": "rejected", "error": {"status": 400, "msg": "x"}})]).unwrap();
        let c = s.counts().unwrap();
        assert_eq!((c["pending"].as_i64(), c["sent"].as_i64(), c["rejected"].as_i64()), (Some(0), Some(1), Some(1)));
        s.set_status("b2222222", "pending").unwrap();
        assert_eq!(s.pending(10).unwrap().len(), 1, "rejected can be tried again");
        s.mark(&[json!({"id": "b2222222", "status": "retry", "error": {"status": 500}})]).unwrap();
        assert_eq!(s.pending(10).unwrap().len(), 1, "a temporary failure keeps it pending");
        assert!(s.set_status("a1111111", "pending").is_err(), "a sent action cannot be re-queued");
    }

    #[test]
    fn counter_survives_reopen() {
        let root = tmp();
        {
            let s = Store::open(&root).unwrap();
            assert_eq!(s.next_seq("receipt").unwrap(), 1);
            assert_eq!(s.next_seq("receipt").unwrap(), 2);
        }
        let s = Store::open(&root).unwrap();
        assert_eq!(s.next_seq("receipt").unwrap(), 3);
    }

    #[test]
    fn journal_readds_lost_actions() {
        let root = tmp();
        {
            let s = Store::open(&root).unwrap();
            s.enqueue(&sale("c3333333"), &[]).unwrap();
            s.enqueue(&sale("d4444444"), &[]).unwrap();
        }
        // the database file is lost; the journal is not
        for suffix in ["", "-wal", "-shm"] {
            let _ = fs::remove_file(sidecar(&root.join("sellx-offline.db"), suffix));
        }
        let mut s = Store::open(&root).unwrap();
        let ids: Vec<String> = s.pending(10).unwrap().iter().map(|a| a["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, vec!["c3333333", "d4444444"]);
        assert!(s.status().unwrap()["startNote"].as_str().unwrap().contains("2"));
        // opening again re-adds nothing
        drop(s);
        let s = Store::open(&root).unwrap();
        assert_eq!(s.pending(10).unwrap().len(), 2);
    }

    #[test]
    fn damaged_file_is_set_aside_and_restored_from_backup_plus_journal() {
        let root = tmp();
        {
            let s = Store::open(&root).unwrap();
            s.kv_put("product", "p1", Some(&json!({"id": "p1", "name": "tea"}))).unwrap();
            s.enqueue(&sale("e5555555"), &[]).unwrap();
            s.backup("manual").unwrap();
            s.enqueue(&sale("f6666666"), &[]).unwrap(); // after the backup: only in the journal + db
            s.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
        }
        // overwrite the middle of the file with garbage
        let db = root.join("sellx-offline.db");
        let mut bytes = fs::read(&db).unwrap();
        let mid = bytes.len() / 2;
        let span = 4096.min(bytes.len() - mid);
        for b in bytes.iter_mut().skip(mid).take(span) {
            *b = 0xAB;
        }
        fs::write(&db, bytes).unwrap();
        let s = Store::open(&root).unwrap();
        let ids: Vec<String> = s.pending(10).unwrap().iter().map(|a| a["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, vec!["e5555555", "f6666666"], "backup + journal: nothing lost");
        assert_eq!(s.kv_get("product", "p1").unwrap().unwrap()["name"], "tea");
        assert!(fs::read_dir(&root).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with("damaged-")), "damaged file kept aside");
    }

    #[test]
    fn backup_verify_rotate_and_staged_restore() {
        let root = tmp();
        let s = Store::open(&root).unwrap();
        s.enqueue(&sale("g7777777"), &[]).unwrap();
        let b = s.backup("manual").unwrap();
        assert_eq!(b.pending, 1);
        for _ in 0..7 {
            s.backup("exit").unwrap();
        }
        let list = list_backups(&root.join("backups")).unwrap();
        assert_eq!(list.iter().filter(|x| x.label == "exit").count(), 5, "exit backups rotated to 5");
        assert_eq!(list.iter().filter(|x| x.label == "manual").count(), 1);
        assert!(fs::read_to_string(root.join("backups/manifest.txt")).unwrap().contains("sha256="));
        // later work, then restore the manual backup
        s.enqueue(&sale("h8888888"), &[]).unwrap();
        s.stage_restore(&b.name).unwrap();
        assert!(s.stage_restore("../etc/passwd").is_err());
        drop(s);
        let mut s = Store::open(&root).unwrap();
        // the restored file had g only; the journal re-adds h
        assert_eq!(s.pending(10).unwrap().len(), 2);
        assert!(s.status().unwrap()["startNote"].as_str().unwrap().contains("استعادة"));
        assert!(list_backups(&root.join("backups")).unwrap().iter().any(|x| x.label == "pre-restore"), "safety snapshot before restoring");
    }

    #[test]
    fn offline_login() {
        let root = tmp();
        let s = Store::open(&root).unwrap();
        s.save_login("Mona", "secret-1", &json!({"id": 7, "fullname": "Mona"})).unwrap();
        assert_eq!(s.check_login("mona", "secret-1").unwrap()["profile"]["id"], 7);
        assert!(s.check_login("mona", "wrong").is_err());
        assert!(s.check_login("other", "secret-1").is_err());
        let raw = s.kv_get("login", "mona").unwrap().unwrap().to_string();
        assert!(!raw.contains("secret-1"), "password never stored");
    }

    #[test]
    fn mirror_gets_every_action() {
        let root = tmp();
        let mirror = tmp();
        let mut s = Store::open(&root).unwrap();
        s.enqueue(&sale("i9999999"), &[]).unwrap();
        s.set_mirror(Some(mirror.to_string_lossy().to_string())).unwrap();
        s.enqueue(&sale("j0000000"), &[]).unwrap();
        let text: String = fs::read_dir(&mirror).unwrap().flatten().map(|e| fs::read_to_string(e.path()).unwrap()).collect();
        assert!(text.contains("i9999999") && text.contains("j0000000"), "copied so far + new");
    }
}
