// REST API 全量路由
import { Router } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, nextId, run, touchContent, tx } from './db.ts';
import { validateDraftIR } from './core/contentIR.ts';
import { currentState, transition, latestJudgeResults, STATES } from './core/stateMachine.ts';
import { advance, approve, reject, JudgeFailedError } from './core/controller.ts';
import { runStrategyAgent, runGrowthAgent, PLATFORMS } from './agents/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPORTS_DIR = path.join(ROOT, 'exports');

export const api = Router();

const wrap = (fn: (req: any, res: any) => any) => async (req: any, res: any) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof JudgeFailedError) {
      return res.status(422).json({ error: e.message, judge: e.judge, failures: e.failures, fallbackTo: e.fallbackTo });
    }
    const msg = e.message ?? String(e);
    res.status(msg.includes('不存在') ? 404 : 400).json({ error: msg });
  }
};

// CSV 行解析：支持引号包裹字段（内含逗号/转义引号 ""）
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// ---------- 总览 / 驾驶舱 ----------
api.get('/overview', wrap(async (_req, res) => {
  const campaigns = all(`SELECT * FROM campaigns ORDER BY created_at DESC`);
  const withCounts = campaigns.map(c => ({
    ...c,
    contents: get(`SELECT COUNT(*) n FROM contents WHERE campaign_id = ?`, c.id).n,
    published: get(`SELECT COUNT(*) n FROM contents WHERE campaign_id = ? AND state IN ('PUBLISHED','MEASURED_24H','MEASURED_72H','MEASURED_7D','LEARNED')`, c.id).n,
  }));
  const pendingApproval = all(`SELECT id, title, state FROM contents WHERE state = 'JUDGED'`);
  const pendingTopics = all(`SELECT id, title FROM topics WHERE status = 'pending'`);
  const metric = (m: string) => get(`SELECT COALESCE(SUM(value),0) v FROM metric_rows WHERE metric = ?`, m).v;
  res.json({
    campaigns: withCounts,
    pendingApproval,
    pendingTopics,
    funnel: {
      impressions: metric('impressions'), reads: metric('reads'),
      product_page: metric('product_page'), download: metric('download'),
      install: metric('install'), first_analysis: metric('first_analysis'),
      retain_7d: metric('retain_7d'), team_signal: metric('team_signal'),
    },
  });
}));

// ---------- 选题 ----------
api.get('/topics', wrap(async (_req, res) => {
  res.json(all(`SELECT * FROM topics ORDER BY created_at DESC`).map(t => ({ ...t, payload: JSON.parse(t.payload) })));
}));

api.post('/topics', wrap(async (req, res) => {
  const { title, payload = {} } = req.body ?? {};
  if (!title) throw new Error('缺少选题标题');
  const id = nextId('topics', 'TPC', 3);
  run(`INSERT INTO topics (id, title, payload) VALUES (?, ?, ?)`, id, title, JSON.stringify(payload));
  res.json({ id });
}));

api.post('/topics/:id/adopt', wrap(async (req, res) => {
  const t = get(`SELECT * FROM topics WHERE id = ?`, req.params.id);
  if (!t) throw new Error('选题不存在');
  if (t.status !== 'pending') throw new Error(`选题状态 ${t.status} 不能采纳`);
  const payload = JSON.parse(t.payload);
  const campaignId = payload.campaign_id ?? req.body?.campaign_id;
  if (!campaignId) throw new Error('缺少 campaign_id（选题未关联活动时需在请求中指定）');
  const contentId = nextId('contents', 'CNT-2026', 4);
  // 手动添加的选题可能只有标题：用占位文案补齐 IR 草稿必填字段，研究阶段再填实
  const ir = {
    content_id: contentId, campaign_id: campaignId, title: t.title,
    objective: payload.objective ?? 'O2_激活',
    funnel_stage: payload.funnel_stage ?? 'awareness',
    persona: { role: payload.persona ?? '待研究确定', maturity: '' },
    job_to_be_done: payload.user_problem ?? `围绕「${t.title}」要解决的问题（待研究确定）`,
    user_problem: payload.user_problem ?? `围绕「${t.title}」的用户问题（待研究确定）`,
    core_thesis: payload.suggested_thesis ?? '待研究后确定',
    content_hypothesis: payload.rationale ?? '待验证',
    key_claims: [],
    counterpoints: ['待 Research Agent 补充'],
    canonical_structure: {},
    channel_intents: {},
    success_metrics: Object.keys(payload.expected_metrics ?? {}).length ? Object.keys(payload.expected_metrics) : ['产品页点击'],
    risk_level: 'medium',
    approval_required: true,
  };
  const v = validateDraftIR(ir);
  if (!v.ok) throw new Error(`IR 草稿不合法：${v.errors.join('；')}`);
  tx(() => {
    run(`INSERT INTO contents (id, campaign_id, title, state, ir, risk_level) VALUES (?, ?, ?, 'TRIAGED', ?, ?)`,
      contentId, campaignId, t.title, JSON.stringify(ir), payload.risk === '低' ? 'low' : 'medium');
    run(`UPDATE topics SET status = 'adopted' WHERE id = ?`, req.params.id);
  });
  res.json({ content_id: contentId, state: 'TRIAGED' });
}));

api.post('/topics/:id/shelve', wrap(async (req, res) => {
  run(`UPDATE topics SET status = 'shelved' WHERE id = ?`, req.params.id);
  res.json({ ok: true });
}));

// ---------- 内容流水线 ----------
api.get('/contents', wrap(async (req, res) => {
  const rows = req.query.campaign_id
    ? all(`SELECT id, campaign_id, title, state, risk_level, updated_at FROM contents WHERE campaign_id = ? ORDER BY updated_at DESC`, req.query.campaign_id)
    : all(`SELECT id, campaign_id, title, state, risk_level, updated_at FROM contents ORDER BY updated_at DESC`);
  res.json(rows);
}));

api.get('/contents/:id', wrap(async (req, res) => {
  const c = get(`SELECT * FROM contents WHERE id = ?`, req.params.id);
  if (!c) throw new Error('内容不存在');
  res.json({
    ...c,
    ir: c.ir ? JSON.parse(c.ir) : null,
    canonical: c.canonical ? JSON.parse(c.canonical) : null,
    evidence_pack: get(`SELECT pack FROM evidence_packs WHERE content_id = ?`, c.id)?.pack ? JSON.parse(get(`SELECT pack FROM evidence_packs WHERE content_id = ?`, c.id).pack) : null,
    variants: all(`SELECT * FROM channel_variants WHERE content_id = ?`, c.id).map(v => ({ ...v, assets: v.assets ? JSON.parse(v.assets) : null })),
    judges: latestJudgeResults(c.id).map(j => ({ ...j, findings: JSON.parse(j.findings) })),
    approvals: all(`SELECT * FROM approvals WHERE content_id = ? ORDER BY id DESC`, c.id),
    runs: all(`SELECT id, agent_id, model, tokens, cost, created_at FROM runs WHERE content_id = ? ORDER BY created_at DESC`, c.id),
    states: STATES,
  });
}));

// 推进一个节点（Controller）。内容创建只能通过选题采纳，保证 IR 完整性。
api.post('/contents/:id/advance', wrap(async (req, res) => {
  const r = await advance(req.params.id);
  res.json(r);
}));

// 人工编辑主内容（记 human_edits）。只允许在起草后、批准前的区间修改，批准后内容不可静默变更。
const CANONICAL_EDITABLE = ['RESEARCHED', 'CANONICAL_DRAFTED', 'CHANNEL_ADAPTED', 'CREATIVE_READY', 'JUDGED'];
api.put('/contents/:id/canonical', wrap(async (req, res) => {
  const c = get(`SELECT id, state FROM contents WHERE id = ?`, req.params.id);
  if (!c) throw new Error('内容不存在');
  if (!CANONICAL_EDITABLE.includes(c.state)) {
    throw new Error(`状态 ${c.state} 不允许编辑主内容（批准后的内容不可变更，如需修改请先退回）`);
  }
  if (!req.body || typeof req.body !== 'object') throw new Error('请求体需为主内容对象');
  run(`UPDATE contents SET canonical = ?, human_edits = human_edits + 1, updated_at = datetime('now') WHERE id = ?`,
    JSON.stringify(req.body), req.params.id);
  res.json({ ok: true });
}));

// 人工批准 / 退回
api.post('/contents/:id/approve', wrap(async (req, res) => {
  approve(req.params.id, req.body?.note ?? '', req.body?.platforms ?? null, req.body?.operator);
  res.json({ state: currentState(req.params.id) });
}));

api.post('/contents/:id/reject', wrap(async (req, res) => {
  reject(req.params.id, req.body?.note ?? '', req.body?.back_to ?? 'CANONICAL_DRAFTED');
  res.json({ state: currentState(req.params.id) });
}));

// ---------- 审查队列（一次查询带出三裁判最新结论，避免前端 N+1） ----------
api.get('/review/queue', wrap(async (_req, res) => {
  res.json(all(
    `SELECT c.id, c.title, c.state, c.risk_level,
       (SELECT jr.verdict FROM judge_results jr WHERE jr.content_id = c.id AND jr.judge = 'evidence' ORDER BY jr.id DESC LIMIT 1) AS evidence_verdict,
       (SELECT jr.verdict FROM judge_results jr WHERE jr.content_id = c.id AND jr.judge = 'brand_compliance' ORDER BY jr.id DESC LIMIT 1) AS brand_verdict,
       (SELECT jr.verdict FROM judge_results jr WHERE jr.content_id = c.id AND jr.judge = 'channel_quality' ORDER BY jr.id DESC LIMIT 1) AS channel_verdict
     FROM contents c WHERE c.state = 'JUDGED' ORDER BY c.updated_at DESC`));
}));

// ---------- 发布 ----------
// 导出发布包（L0）：每个已批准平台一个目录。platform 经过白名单校验，防路径穿越。
api.post('/contents/:id/export', wrap(async (req, res) => {
  const id = req.params.id;
  if (!/^CNT-\d{4}-\d{4}$/.test(id)) throw new Error('非法的内容 ID');
  const state = currentState(id);
  if (state !== 'HUMAN_APPROVED' && state !== 'SCHEDULED') throw new Error(`状态 ${state} 不能导出发布包（需先人工批准）`);
  const variants = all(`SELECT * FROM channel_variants WHERE content_id = ? AND approved = 1`, id);
  if (variants.length === 0) throw new Error('没有已批准的平台版本');
  const dir = path.join(EXPORTS_DIR, id);
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const v of variants) {
    if (!PLATFORMS.includes(v.platform) || !/^[a-z]+$/.test(v.platform)) {
      throw new Error(`平台标识非法（${JSON.stringify(v.platform)}），拒绝导出`);
    }
    const pdir = path.join(dir, v.platform);
    mkdirSync(pdir, { recursive: true });
    writeFileSync(path.join(pdir, 'body.md'), `# ${v.title}\n\n${v.body}\n\n---\nCTA：${v.cta ?? ''}\n`);
    writeFileSync(path.join(pdir, 'manifest.json'), JSON.stringify({
      content_id: id, platform: v.platform, title: v.title, utm: v.utm,
      ai_label: true, exported_at: new Date().toISOString(),
    }, null, 2));
    run(`INSERT INTO publish_packages (content_id, platform, path, utm, status) VALUES (?, ?, ?, ?, 'exported')
         ON CONFLICT(content_id, platform) DO UPDATE SET path=excluded.path, utm=excluded.utm`,
      id, v.platform, pdir, v.utm);
    out.push({ platform: v.platform, path: pdir, utm: v.utm });
  }
  res.json({ exported: out });
}));

// 预约发布（SCHEDULED）
api.post('/contents/:id/schedule', wrap(async (req, res) => {
  const { platform, scheduled_at } = req.body ?? {};
  if (!platform || !scheduled_at) throw new Error('缺少 platform 或 scheduled_at');
  const pkg = get(`SELECT * FROM publish_packages WHERE content_id = ? AND platform = ?`, req.params.id, platform);
  if (!pkg) throw new Error('该平台尚未导出发布包');
  run(`UPDATE publish_packages SET status = 'scheduled', scheduled_at = ? WHERE id = ?`, scheduled_at, pkg.id);
  if (currentState(req.params.id) === 'HUMAN_APPROVED') transition(req.params.id, 'SCHEDULED', { reason: '预约发布' });
  res.json({ ok: true });
}));

// 标记已发布（人工点击发布后回填）。只接受已导出的平台，包不存在时报错而非静默成功。
api.post('/contents/:id/published', wrap(async (req, res) => {
  const { platform } = req.body ?? {};
  if (!platform || !PLATFORMS.includes(platform)) throw new Error('缺少或非法的 platform');
  const pkg = get(`SELECT * FROM publish_packages WHERE content_id = ? AND platform = ?`, req.params.id, platform);
  if (!pkg) throw new Error('该平台没有发布包记录，无法标记发布');
  run(`UPDATE publish_packages SET status = 'published' WHERE id = ?`, pkg.id);
  if (currentState(req.params.id) === 'SCHEDULED') transition(req.params.id, 'PUBLISHED', { reason: '人工确认已发布' });
  res.json({ state: currentState(req.params.id) });
}));

api.get('/calendar', wrap(async (_req, res) => {
  res.json(all(
    `SELECT pp.*, c.title AS content_title FROM publish_packages pp
     JOIN contents c ON c.id = pp.content_id ORDER BY pp.scheduled_at`));
}));

// ---------- 指标导入（CSV）----------
// 平台表头：utm_content,metric,value,date —— 或宽表：utm_content,impressions,reads,...
api.post('/metrics/import', wrap(async (req, res) => {
  const { kind = 'platform', filename = 'paste.csv', csv } = req.body ?? {};
  if (!csv) throw new Error('缺少 csv 内容');
  const lines = String(csv).replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(l => l.trim());
  const header = parseCsvLine(lines[0]);
  const known = ['impressions', 'reads', 'collects', 'comments', 'shares', 'product_page', 'download', 'install', 'first_analysis', 'retain_7d', 'team_signal'];
  let importId = 0, rows = 0;
  tx(() => {
    run(`INSERT INTO metric_imports (kind, filename) VALUES (?, ?)`, kind, filename);
    importId = get(`SELECT last_insert_rowid() id`).id;
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const row: Record<string, string> = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
      if (header.includes('metric')) {
        if (!row.metric || isNaN(+row.value)) continue;
        run(`INSERT INTO metric_rows (import_id, utm_content, metric, value, date) VALUES (?, ?, ?, ?, ?)`,
          importId, row.utm_content ?? null, row.metric, +row.value, row.date ?? null);
        rows++;
      } else {
        for (const m of known) {
          if (row[m] !== undefined && row[m] !== '' && !isNaN(+row[m])) {
            run(`INSERT INTO metric_rows (import_id, utm_content, metric, value, date) VALUES (?, ?, ?, ?, ?)`,
              importId, row.utm_content ?? null, m, +row[m], row.date ?? null);
            rows++;
          }
        }
      }
    }
    run(`UPDATE metric_imports SET rows = ? WHERE id = ?`, rows, importId);
  });
  res.json({ import_id: importId, rows });
}));

api.get('/analytics', wrap(async (_req, res) => {
  // 精确边界匹配 utm_content 参数（前后必须是 & 或串尾），避免子串误归因；
  // 一个 utm_content 只会命中一个平台变体，指标不会被按平台数放大
  const perContent = all(
    `SELECT v.content_id, c.title, v.platform, v.utm, mr.metric, SUM(mr.value) value
     FROM metric_rows mr
     JOIN channel_variants v
       ON v.utm LIKE '%utm_content=' || mr.utm_content || '&%'
       OR v.utm LIKE '%utm_content=' || mr.utm_content
     JOIN contents c ON c.id = v.content_id
     GROUP BY v.content_id, v.platform, mr.metric`);
  const byContent: Record<string, any> = {};
  for (const r of perContent) {
    byContent[r.content_id] ??= { content_id: r.content_id, title: r.title, metrics: {}, platforms: new Set() };
    byContent[r.content_id].metrics[r.metric] = (byContent[r.content_id].metrics[r.metric] ?? 0) + r.value;
    byContent[r.content_id].platforms.add(r.platform);
  }
  const list = Object.values(byContent).map(c => ({ ...c, platforms: [...c.platforms] }));
  const total = (m: string) => get(`SELECT COALESCE(SUM(value),0) v FROM metric_rows WHERE metric = ?`, m).v;
  res.json({
    contents: list,
    totals: {
      impressions: total('impressions'), reads: total('reads'), collects: total('collects'),
      product_page: total('product_page'), download: total('download'), install: total('install'),
      first_analysis: total('first_analysis'), retain_7d: total('retain_7d'), team_signal: total('team_signal'),
    },
  });
}));

// ---------- 双库 ----------
api.get('/hypotheses', wrap(async (_req, res) => res.json(all(`SELECT * FROM hypotheses ORDER BY updated_at DESC`))));
api.get('/strategies', wrap(async (_req, res) => res.json(all(`SELECT * FROM strategies`))));
api.get('/library/proposals', wrap(async (_req, res) =>
  res.json(all(`SELECT * FROM library_proposals WHERE status = 'pending' ORDER BY id DESC`)
    .map(p => ({ ...p, payload: JSON.parse(p.payload) })))));

api.post('/library/proposals/:id/confirm', wrap(async (req, res) => {
  const p = get(`SELECT * FROM library_proposals WHERE id = ?`, req.params.id);
  if (!p || p.status !== 'pending') throw new Error('提议不存在或已处理');
  const payload = JSON.parse(p.payload);
  if (p.kind === 'hypothesis_new') {
    const id = nextId('hypotheses', 'HYP', 3);
    run(`INSERT INTO hypotheses (id, statement, audience, platform, metric) VALUES (?, ?, ?, ?, ?)`,
      id, payload.statement, payload.audience ?? null, payload.platform ?? null, payload.metric ?? null);
  } else if (p.kind === 'strategy_promote') {
    const id = nextId('strategies', 'STR', 3);
    run(`INSERT INTO strategies (id, title, practice, effect, evidence_windows) VALUES (?, ?, ?, ?, ?)`,
      id, payload.hypothesis, payload.evidence, '待补充量化口径', 3);
    run(`UPDATE hypotheses SET status = 'confirmed', updated_at = datetime('now') WHERE statement = ?`, payload.hypothesis);
  }
  run(`UPDATE library_proposals SET status = 'confirmed' WHERE id = ?`, p.id);
  res.json({ ok: true });
}));

api.post('/library/proposals/:id/dismiss', wrap(async (req, res) => {
  run(`UPDATE library_proposals SET status = 'dismissed' WHERE id = ?`, req.params.id);
  res.json({ ok: true });
}));

// ---------- 评论与线索 ----------
api.get('/community', wrap(async (_req, res) => res.json(all(`SELECT * FROM community_items ORDER BY created_at DESC`))));
api.post('/community/:id/reply', wrap(async (req, res) => {
  run(`UPDATE community_items SET status = 'replied' WHERE id = ?`, req.params.id);
  res.json({ ok: true });
}));
// 保存人工编辑/起草的回复（Agent 只起草，人可改写）
api.patch('/community/:id/draft', wrap(async (req, res) => {
  const item = get(`SELECT id FROM community_items WHERE id = ?`, req.params.id);
  if (!item) throw new Error('评论不存在');
  const { draft_reply } = req.body ?? {};
  if (typeof draft_reply !== 'string' || !draft_reply.trim()) throw new Error('回复内容不能为空');
  run(`UPDATE community_items SET draft_reply = ? WHERE id = ?`, draft_reply.trim(), req.params.id);
  res.json({ ok: true });
}));

// ---------- Campaign / Agent 触发 ----------
api.post('/campaigns', wrap(async (req, res) => {
  const { name, objective, north_star } = req.body ?? {};
  if (!name || !objective) throw new Error('缺少 name 或 objective');
  const id = nextId('campaigns', 'CAM-2026', 3);
  run(`INSERT INTO campaigns (id, name, objective, north_star) VALUES (?, ?, ?, ?)`, id, name, objective, north_star ?? null);
  res.json({ id });
}));

api.post('/campaigns/:id/strategy', wrap(async (req, res) => {
  const ids = await runStrategyAgent(req.params.id);
  res.json({ topics: ids });
}));

api.post('/growth/weekly', wrap(async (_req, res) => {
  res.json(await runGrowthAgent());
}));
