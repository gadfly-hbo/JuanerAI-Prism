// 同主题实验变体：选题采纳与开变体都落成独立内容（各走各的流水线）。
// 采纳/变体创建是内容的唯一入口，保证 IR 完整性；标签按创建序分配 A/B/C，同选题最多 3 个存活变体。
import { all, get, nextId, run, tx } from '../db.ts';
import { validateDraftIR } from './contentIR.ts';

export const MAX_VARIANTS_PER_TOPIC = 3;
const VARIANT_LABELS = ['A', 'B', 'C'];

/** 存活变体 = 未归档。归档（ARCHIVED）的实验退出额度，LEARNED/已发布仍占额度 */
const ALIVE = `state != 'ARCHIVED'`;

/** 选题列表（带存活变体计数与明细），供选题雷达展示「N 个变体」与逐变体状态 */
export function listTopics() {
  return all(
    `SELECT t.*, (SELECT COUNT(*) FROM contents c WHERE c.topic_id = t.id AND c.${ALIVE}) variant_count
     FROM topics t ORDER BY t.created_at DESC`)
    .map(t => ({
      ...t,
      payload: JSON.parse(t.payload),
      variants: all(`SELECT id, variant_label, state, ir FROM contents WHERE topic_id = ? AND ${ALIVE} ORDER BY variant_label`, t.id)
        .map(v => ({ id: v.id, variant_label: v.variant_label, state: v.state, hypothesis: JSON.parse(v.ir ?? '{}').content_hypothesis ?? '' })),
    }));
}

/** 实验对照的关键指标，按激活贡献排序（first_analysis 是北极星） */
const KEY_METRICS = ['first_analysis', 'reads'];

/**
 * 同主题变体对照：各变体 × 平台的累计指标（与 /analytics 完全相同的精确边界 JOIN 口径，
 * 防止 utm_content 子串误归因），外加领先摘要。
 */
export function topicCompare(topicId: string) {
  const topic = get(`SELECT id, title, status FROM topics WHERE id = ?`, topicId);
  if (!topic) throw new Error('选题不存在');
  const contents = all(`SELECT id, variant_label, state, title, ir FROM contents WHERE topic_id = ? ORDER BY variant_label`, topicId);
  const rows = all(
    `SELECT v.content_id, v.platform, mr.metric, SUM(mr.value) value
     FROM metric_rows mr
     JOIN channel_variants v
       ON v.utm LIKE '%utm_content=' || mr.utm_content || '&%'
       OR v.utm LIKE '%utm_content=' || mr.utm_content
     JOIN contents c ON c.id = v.content_id
     WHERE c.topic_id = ?
     GROUP BY v.content_id, v.platform, mr.metric`, topicId);

  const byContent: Record<string, { platforms: Record<string, Record<string, number>>; totals: Record<string, number> }> = {};
  for (const r of rows) {
    const slot = byContent[r.content_id] ??= { platforms: {}, totals: {} };
    (slot.platforms[r.platform] ??= {})[r.metric] = r.value;
    slot.totals[r.metric] = (slot.totals[r.metric] ?? 0) + r.value;
  }
  const variants = contents.map(c => ({
    content_id: c.id,
    variant_label: c.variant_label,
    state: c.state,
    hypothesis: JSON.parse(c.ir ?? '{}').content_hypothesis ?? '',
    platforms: byContent[c.id]?.platforms ?? {},
    totals: byContent[c.id]?.totals ?? {},
  }));

  // 领先摘要：对每个关键指标找最优「变体 × 平台」格子，与同平台其他变体的最优值比
  const summary = KEY_METRICS.flatMap(metric => {
    const cells = variants.flatMap(v =>
      Object.entries(v.platforms).map(([platform, m]) =>
        ({ variant: v.variant_label, platform, value: m[metric] ?? 0 })).filter(c => c.value > 0));
    if (!cells.length) return [];
    const leader = cells.reduce((a, b) => (b.value > a.value ? b : a));
    const rival = cells.filter(c => c.variant !== leader.variant && c.platform === leader.platform);
    const bestRival = rival.length ? rival.reduce((a, b) => (b.value > a.value ? b : a)) : null;
    return [{
      metric,
      leader,
      runner_up: bestRival ? { variant: bestRival.variant, value: bestRival.value } : null,
      lead_pct: bestRival && bestRival.value > 0 ? Math.round((leader.value - bestRival.value) / bestRival.value * 100) : null,
    }];
  });

  return { topic, variants, summary };
}

/** 用选题信息构造 IR 草稿。手动添加的选题可能只有标题：占位文案补齐必填字段，研究阶段再填实。 */
function draftIR(contentId: string, topic: { title: string; payload: any }, campaignId: string, overrides: { hypothesis?: string; persona?: string; funnelStage?: string } = {}) {
  const p = topic.payload ?? {};
  return {
    content_id: contentId, campaign_id: campaignId, title: topic.title,
    objective: p.objective ?? 'O2_激活',
    funnel_stage: overrides.funnelStage ?? p.funnel_stage ?? 'awareness',
    persona: { role: overrides.persona ?? p.persona ?? '待研究确定', maturity: '' },
    job_to_be_done: p.user_problem ?? `围绕「${topic.title}」要解决的问题（待研究确定）`,
    user_problem: p.user_problem ?? `围绕「${topic.title}」的用户问题（待研究确定）`,
    core_thesis: p.suggested_thesis ?? '待研究后确定',
    content_hypothesis: overrides.hypothesis ?? p.rationale ?? '待验证',
    key_claims: [],
    counterpoints: ['待 Research Agent 补充'],
    canonical_structure: {},
    channel_intents: {},
    success_metrics: Object.keys(p.expected_metrics ?? {}).length ? Object.keys(p.expected_metrics) : ['产品页点击'],
    risk_level: 'medium',
    approval_required: true,
  };
}

function insertVariantContent(topicId: string, campaignId: string, topic: { title: string; payload: any }, overrides: { hypothesis?: string; persona?: string; funnelStage?: string } = {}) {
  const contentId = nextId('contents', 'CNT-2026', 4);
  // 标签取存活变体中第一个未占用的字母，避免归档释放名额后与现存变体撞标签
  const used = new Set(all(`SELECT variant_label l FROM contents WHERE topic_id = ? AND ${ALIVE}`, topicId).map(r => r.l));
  const label = VARIANT_LABELS.find(l => !used.has(l));
  if (!label) throw new Error(`同选题最多 ${MAX_VARIANTS_PER_TOPIC} 个存活变体（含首个），已达上限`);
  const ir = draftIR(contentId, topic, campaignId, overrides);
  const v = validateDraftIR(ir);
  if (!v.ok) throw new Error(`IR 草稿不合法：${v.errors.join('；')}`);
  tx(() => {
    run(`INSERT INTO contents (id, campaign_id, topic_id, variant_label, title, state, ir, risk_level) VALUES (?, ?, ?, ?, ?, 'TRIAGED', ?, ?)`,
      contentId, campaignId, topicId, label, topic.title, JSON.stringify(ir), topic.payload?.risk === '低' ? 'low' : 'medium');
    run(`UPDATE topics SET status = 'adopted' WHERE id = ?`, topicId);
  });
  return { content_id: contentId, state: 'TRIAGED', variant_label: label };
}

/** 采纳选题：创建该选题的首个变体（标签 A） */
export function adoptTopic(topicId: string, opts: { campaignId?: string } = {}) {
  const t = get(`SELECT * FROM topics WHERE id = ?`, topicId);
  if (!t) throw new Error('选题不存在');
  if (t.status !== 'pending') throw new Error(`选题状态 ${t.status} 不能采纳`);
  const payload = JSON.parse(t.payload);
  const campaignId = payload.campaign_id ?? opts.campaignId;
  if (!campaignId) throw new Error('缺少 campaign_id（选题未关联活动时需在请求中指定）');
  return insertVariantContent(topicId, campaignId, { title: t.title, payload });
}

/** 开变体：同一选题下再开一个独立内容（标签 B/C），必须声明与已有变体差异化的假设/角度 */
export function createVariant(topicId: string, input: { hypothesis: string; persona?: string; funnelStage?: string }) {
  if (!input?.hypothesis || !String(input.hypothesis).trim()) throw new Error('开变体必须填写「变体假设/角度」');
  const t = get(`SELECT * FROM topics WHERE id = ?`, topicId);
  if (!t) throw new Error('选题不存在');
  if (t.status !== 'adopted') throw new Error(`选题状态 ${t.status} 不能开变体（需先采纳）`);
  const payload = JSON.parse(t.payload);
  const campaignId = payload.campaign_id;
  if (!campaignId) throw new Error('选题缺少 campaign 关联，无法开变体');
  const alive = get(`SELECT COUNT(*) n FROM contents WHERE topic_id = ? AND ${ALIVE}`, topicId).n;
  if (alive >= MAX_VARIANTS_PER_TOPIC) throw new Error(`同选题最多 ${MAX_VARIANTS_PER_TOPIC} 个存活变体（含首个），已达上限`);
  return insertVariantContent(topicId, campaignId, { title: t.title, payload }, { hypothesis: input.hypothesis.trim(), persona: input.persona, funnelStage: input.funnelStage });
}
