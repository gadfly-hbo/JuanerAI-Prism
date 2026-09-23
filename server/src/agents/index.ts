// 七个领域 Agent。契约见 config/agent-contracts.yaml。
// 每个 Agent 只产出结构化结果并记录 run；状态转移由 Controller 完成。
import { createHash, randomUUID } from 'node:crypto';
import { all, get, nextId, run } from '../db.ts';
import { getProvider } from '../llm/index.ts';
import { CLAIM_TYPES, claimStatus } from '../core/productTruth.ts';
import { topicCompare } from '../core/variants.ts';

// 四平台白名单：LLM 输出的 platform 必须命中，否则丢弃（防提示注入/幻觉写入非法值）
export const PLATFORMS = ['wechat', 'zhihu', 'xiaohongshu', 'douyin'] as const;
const UTM_SUFFIX: Record<string, string> = { wechat: 'a', zhihu: 'b', xiaohongshu: 'c', douyin: 'd' };

function recordRun(contentId: string | null, agentId: string, inputRefs: any, output: any, usage: { tokens: number; cost: number }, model: string, campaignId: string | null = null) {
  const id = `RUN-${randomUUID().slice(0, 8).toUpperCase()}`;
  const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex').slice(0, 16);
  const cid = campaignId ?? (contentId ? get(`SELECT campaign_id c FROM contents WHERE id = ?`, contentId)?.c : null);
  run(
    `INSERT INTO runs (id, content_id, campaign_id, agent_id, prompt_version, model, input_refs, output_hash, tokens, cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, contentId, cid, agentId, 'v1', model, JSON.stringify(inputRefs), hash, usage.tokens, usage.cost);
  return id;
}

async function call(agentId: string, system: string, prompt: string) {
  const provider = getProvider();
  const r = await provider.completeJSON({ agentId, system, prompt });
  return { data: r.data, usage: { tokens: r.tokens, cost: r.cost }, model: provider.model };
}

/** A1 Strategy：从信号生成选题候选（写入 topics 表，等待人类采纳） */
export async function runStrategyAgent(campaignId: string) {
  const campaign = get(`SELECT * FROM campaigns WHERE id = ?`, campaignId);
  const { data, usage, model } = await call(
    'A1-strategy',
    '你是 Strategy & Audience Agent。基于 OSM 目标与信号，生成选题候选。不直接决定发布。',
    `活动目标：${campaign?.objective ?? ''}\n北极星：${campaign?.north_star ?? ''}\n请输出 3 个选题候选。`);

  const ids: string[] = [];
  for (const c of data.candidates ?? []) {
    const id = nextId('topics', 'TPC', 3);
    run(`INSERT INTO topics (id, title, payload, status) VALUES (?, ?, ?, 'pending')`,
      id, c.title, JSON.stringify({ ...c, campaign_id: campaignId }));
    ids.push(id);
  }
  recordRun(null, 'A1-strategy', { campaignId }, data, usage, model, campaignId);
  return ids;
}

/** A2 Research：生成 Evidence Pack，并把新 Claim 登记进 claims 表 */
export async function runResearchAgent(contentId: string) {
  const content = get(`SELECT * FROM contents WHERE id = ?`, contentId);
  // 同主题实验变体：向研究声明本变体角度与已有变体角度，保证研究服务差异化而非重复同角度
  let variantBlock = '';
  if (content?.topic_id) {
    const ownHyp = JSON.parse(content.ir ?? '{}').content_hypothesis ?? '未声明';
    const siblings = all(`SELECT id, variant_label, ir FROM contents WHERE topic_id = ? AND id != ?`, content.topic_id, contentId);
    const sibLines = siblings
      .map(s => `变体 ${s.variant_label}（${s.id}）：${JSON.parse(s.ir ?? '{}').content_hypothesis ?? '未声明'}`)
      .join('\n');
    variantBlock = `
同主题实验变体：本内容是变体 ${content.variant_label}，差异化角度假设：${ownHyp}
同选题已有变体（研究必须服务本变体的差异化角度，避免与其他变体重复切入）：
${sibLines || '（暂无其他变体）'}
`;
  }
  const { data, usage, model } = await call(
    'A2-research',
    '你是 Topic & Research Agent。输出证据包：已验证事实、来源、反方观点、可使用案例、不可公开内容、待确认事项。不写正文。',
    `主题：${content?.title}${variantBlock}
产品事实源能力 ID（product_capability 类 claim 的 source 必须从这里选，禁止编造）：
PRODUCT-CAP-LOCAL-001（本地执行）、PRODUCT-CAP-EXCEL-001（Excel 直连）、PRODUCT-CAP-CANDIDATE-001（决策候选）。

只输出如下结构的 JSON（claim_id 用 CLM- 前缀自行编号）：
{"facts":[{"claim_id":"CLM-001","statement":"…","claim_type":"fact","source":"来源","source_time":"YYYY-MM","confidence":"high|medium|low","public_ok":true}],
 "inferences":[{"claim_id":"CLM-xxx","statement":"…","claim_type":"inference","source":"…","confidence":"medium","public_ok":true}],
 "counterpoints":["反方观点1","限制2"],
 "usable_cases":[{"id":"…","desc":"…","authorized":false,"anonymized":true}],
 "blocked":["不可公开的内容"],
 "open_questions":["待确认事项"]}`);

  const pack = data.evidence_package ?? data;
  const norm = (list: any[], type: string) => (list ?? []).map((c: any, i: number) => ({
    claim_id: c.claim_id ?? `CLM-A2-${contentId.slice(-4)}-${type[0]}${i + 1}`,
    statement: c.statement ?? c.fact ?? '',
    claim_type: c.claim_type ?? type,
    source: c.source ?? null,
    source_time: c.source_time ?? null,
    confidence: c.confidence ?? 'medium',
    public_ok: c.public_ok !== false,
  }));
  const allClaims = [...norm(pack.facts ?? pack.verified_facts, 'fact'), ...norm(pack.inferences, 'inference')];
  const counterpoints = pack.counterpoints ?? pack.counterarguments_or_risks ?? [];
  // Claim 核实走确定性策略（core/productTruth.ts），不信任 LLM 自报的 confidence；
  // 类型非法或 ID 格式不对的 claim 直接丢弃
  const valid = allClaims.filter(c => {
    const ok = /^CLM-[A-Za-z0-9-]+$/.test(c.claim_id ?? '') && CLAIM_TYPES.includes(c.claim_type);
    if (!ok) console.warn(`[A2] 丢弃非法 claim：${JSON.stringify(c.claim_id)}`);
    return ok;
  });
  for (const c of valid) {
    const status = claimStatus(c);
    run(
      `INSERT OR REPLACE INTO claims (id, statement, claim_type, source, source_time, confidence, public_ok, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      c.claim_id, c.statement, c.claim_type, c.source ?? null, c.source_time ?? null,
      c.confidence ?? 'medium', c.public_ok === false ? 0 : 1, status);
  }
  run(
    `INSERT OR REPLACE INTO evidence_packs (content_id, pack, updated_at) VALUES (?, ?, datetime('now'))`,
    contentId, JSON.stringify(data));

  // 把证据回填进 Content IR
  const ir = JSON.parse(content?.ir ?? '{}');
  ir.key_claims = valid.map(c => ({
    claim_id: c.claim_id, statement: c.statement, claim_type: c.claim_type,
    evidence_ref: c.source, status: claimStatus(c),
  }));
  ir.counterpoints = counterpoints.length ? counterpoints : ir.counterpoints;
  run(`UPDATE contents SET ir = ?, updated_at = datetime('now') WHERE id = ?`, JSON.stringify(ir), contentId);

  recordRun(contentId, 'A2-research', { contentId }, data, usage, model);
  return data;
}

/** A3 Canonical：基于 IR + 证据包生成主内容 */
export async function runCanonicalAgent(contentId: string) {
  const content = get(`SELECT ir FROM contents WHERE id = ?`, contentId);
  const pack = get(`SELECT pack FROM evidence_packs WHERE content_id = ?`, contentId);
  const { data, usage, model } = await call(
    'A3-canonical',
    '你是 Canonical Content Agent。基于 Content IR 与证据包生成主内容。区分事实、推断与观点；反方观点必须保留。不做平台风格。禁止使用「绝对」「永远」「闭眼冲」「史上最强」「100%」等绝对化或夸大用语。',
    `Content IR：${content?.ir}\n证据包：${pack?.pack}

只输出如下结构的 JSON（六个键缺一不可，值为中文段落）：
{"hook":"开头钩子","problem":"问题","mechanism":"机制/方法论","example":"案例","limitation":"限制与边界","cta":"行动召唤"}`);

  const ir = JSON.parse(content?.ir ?? '{}');
  ir.canonical_structure = data;
  run(`UPDATE contents SET ir = ?, canonical = ?, updated_at = datetime('now') WHERE id = ?`,
    JSON.stringify(ir), JSON.stringify(data), contentId);

  recordRun(contentId, 'A3-canonical', { contentId }, data, usage, model);
  return data;
}

const PLATFORM_LABEL: Record<string, string> = {
  wechat: '公众号', zhihu: '知乎', xiaohongshu: '小红书', douyin: '抖音',
};

/** A4 Channel Studio：主内容 → 四平台原生变体，每个平台独立适配 */
export async function runChannelAgent(contentId: string) {
  const content = get(`SELECT ir, canonical FROM contents WHERE id = ?`, contentId);
  const { data, usage, model } = await call(
    'A4-channel',
    '你是 Channel Studio Agent。把主内容改造成平台原生版本，不是缩写或改标题。不得改变核心主张。',
    `主内容：${content?.canonical}\n渠道意图：${content?.ir}

硬性要求：公众号标题 ≤26 字；四个平台的标题和正文必须从不同角度切入，句式与措辞差异化，禁止同文搬运；小红书 CTA 必须包含评论区口令；所有内容禁止绝对化用语。

只输出如下结构的 JSON，platform 只允许这四个值：wechat、zhihu、xiaohongshu、douyin（四个平台各一条，缺一不可）：
{"variants":[{"platform":"wechat","title":"标题","body":"正文","cta":"行动召唤","tags":[]},{"platform":"zhihu","title":"…","body":"…","cta":"…","tags":[]},{"platform":"xiaohongshu","title":"…","body":"…","cta":"必须包含评论区口令设计","tags":["标签"]},{"platform":"douyin","title":"…","body":"60秒口播脚本","cta":"…","tags":[]}]}`);

  const ALIAS: Record<string, string> = { 公众号: 'wechat', 微信: 'wechat', 知乎: 'zhihu', 小红书: 'xiaohongshu', 抖音: 'douyin' };
  for (const v of data.variants ?? []) {
    v.platform = ALIAS[v.platform] ?? v.platform;
    if (!PLATFORMS.includes(v.platform)) {
      console.warn(`[A4] 丢弃非法平台变体：${JSON.stringify(v.platform)}`);
      continue;
    }
    const utm = `utm_source=${v.platform}&utm_medium=content&utm_campaign=${get(`SELECT campaign_id c FROM contents WHERE id = ?`, contentId)?.c}&utm_content=${contentId.toLowerCase().replace(/[^a-z0-9]/g, '')}_${UTM_SUFFIX[v.platform]}`;
    run(
      `INSERT INTO channel_variants (content_id, platform, title, body, cta, utm)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(content_id, platform) DO UPDATE SET title=excluded.title, body=excluded.body, cta=excluded.cta, utm=excluded.utm, approved=0`,
      contentId, v.platform, v.title, v.body, v.cta ?? '', utm);
  }
  recordRun(contentId, 'A4-channel', { contentId, platforms: Object.keys(PLATFORM_LABEL) }, data, usage, model);
  return data;
}

/** A5 Creative：生成素材任务包（首期不做全自动成片） */
export async function runCreativeAgent(contentId: string) {
  const { data, usage, model } = await call(
    'A5-creative',
    '你是 Creative Production Agent。输出封面/卡片/分镜/字幕等素材任务清单，并记录 AI 标识元数据。',
    `内容：${contentId} 的平台变体

只输出如下结构的 JSON：
{"asset_tasks":[{"platform":"wechat","kind":"封面图|图文卡片|分镜脚本|字幕文件","spec":"规格说明","status":"ready|pending_screenrecording|pending"}],"ai_labels":{"text":true,"image":true,"video":true}}`);

  // 素材与 AI 标识是内容级元数据：写入该内容全部平台变体，供品牌裁判核查
  const assets = JSON.stringify({ tasks: data.asset_tasks ?? [], ai_labels: data.ai_labels ?? null });
  run(`UPDATE channel_variants SET assets = ? WHERE content_id = ?`, assets, contentId);
  recordRun(contentId, 'A5-creative', { contentId }, data, usage, model);
  return data;
}

/** A7 Growth：复盘并提议双库更新（只提议，人类确认后才入库） */
export async function runGrowthAgent(contentId?: string) {
  const { data, usage, model } = await call(
    'A7-growth',
    '你是 Growth & Learning Agent。基于指标生成复盘，提议假设/策略库更新。你只有提议权。',
    `内容：${contentId ?? '本周全部'}

只输出如下结构的 JSON：
{"weekly_summary":"…","hypothesis_updates":[{"hypothesis":"与假设库中完全一致的原文","verdict":"confirmed|rejected|inconclusive","evidence":"…","action":"promote_to_strategy|update"}],"new_hypotheses":[{"statement":"…","audience":"…","platform":"…","metric":"…","suggested_experiment":"…"}],"roadmap_signals":["…"]}`);

  for (const h of data.hypothesis_updates ?? []) {
    run(`INSERT INTO library_proposals (kind, payload) VALUES (?, ?)`,
      h.action === 'promote_to_strategy' ? 'strategy_promote' : 'hypothesis_update', JSON.stringify(h));
  }
  for (const h of data.new_hypotheses ?? []) {
    run(`INSERT INTO library_proposals (kind, payload) VALUES ('hypothesis_new', ?)`, JSON.stringify(h));
  }
  recordRun(contentId ?? null, 'A7-growth', { contentId }, data, usage, model);
  return data;
}

/** A6 Publishing：导出发布包在 routes 中实现（文件 IO），这里只生成 UTM 规划 */
export function planUtm(contentId: string) {
  return all(`SELECT platform, utm FROM channel_variants WHERE content_id = ?`, contentId);
}

/** A7 变体实验结论：基于同选题变体对照指标提议假设库更新（只提议，人类确认后入库） */
export async function runVariantConclusionAgent(topicId: string) {
  const compare = topicCompare(topicId);
  if (!compare.variants.length) throw new Error('该选题还没有变体内容，无法生成实验结论');
  const hasData = compare.variants.some(v => Object.keys(v.totals).length > 0);
  if (!hasData) throw new Error('该选题的变体还没有导入任何指标数据（发布后在「增长分析」导入 CSV），无法生成实验结论');

  const { data, usage, model } = await call(
    'A7-variant-conclusion',
    '你是 Growth & Learning Agent。基于同主题变体实验的对照指标生成实验结论，提议假设库更新。结论只描述数据支持什么，不夸大。你只有提议权。',
    `选题：${compare.topic.title}
实验对照（累计指标）：${JSON.stringify(compare.variants.map(v => ({ variant: v.variant_label, hypothesis: v.hypothesis, state: v.state, totals: v.totals, platforms: v.platforms })))}
领先摘要：${JSON.stringify(compare.summary)}

只输出如下结构的 JSON：
{"conclusion":"实验结论一句话（基于数据，不夸大）","hypothesis_updates":[{"hypothesis":"与假设库中完全一致的原文","verdict":"confirmed|rejected|inconclusive","evidence":"引用对照数字","action":"promote_to_strategy|update"}],"new_hypotheses":[{"statement":"…","audience":"…","platform":"…","metric":"…","suggested_experiment":"…"}]}`);

  for (const h of data.hypothesis_updates ?? []) {
    run(`INSERT INTO library_proposals (kind, payload) VALUES (?, ?)`,
      h.action === 'promote_to_strategy' ? 'strategy_promote' : 'hypothesis_update',
      JSON.stringify({ ...h, topic_id: topicId }));
  }
  for (const h of data.new_hypotheses ?? []) {
    run(`INSERT INTO library_proposals (kind, payload) VALUES ('hypothesis_new', ?)`,
      JSON.stringify({ ...h, topic_id: topicId }));
  }
  recordRun(null, 'A7-variant-conclusion', { topicId }, data, usage, model);
  return { ...data, proposals_created: (data.hypothesis_updates?.length ?? 0) + (data.new_hypotheses?.length ?? 0) };
}
