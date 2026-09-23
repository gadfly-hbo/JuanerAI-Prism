// 实验对照聚合 + 实验结论提议回流。接缝 = core 公共函数（topicCompare / listTopics / runVariantConclusionAgent / confirmProposal）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PRISM_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'prism-test-exp-'));

const { run, get } = await import('../src/db.ts');
const { adoptTopic, createVariant, listTopics, topicCompare } = await import('../src/core/variants.ts');

const PLATFORM_VARIANTS = [
  { platform: 'wechat', title: '公众号标题', body: '正文', cta: 'cta', tags: [] },
  { platform: 'zhihu', title: '知乎标题', body: '正文', cta: 'cta', tags: [] },
  { platform: 'xiaohongshu', title: '小红书标题', body: '正文', cta: '评论区口令：试试', tags: ['x'] },
  { platform: 'douyin', title: '抖音标题', body: '口播', cta: 'cta', tags: [] },
];

function fakeProvider(prompts: any[] = []) {
  return {
    name: 'fake', model: 'fake',
    async completeJSON(req: any) {
      prompts.push(req);
      if (req.agentId === 'A3-canonical') {
        return { data: { hook: 'h', problem: 'p', mechanism: 'm', example: 'e', limitation: 'l', cta: 'c' }, tokens: 1, cost: 0 };
      }
      if (req.agentId === 'A4-channel') {
        return { data: { variants: PLATFORM_VARIANTS }, tokens: 1, cost: 0 };
      }
      if (req.agentId === 'A7-variant-conclusion') {
        return {
          data: {
            conclusion: '成本对比角度在首次分析转化上领先',
            hypothesis_updates: [{ hypothesis: '理性决策角度更能促成首次真实分析', verdict: 'confirmed', evidence: '首次分析 18 对 10', action: 'update' }],
            new_hypotheses: [{ statement: '成本对比角度更能促成首次分析', audience: '个人用户', platform: 'wechat', metric: 'first_analysis', suggested_experiment: '再开一对变体验证' }],
          }, tokens: 1, cost: 0,
        };
      }
      return {
        data: {
          facts: [{ claim_id: 'CLM-9200', statement: '原始数据可留在本地执行环境', claim_type: 'fact', source: '产品文档', confidence: 'high', public_ok: true }],
          counterpoints: ['需要本地算力'],
        }, tokens: 1, cost: 0,
      };
    },
  };
}

function makeTopic(id: string, campaignId = 'CAM-2026-001') {
  run(`INSERT OR IGNORE INTO campaigns (id, name, objective) VALUES (?, '测试活动', 'O2_激活')`, campaignId);
  run(`INSERT INTO topics (id, title, payload, status) VALUES (?, ?, ?, 'pending')`, id, '本地数据分析怎么入门', JSON.stringify({ campaign_id: campaignId }));
}

/** 推进内容到 CHANNEL_ADAPTED（四平台变体就绪），供指标挂载 */
async function toChannelAdapted(contentId: string) {
  const { advance } = await import('../src/core/controller.ts');
  for (let i = 0; i < 4; i++) await advance(contentId);
}

const utmSegment = (contentId: string, platform: string) =>
  get(`SELECT utm u FROM channel_variants WHERE content_id = ? AND platform = ?`, contentId, platform).u.split('utm_content=')[1];

function importMetrics(rows: { segment: string; metric: string; value: number }[]) {
  const imp = run(`INSERT INTO metric_imports (kind, filename, rows) VALUES ('platform', 'test.csv', ?)`, rows.length);
  for (const r of rows) {
    run(`INSERT INTO metric_rows (import_id, utm_content, metric, value) VALUES (?, ?, ?, ?)`,
      Number(imp.lastInsertRowid), r.segment, r.metric, r.value);
  }
}

test('listTopics 带出变体计数与明细：采纳后 1，开变体后 2', () => {
  makeTopic('TPC-930');
  adoptTopic('TPC-930');
  const after1 = listTopics().find(t => t.id === 'TPC-930');
  assert.equal(after1.variant_count, 1);
  assert.equal(after1.variants.length, 1);
  assert.equal(after1.variants[0].variant_label, 'A');
  assert.equal(after1.variants[0].state, 'TRIAGED');
  assert.ok('hypothesis' in after1.variants[0]);
  createVariant('TPC-930', { hypothesis: '从成本对比切入' });
  const after2 = listTopics().find(t => t.id === 'TPC-930');
  assert.equal(after2.variant_count, 2);
  assert.deepEqual(after2.variants.map((v: any) => v.variant_label), ['A', 'B']);
});

test('topicCompare：变体 × 平台累计指标 + 领先摘要（激活指标优先）', async () => {
  makeTopic('TPC-931');
  const a = adoptTopic('TPC-931');
  const b = createVariant('TPC-931', { hypothesis: '从成本对比切入' });
  const { setProvider } = await import('../src/llm/index.ts');
  setProvider(fakeProvider());
  try {
    await toChannelAdapted(a.content_id);
    await toChannelAdapted(b.content_id);
  } finally {
    setProvider();
  }
  importMetrics([
    { segment: utmSegment(a.content_id, 'wechat'), metric: 'reads', value: 1000 },
    { segment: utmSegment(a.content_id, 'wechat'), metric: 'first_analysis', value: 10 },
    { segment: utmSegment(b.content_id, 'wechat'), metric: 'reads', value: 800 },
    { segment: utmSegment(b.content_id, 'wechat'), metric: 'first_analysis', value: 18 },
    { segment: utmSegment(a.content_id, 'zhihu'), metric: 'reads', value: 500 },
  ]);

  const cmp = topicCompare('TPC-931');
  assert.equal(cmp.variants.length, 2);
  const va = cmp.variants.find(v => v.variant_label === 'A');
  const vb = cmp.variants.find(v => v.variant_label === 'B');
  assert.equal(va.totals.reads, 1500);
  assert.equal(va.totals.first_analysis, 10);
  assert.equal(va.platforms.wechat.reads, 1000);
  assert.equal(va.platforms.zhihu.reads, 500);
  assert.equal(vb.platforms.zhihu, undefined, 'B 的知乎没有数据则不出现该平台');

  // 领先摘要：first_analysis 优先，B 的公众号 18 对 A 的公众号 10 领先 80%
  const fa = cmp.summary.find(s => s.metric === 'first_analysis');
  assert.deepEqual(fa.leader, { variant: 'B', platform: 'wechat', value: 18 });
  assert.deepEqual(fa.runner_up, { variant: 'A', value: 10 });
  assert.equal(fa.lead_pct, 80);
  const rd = cmp.summary.find(s => s.metric === 'reads');
  assert.deepEqual(rd.leader, { variant: 'A', platform: 'wechat', value: 1000 });
  assert.equal(rd.lead_pct, 25);
});

test('topicCompare：单变体有数据时给领先者但不给领先百分比', async () => {
  makeTopic('TPC-932');
  const a = adoptTopic('TPC-932');
  const { setProvider } = await import('../src/llm/index.ts');
  setProvider(fakeProvider());
  try {
    await toChannelAdapted(a.content_id);
  } finally {
    setProvider();
  }
  importMetrics([{ segment: utmSegment(a.content_id, 'wechat'), metric: 'reads', value: 300 }]);
  const cmp = topicCompare('TPC-932');
  const rd = cmp.summary.find(s => s.metric === 'reads');
  assert.deepEqual(rd.leader, { variant: 'A', platform: 'wechat', value: 300 });
  assert.equal(rd.lead_pct, null);
});

test('实验结论提议：基于真实对照数据生成 proposals，确认后假设库可回链实验', async () => {
  makeTopic('TPC-933');
  const a = adoptTopic('TPC-933');
  createVariant('TPC-933', { hypothesis: '从成本对比切入' });
  const { setProvider } = await import('../src/llm/index.ts');
  const prompts: any[] = [];
  setProvider(fakeProvider(prompts));
  try {
    await toChannelAdapted(a.content_id);
    importMetrics([
      { segment: utmSegment(a.content_id, 'wechat'), metric: 'first_analysis', value: 10 },
      { segment: utmSegment(a.content_id, 'wechat'), metric: 'reads', value: 1500 },
    ]);
    const { runVariantConclusionAgent } = await import('../src/agents/index.ts');
    const r = await runVariantConclusionAgent('TPC-933');
    assert.ok(r.conclusion);

    // 提示词必须带真实对照数字（不许模型凭空编）
    const p = prompts.at(-1).prompt;
    assert.ok(p.includes('1500'), '提示词应含 A 的 reads 合计');
    assert.ok(p.includes('first_analysis'));
    assert.ok(p.includes('从成本对比切入'), '提示词应含变体假设');

    // 提议入库且带 topic 关联，pending 等人工处理
    const props = get(`SELECT COUNT(*) n FROM library_proposals WHERE status = 'pending'`).n;
    assert.ok(props >= 1);
    const any = get(`SELECT payload FROM library_proposals WHERE kind = 'hypothesis_new' ORDER BY id DESC`);
    assert.equal(JSON.parse(any.payload).topic_id, 'TPC-933');
  } finally {
    setProvider();
  }

  // 人工确认后假设库可查到记录并回链实验
  run(`INSERT INTO library_proposals (kind, payload) VALUES ('hypothesis_new', ?)`,
    JSON.stringify({ statement: '成本对比角度更能促成首次分析', topic_id: 'TPC-933', metric: 'first_analysis' }));
  const { confirmProposal } = await import('../src/core/library.ts');
  const pid = get(`SELECT id FROM library_proposals ORDER BY id DESC`).id;
  confirmProposal(pid);
  const hyp = get(`SELECT * FROM hypotheses WHERE statement = '成本对比角度更能促成首次分析'`);
  assert.ok(hyp, '确认后假设库应有记录');
  assert.equal(hyp.topic_id, 'TPC-933');
});

test('实验结论提议：无变体 / 无指标数据时明确拒绝，不生成编造结论', async () => {
  const { runVariantConclusionAgent } = await import('../src/agents/index.ts');
  makeTopic('TPC-934');
  await assert.rejects(() => runVariantConclusionAgent('TPC-934'), /还没有变体/);

  adoptTopic('TPC-934');
  await assert.rejects(() => runVariantConclusionAgent('TPC-934'), /还没有导入任何指标数据/);
});

test('hypothesis_update 提议确认后裁决写回假设库（confirmed/rejected/原文缺失）', async () => {
  run(`INSERT INTO hypotheses (id, statement, metric) VALUES ('HYP-951', '叙事角度更能提升收藏率', 'collects')`);
  const { confirmProposal } = await import('../src/core/library.ts');

  // confirmed → status confirmed, support +1
  run(`INSERT INTO library_proposals (kind, payload) VALUES ('hypothesis_update', ?)`,
    JSON.stringify({ hypothesis: '叙事角度更能提升收藏率', verdict: 'confirmed', evidence: '收藏 32 对 18' }));
  confirmProposal(get(`SELECT id FROM library_proposals ORDER BY id DESC`).id);
  const h1 = get(`SELECT * FROM hypotheses WHERE id = 'HYP-951'`);
  assert.equal(h1.status, 'confirmed');
  assert.equal(h1.support, 1);

  // rejected → status rejected, oppose +1
  run(`INSERT INTO library_proposals (kind, payload) VALUES ('hypothesis_update', ?)`,
    JSON.stringify({ hypothesis: '叙事角度更能提升收藏率', verdict: 'rejected', evidence: '样本不足' }));
  confirmProposal(get(`SELECT id FROM library_proposals ORDER BY id DESC`).id);
  const h2 = get(`SELECT * FROM hypotheses WHERE id = 'HYP-951'`);
  assert.equal(h2.status, 'rejected');
  assert.equal(h2.oppose, 1);

  // inconclusive → 只改状态，不投支持/反对票
  run(`INSERT INTO library_proposals (kind, payload) VALUES ('hypothesis_update', ?)`,
    JSON.stringify({ hypothesis: '叙事角度更能提升收藏率', verdict: 'inconclusive', evidence: '数据不足' }));
  confirmProposal(get(`SELECT id FROM library_proposals ORDER BY id DESC`).id);
  const h3 = get(`SELECT * FROM hypotheses WHERE id = 'HYP-951'`);
  assert.equal(h3.status, 'inconclusive');
  assert.equal(h3.support, 1, 'inconclusive 不应增加 support');
  assert.equal(h3.oppose, 1, 'inconclusive 不应增加 oppose');

  // 原文不在假设库 → 明确报错，不静默吞掉
  run(`INSERT INTO library_proposals (kind, payload) VALUES ('hypothesis_update', ?)`,
    JSON.stringify({ hypothesis: '假设库里没有的句子', verdict: 'confirmed' }));
  const pid = get(`SELECT id FROM library_proposals ORDER BY id DESC`).id;
  assert.throws(() => confirmProposal(pid), /假设库中找不到/);
});
