// 三个独立裁判：规则驱动、确定性、可测试。契约见 config/judge-rubrics.yaml。
// 任何 fail 都会让 Controller 把内容打回对应节点。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { all, get, run } from '../db.ts';
import { productTruth } from '../core/productTruth.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const brandPolicy = yaml.load(readFileSync(path.join(ROOT, 'config', 'brand-policy.yaml'), 'utf8')) as any;

interface Finding { check: string; level: 'ok' | 'warn' | 'fail'; message: string; }
interface Verdict { judge: string; verdict: 'pass' | 'warn' | 'fail'; findings: Finding[]; }

function finalize(judge: string, findings: Finding[]): Verdict {
  const verdict = findings.some(f => f.level === 'fail') ? 'fail'
    : findings.some(f => f.level === 'warn') ? 'warn' : 'pass';
  return { judge, verdict, findings };
}

function persist(v: Verdict, contentId: string) {
  run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES (?, ?, ?, ?)`,
    contentId, v.judge, v.verdict, JSON.stringify(v.findings));
}

/** J1 事实裁判 */
export function runEvidenceJudge(contentId: string): Verdict {
  const content = get(`SELECT ir, canonical FROM contents WHERE id = ?`, contentId);
  const ir = JSON.parse(content?.ir ?? '{}');
  const findings: Finding[] = [];

  const claims: any[] = ir.key_claims ?? [];
  const unsourced = claims.filter(c => c.claim_type !== 'opinion' && !c.evidence_ref);
  findings.push(unsourced.length === 0
    ? { check: 'ev-source', level: 'ok', message: `${claims.length} 条主张均可追溯到来源` }
    : { check: 'ev-source', level: 'fail', message: `${unsourced.length} 条主张缺少来源：${unsourced.map(c => c.claim_id).join('、')}` });

  const pending = claims.filter(c => c.status === 'pending_review');
  findings.push(pending.length === 0
    ? { check: 'ev-fresh', level: 'ok', message: '全部主张已核实' }
    : { check: 'ev-fresh', level: 'warn', message: `${pending.length} 条主张待复核：${pending.map(c => c.claim_id).join('、')}` });

  // ev-mislabel：推断/观点不得写成事实口吻——推断主张逐字出现在正文中且全文无限定词 → fail
  const canonicalText = JSON.stringify({
    structure: JSON.parse(content?.ir ?? '{}').canonical_structure ?? {},
    canonical: JSON.parse(content?.canonical ?? '{}'),
  });
  const HEDGES = ['我们认为', '我们推断', '推断', '方向性判断', '可能', '未必', '假设', '倾向于'];
  const bareInference = (ir.key_claims ?? [])
    .filter(c => c.claim_type === 'inference' && c.statement.slice(0, 10) && canonicalText.includes(c.statement.slice(0, 10)))
    .filter(c => !HEDGES.some(h => canonicalText.includes(h)));
  findings.push(bareInference.length === 0
    ? { check: 'ev-mislabel', level: 'ok', message: '推断/观点未被写成事实口吻' }
    : { check: 'ev-mislabel', level: 'fail', message: `推断主张以事实口吻出现且无限定词：${bareInference.map(c => c.claim_id).join('、')}` });

  const liveCaps = productTruth().live;
  const allCaps = productTruth().all;
  const blockedCaps = new Set(allCaps.filter((c: any) => c.status !== 'live').map((c: any) => c.id));
  const capClaims = claims.filter(c => c.claim_type === 'product_capability');
  const badCap = capClaims.filter(c => blockedCaps.has(c.evidence_ref ?? ''));
  const unknownCap = capClaims.filter(c => c.evidence_ref && !liveCaps.has(c.evidence_ref) && !blockedCaps.has(c.evidence_ref));
  if (badCap.length > 0) {
    findings.push({ check: 'ev-truth', level: 'fail', message: `宣传了未上线能力：${badCap.map(c => c.claim_id).join('、')}` });
  } else if (unknownCap.length > 0) {
    findings.push({ check: 'ev-truth', level: 'fail', message: `产品能力主张不在事实源中：${unknownCap.map(c => c.claim_id).join('、')}` });
  } else {
    findings.push({ check: 'ev-truth', level: 'ok', message: '产品能力主张与事实源一致' });
  }

  const counterpoints: string[] = ir.counterpoints ?? [];
  findings.push(counterpoints.length > 0
    ? { check: 'ev-counter', level: 'ok', message: '反方观点与限制完整保留' }
    : { check: 'ev-counter', level: 'fail', message: '反方观点缺失或被删除' });

  const v = finalize('evidence', findings);
  persist(v, contentId);
  return v;
}

/** J2 品牌与合规裁判 */
export function runBrandJudge(contentId: string): Verdict {
  const content = get(`SELECT ir, canonical FROM contents WHERE id = ?`, contentId);
  const text = JSON.stringify({ ir: JSON.parse(content?.ir ?? '{}'), canonical: JSON.parse(content?.canonical ?? '{}') });
  const variants = all(`SELECT * FROM channel_variants WHERE content_id = ?`, contentId);
  const allText = text + variants.map(v => `${v.title} ${v.body}`).join(' ');
  const findings: Finding[] = [];

  const exaggerations = ['闭眼冲', '史上最强', '永远正确', '100%', '绝对'];
  const hits: string[] = [];
  for (const w of exaggerations) {
    let idx = allText.indexOf(w);
    while (idx !== -1) {
      // 否定语境（"并不等于绝对安全"）是承认限制，不算夸大
      const before = allText.slice(Math.max(0, idx - 6), idx);
      if (!/[不非无未并]/.test(before)) { hits.push(w); break; }
      idx = allText.indexOf(w, idx + w.length);
    }
  }
  findings.push(hits.length === 0
    ? { check: 'bc-exaggeration', level: 'ok', message: '无夸大表达与效果承诺' }
    : { check: 'bc-exaggeration', level: 'fail', message: `发现夸大表达：${hits.join('、')}` });

  const roiPattern = /提升.{0,6}\d+%|ROI|回报率/i;
  findings.push(roiPattern.test(allText)
    ? { check: 'bc-roi', level: 'fail', message: '出现经营效果/ROI 承诺，需人工复核' }
    : { check: 'bc-roi', level: 'ok', message: '无经营效果承诺' });

  const planned = productTruth().all.filter((c: any) => c.status === 'planned' || c.status === 'unsupported');
  const leaked = planned.filter((c: any) => allText.includes(c.statement.slice(0, 6)));
  findings.push(leaked.length === 0
    ? { check: 'bc-capability', level: 'ok', message: '未宣传未上线能力' }
    : { check: 'bc-capability', level: 'fail', message: `疑似宣传未上线能力：${leaked.map((c: any) => c.id).join('、')}` });

  const caseLeak = /客户.{0,4}\d+%/.test(allText);
  findings.push(caseLeak
    ? { check: 'bc-case-auth', level: 'fail', message: '客户案例数字可能超出授权范围' }
    : { check: 'bc-case-auth', level: 'ok', message: '客户案例在授权范围内（匿名+脱敏）' });

  // bc-sensitive：手机号 / 身份证号 / 凭证字样
  const sensitive = /1[3-9]\d{9}/.test(allText) || /\d{17}[\dXx]/.test(allText) || /密码|api[_-]?key|secret/i.test(allText);
  findings.push(sensitive
    ? { check: 'bc-sensitive', level: 'fail', message: '疑似个人敏感信息或凭证字样，需人工复核' }
    : { check: 'bc-sensitive', level: 'ok', message: '未检出敏感个人信息与凭证' });

  // bc-position：竞品评价属品牌禁区（warn 级，交人工判断）
  const competitor = /竞品|友商/.test(allText);
  findings.push(competitor
    ? { check: 'bc-position', level: 'warn', message: '正文涉及竞品/友商表述，请确认符合品牌立场' }
    : { check: 'bc-position', level: 'ok', message: '无竞品评价，与品牌定位一致' });

  // bc-ai-label：所有平台变体必须携带 AI 标识元数据（由 A5 写入）
  const noLabel = variants.filter(v => {
    try { return !v.assets || !JSON.parse(v.assets)?.ai_labels; } catch { return true; }
  });
  findings.push(noLabel.length === 0
    ? { check: 'bc-ai-label', level: 'ok', message: '全部平台版本含 AI 生成内容标识元数据' }
    : { check: 'bc-ai-label', level: 'fail', message: `${noLabel.length} 个平台版本缺少 AI 标识元数据（素材任务未完成或被删除）` });

  const v = finalize('brand_compliance', findings);
  persist(v, contentId);
  return v;
}

/** J3 平台格式裁判 */
export function runChannelJudge(contentId: string): Verdict {
  const variants = all(`SELECT * FROM channel_variants WHERE content_id = ?`, contentId);
  const findings: Finding[] = [];

  if (variants.length < 4) {
    findings.push({ check: 'cq-format', level: 'fail', message: `平台版本不全：${variants.length}/4` });
  } else {
    findings.push({ check: 'cq-format', level: 'ok', message: '四平台版本齐备' });
  }

  for (const v of variants) {
    if (v.platform === 'wechat' && v.title.length > 30) {
      findings.push({ check: 'cq-format', level: 'fail', message: `公众号标题 ${v.title.length} 字超限（30）` });
    }
    if (v.platform === 'xiaohongshu' && (!v.cta || !(v.cta.includes('评论') || v.cta.includes('口令')))) {
      findings.push({ check: 'cq-consistency', level: 'fail', message: '小红书版本缺少评论口令/CTA 设计，与发布策略不一致' });
    }
  }

  // 非同文搬运：比较各平台正文相似度（简单字符级 Jaccard）
  const sim = (a: string, b: string) => {
    const sa = new Set(a.split('')), sb = new Set(b.split(''));
    const inter = [...sa].filter(c => sb.has(c)).length;
    return inter / (sa.size + sb.size - inter || 1);
  };
  let maxSim = 0;
  for (let i = 0; i < variants.length; i++)
    for (let j = i + 1; j < variants.length; j++)
      maxSim = Math.max(maxSim, sim(variants[i].body ?? '', variants[j].body ?? ''));
  findings.push(maxSim < 0.6
    ? { check: 'cq-not-copy', level: 'ok', message: `平台间最高相似度 ${(maxSim * 100).toFixed(0)}%，非同文搬运` }
    : { check: 'cq-not-copy', level: 'warn', message: `平台间最高相似度 ${(maxSim * 100).toFixed(0)}%，接近搬运` });

  const assetRaw = variants[0]?.assets;
  let assets: any[] = [];
  try { assets = assetRaw ? (JSON.parse(assetRaw)?.tasks ?? []) : []; } catch { assets = []; }
  const pendingAssets = assets.filter((a: any) => String(a.status).startsWith('pending'));
  findings.push(pendingAssets.length === 0
    ? { check: 'cq-assets', level: 'ok', message: '发布素材齐备' }
    : { check: 'cq-assets', level: 'warn', message: `${pendingAssets.length} 项素材未完成（如抖音录屏）` });

  const v = finalize('channel_quality', findings);
  persist(v, contentId);
  return v;
}

export function runAllJudges(contentId: string): Verdict[] {
  return [runEvidenceJudge(contentId), runBrandJudge(contentId), runChannelJudge(contentId)];
}
