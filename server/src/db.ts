// SQLite 事务层：node:sqlite（Node 内置，无原生依赖）
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = process.env.PRISM_DATA_DIR || path.join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'prism.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  north_star TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,          -- 人群/问题/建议观点/预期指标/成本风险/为什么值得做
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | adopted | shelved
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contents (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'IDEA',
  ir TEXT,                        -- Content IR JSON
  canonical TEXT,                 -- 主内容 JSON（六段结构）
  risk_level TEXT NOT NULL DEFAULT 'medium',
  human_edits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,            -- CLM-xxx
  statement TEXT NOT NULL,
  claim_type TEXT NOT NULL,       -- fact | product_capability | inference | opinion
  source TEXT,
  source_time TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium',
  public_ok INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending_review',  -- verified | pending_review | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence_packs (
  content_id TEXT PRIMARY KEY REFERENCES contents(id),
  pack TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channel_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL REFERENCES contents(id),
  platform TEXT NOT NULL,         -- wechat | zhihu | xiaohongshu | douyin
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cta TEXT,
  utm TEXT,
  assets TEXT,                    -- 素材清单 JSON
  format_check TEXT,              -- 格式检查 JSON
  approved INTEGER NOT NULL DEFAULT 0,
  UNIQUE(content_id, platform)
);

CREATE TABLE IF NOT EXISTS judge_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL REFERENCES contents(id),
  judge TEXT NOT NULL,            -- evidence | brand_compliance | channel_quality
  verdict TEXT NOT NULL,          -- pass | warn | fail
  findings TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL REFERENCES contents(id),
  decision TEXT NOT NULL,         -- approve | reject
  platforms TEXT,                 -- 批准的平台 JSON；空 = 全部
  note TEXT,
  operator TEXT NOT NULL DEFAULT '人类总编',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS publish_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL REFERENCES contents(id),
  platform TEXT NOT NULL,
  path TEXT NOT NULL,
  utm TEXT,
  status TEXT NOT NULL DEFAULT 'exported',   -- exported | scheduled | published | failed
  scheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(content_id, platform)
);

CREATE TABLE IF NOT EXISTS metric_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,             -- platform | product
  filename TEXT,
  rows INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metric_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES metric_imports(id),
  utm_content TEXT,               -- 对应 channel_variants.utm 的 content 段
  metric TEXT NOT NULL,           -- impressions | reads | likes | product_page | download | install | first_analysis | retain_7d | team_signal ...
  value REAL NOT NULL,
  date TEXT
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY,
  statement TEXT NOT NULL,
  audience TEXT,
  platform TEXT,
  metric TEXT,
  status TEXT NOT NULL DEFAULT 'testing',   -- confirmed | rejected | testing | inconclusive
  support INTEGER NOT NULL DEFAULT 0,
  oppose INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  conditions TEXT,
  practice TEXT,
  effect TEXT,
  failure_condition TEXT,
  evidence_windows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS library_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,             -- hypothesis_new | hypothesis_update | strategy_promote
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | dismissed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  author TEXT,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'uncategorized',  -- product_question | pain_point | feature_request | objection | team_signal | enterprise_lead | spam
  draft_reply TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',         -- high | normal | low
  status TEXT NOT NULL DEFAULT 'open',             -- open | replied | archived
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,            -- RUN-...
  content_id TEXT,
  campaign_id TEXT,
  agent_id TEXT NOT NULL,
  prompt_version TEXT,
  model TEXT,
  input_refs TEXT,
  source_refs TEXT,
  output_hash TEXT,
  tokens INTEGER,
  cost REAL,
  human_edits INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export function get(sql: string, ...params: any[]) {
  return db.prepare(sql).get(...params) as any;
}
export function all(sql: string, ...params: any[]) {
  return db.prepare(sql).all(...params) as any[];
}
export function run(sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}

/** 事务包装：多写操作要么全成功要么全回滚 */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 基于最大数字后缀生成下一个 ID（COUNT 在非连续编号下会撞号）
export function nextId(table: string, prefix: string, pad: number): string {
  const row = get(`SELECT MAX(CAST(substr(id, ?) AS INTEGER)) m FROM ${table} WHERE id LIKE ?`,
    prefix.length + 2, `${prefix}-%`);
  return `${prefix}-${String((row?.m ?? 0) + 1).padStart(pad, '0')}`;
}

export function touchContent(id: string) {
  run(`UPDATE contents SET updated_at = datetime('now') WHERE id = ?`, id);
}
