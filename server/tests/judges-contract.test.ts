// 裁判契约对齐测试：config/judge-rubrics.yaml 中 fail 级检查必须有真实实现
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PRISM_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'prism-test-contract-'));

const { run } = await import('../src/db.ts');
const { runEvidenceJudge, runBrandJudge, runChannelJudge } = await import('../src/judges/index.ts');

run(`INSERT INTO campaigns (id, name, objective) VALUES ('CAM-2026-001', '测试', 'O2_激活')`);

function makeContent(id: string, ir: any, canonical: any = {}) {
  run(`INSERT INTO contents (id, campaign_id, title, state, ir, canonical) VALUES (?, 'CAM-2026-001', ?, 'CREATIVE_READY', ?, ?)`,
    id, id, JSON.stringify(ir), JSON.stringify(canonical));
}
const goodIR = { key_claims: [], counterpoints: ['x'] };

test('ev-mislabel：推断主张以事实口吻出现且无限定词 → fail', () => {
  makeContent('CNT-2026-8101', {
    key_claims: [{ claim_id: 'CLM-50', statement: '决策质量边际贡献上升', claim_type: 'inference', status: 'verified' }],
    counterpoints: ['x'],
  }, { mechanism: '数据表明决策质量边际贡献上升，企业必须重视。' });
  const v = runEvidenceJudge('CNT-2026-8101');
  assert.equal(v.verdict, 'fail');
  assert.ok(v.findings.some(f => f.check === 'ev-mislabel' && f.level === 'fail'));
});

test('ev-mislabel：有限定词或未逐字引用 → 不误伤', () => {
  makeContent('CNT-2026-8102', {
    key_claims: [{ claim_id: 'CLM-51', statement: '决策质量边际贡献上升', claim_type: 'inference', status: 'verified' }],
    counterpoints: ['x'],
  }, { mechanism: '我们认为决策质量边际贡献上升，这是方向性判断。' });
  const v = runEvidenceJudge('CNT-2026-8102');
  assert.ok(!v.findings.some(f => f.check === 'ev-mislabel' && f.level === 'fail'));
});

test('bc-sensitive：手机号等敏感信息 → fail', () => {
  makeContent('CNT-2026-8103', goodIR, { cta: '联系 13812345678 咨询' });
  const v = runBrandJudge('CNT-2026-8103');
  assert.equal(v.verdict, 'fail');
  assert.ok(v.findings.some(f => f.check === 'bc-sensitive' && f.level === 'fail'));
});

test('bc-ai-label：变体缺 AI 标识元数据 → fail；齐备 → 不误伤', () => {
  makeContent('CNT-2026-8104', goodIR);
  run(`INSERT INTO channel_variants (content_id, platform, title, body, cta, utm, assets) VALUES
    ('CNT-2026-8104', 'wechat', 't', 'b', 'c', 'u', NULL)`);
  let v = runBrandJudge('CNT-2026-8104');
  assert.ok(v.findings.some(f => f.check === 'bc-ai-label' && f.level === 'fail'));

  run(`UPDATE channel_variants SET assets = ? WHERE content_id = 'CNT-2026-8104'`,
    JSON.stringify({ tasks: [], ai_labels: { text: true, image: true, video: true } }));
  v = runBrandJudge('CNT-2026-8104');
  assert.ok(v.findings.some(f => f.check === 'bc-ai-label' && f.level === 'ok'));
});

test('bc-position：竞品表述 → warn（不阻断但提示人工确认）', () => {
  makeContent('CNT-2026-8105', goodIR, { hook: '对比某竞品的做法…' });
  const v = runBrandJudge('CNT-2026-8105');
  assert.ok(v.findings.some(f => f.check === 'bc-position' && f.level === 'warn'));
});

test('cq-consistency：小红书缺评论口令 → fail（rubric 为 fail 级）', () => {
  makeContent('CNT-2026-8106', goodIR);
  run(`INSERT INTO channel_variants (content_id, platform, title, body, cta, utm) VALUES
    ('CNT-2026-8106', 'wechat', 't', 'b', 'c', 'u1'),
    ('CNT-2026-8106', 'zhihu', 't', 'b', 'c', 'u2'),
    ('CNT-2026-8106', 'xiaohongshu', 't', 'b', '点击链接下载', 'u3'),
    ('CNT-2026-8106', 'douyin', 't', 'b', 'c', 'u4')`);
  const v = runChannelJudge('CNT-2026-8106');
  assert.equal(v.verdict, 'fail');
  assert.ok(v.findings.some(f => f.check === 'cq-consistency' && f.level === 'fail'));
});
