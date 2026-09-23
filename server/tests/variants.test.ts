// 同主题实验变体：创建、上限、独立流水线、研究差异化。接缝 = core 公共函数（见 .flow/state.json seams）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PRISM_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'prism-test-variants-'));

const { run, get, all } = await import('../src/db.ts');
const { adoptTopic, createVariant } = await import('../src/core/variants.ts');
const { TransitionError } = await import('../src/core/stateMachine.ts');

function makeTopic(id: string, title = '本地大模型数据安全入门', campaignId = 'CAM-2026-001') {
  run(`INSERT OR IGNORE INTO campaigns (id, name, objective) VALUES (?, '测试活动', 'O2_激活')`, campaignId);
  run(`INSERT INTO topics (id, title, payload, status) VALUES (?, ?, ?, 'pending')`, id, title, JSON.stringify({ campaign_id: campaignId }));
  return id;
}

test('采纳选题创建首个变体：内容带选题关联与标签 A，选题进入 adopted', () => {
  makeTopic('TPC-901');
  const r = adoptTopic('TPC-901');
  assert.equal(r.state, 'TRIAGED');
  const c = get(`SELECT * FROM contents WHERE id = ?`, r.content_id);
  assert.equal(c.topic_id, 'TPC-901');
  assert.equal(c.variant_label, 'A');
  assert.equal(get(`SELECT status FROM topics WHERE id = 'TPC-901'`).status, 'adopted');
});

test('开变体：标签按创建序分配，假设写入 IR，继承选题 campaign', () => {
  makeTopic('TPC-902');
  adoptTopic('TPC-902');
  const b = createVariant('TPC-902', { hypothesis: '同一主题用反方观点切入，验证争议角度是否更促进讨论' });
  assert.equal(b.variant_label, 'B');
  const bc = get(`SELECT * FROM contents WHERE id = ?`, b.content_id);
  assert.equal(bc.topic_id, 'TPC-902');
  assert.equal(bc.campaign_id, 'CAM-2026-001');
  assert.equal(bc.state, 'TRIAGED');
  assert.equal(JSON.parse(bc.ir).content_hypothesis, '同一主题用反方观点切入，验证争议角度是否更促进讨论');
});

test('变体上限：同选题第 4 个被拒绝', () => {
  makeTopic('TPC-903');
  adoptTopic('TPC-903');
  createVariant('TPC-903', { hypothesis: '角度二' });
  createVariant('TPC-903', { hypothesis: '角度三' });
  assert.throws(() => createVariant('TPC-903', { hypothesis: '角度四' }), /最多 3 个存活变体/);
});

test('存活口径：归档的变体退出上限额度，可再开新变体', () => {
  makeTopic('TPC-908');
  const a = adoptTopic('TPC-908');
  createVariant('TPC-908', { hypothesis: '角度二' });
  createVariant('TPC-908', { hypothesis: '角度三' });
  assert.throws(() => createVariant('TPC-908', { hypothesis: '角度四' }), /最多 3 个存活变体/);
  run(`UPDATE contents SET state = 'ARCHIVED' WHERE id = ?`, a.content_id);
  const d = createVariant('TPC-908', { hypothesis: '角度四' });
  assert.equal(d.variant_label, 'A', '归档后名额释放，标签复用空位');
});

test('开变体必须填写差异化假设', () => {
  makeTopic('TPC-904');
  adoptTopic('TPC-904');
  assert.throws(() => createVariant('TPC-904', { hypothesis: '  ' }), /变体假设\/角度/);
  assert.throws(() => createVariant('TPC-904', {} as any), /变体假设\/角度/);
});

test('变体独立流水线：各自推进互不影响；四平台 UTM 按内容区分不回退', async () => {
  makeTopic('TPC-905');
  const a = adoptTopic('TPC-905');
  const b = createVariant('TPC-905', { hypothesis: '以案例故事切入，验证叙事角度' });
  const { advance } = await import('../src/core/controller.ts');
  const { currentState } = await import('../src/core/stateMachine.ts');

  await advance(a.content_id);  // TRIAGED → BRIEFED
  await advance(a.content_id);  // BRIEFED → RESEARCHED（mock 研究）
  assert.equal(currentState(a.content_id), 'RESEARCHED');
  assert.equal(currentState(b.content_id), 'TRIAGED');  // B 不受 A 推进影响

  await advance(b.content_id);  // B 也能独立推进
  assert.equal(currentState(b.content_id), 'BRIEFED');

  await advance(a.content_id);  // RESEARCHED → CANONICAL_DRAFTED
  await advance(a.content_id);  // CANONICAL_DRAFTED → CHANNEL_ADAPTED（mock 四平台）
  const utms = all(`SELECT platform, utm FROM channel_variants WHERE content_id = ?`, a.content_id);
  assert.equal(utms.length, 4);
  const aKey = a.content_id.toLowerCase().replace(/[^a-z0-9]/g, '');
  const suffixes = new Set(utms.map(u => u.utm.split('utm_content=')[1]));
  for (const u of utms) {
    assert.ok(u.utm.includes(aKey), `UTM 应含本内容唯一键：${u.utm}`);
  }
  assert.equal(suffixes.size, 4, '四平台 utm_content 后缀应互不相同');
});

test('门禁回归：变体内容同样受「无 approvals 不得 HUMAN_APPROVED」硬门禁', async () => {
  makeTopic('TPC-909');
  const a = adoptTopic('TPC-909');
  run(`UPDATE contents SET state = 'JUDGED' WHERE id = ?`, a.content_id);
  for (const judge of ['evidence', 'brand_compliance', 'channel_quality']) {
    run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES (?, ?, 'pass', '[]')`, a.content_id, judge);
  }
  const { transition, currentState } = await import('../src/core/stateMachine.ts');
  const { approve } = await import('../src/core/controller.ts');
  // 变体身份不提供任何门禁豁免：无批准记录必须被拒
  assert.throws(() => transition(a.content_id, 'HUMAN_APPROVED'), TransitionError);
  // 人工批准后正常通过
  approve(a.content_id, '变体内容也走同一门禁');
  assert.equal(currentState(a.content_id), 'HUMAN_APPROVED');
});

test('研究提示词包含同主题变体差异声明（A 的存在与 B 的假设）', async () => {
  makeTopic('TPC-906');
  const a = adoptTopic('TPC-906');
  const b = createVariant('TPC-906', { hypothesis: '从成本对比切入，验证理性决策角度' });
  const { advance } = await import('../src/core/controller.ts');
  await advance(a.content_id);  // A → BRIEFED
  await advance(b.content_id);  // B → BRIEFED

  const { setProvider } = await import('../src/llm/index.ts');
  const prompts: string[] = [];
  setProvider({
    name: 'fake', model: 'fake',
    async completeJSON(req) {
      prompts.push(req.prompt);
      return { data: { facts: [], counterpoints: ['样例限制'] }, tokens: 1, cost: 0 };
    },
  });
  try {
    await advance(b.content_id);  // B → RESEARCHED，研究走 fake provider
  } finally {
    setProvider();  // 恢复默认
  }
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes('同主题实验变体'), '应声明实验变体上下文');
  assert.ok(prompts[0].includes('从成本对比切入，验证理性决策角度'), '应包含本变体差异化假设');
  assert.ok(prompts[0].includes(`变体 A`) && prompts[0].includes(a.content_id), '应列出同选题已有变体');
});
