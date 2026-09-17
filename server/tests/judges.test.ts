// 裁判规则测试：夸大表达、未上线能力、缺反方观点、平台格式
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PRISM_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'prism-test-judge-'));

const { run, get } = await import('../src/db.ts');
const { runEvidenceJudge, runBrandJudge, runChannelJudge } = await import('../src/judges/index.ts');

run(`INSERT INTO campaigns (id, name, objective) VALUES ('CAM-2026-001', '测试', 'O2_激活')`);

function makeContent(id: string, ir: any, canonical: any = {}) {
  run(`INSERT INTO contents (id, campaign_id, title, state, ir, canonical) VALUES (?, 'CAM-2026-001', ?, 'CREATIVE_READY', ?, ?)`,
    id, id, JSON.stringify(ir), JSON.stringify(canonical));
}

const goodIR = {
  key_claims: [
    { claim_id: 'CLM-001', statement: '本地执行', claim_type: 'product_capability', evidence_ref: 'PRODUCT-CAP-LOCAL-001', status: 'verified' },
    { claim_id: 'CLM-041', statement: '增速 4.1%', claim_type: 'fact', evidence_ref: '国家统计局', status: 'verified' },
  ],
  counterpoints: ['本地模式仍需明确元数据边界'],
};

function addVariants(id: string) {
  const v = [
    ['wechat', '短标题', '公众号正文内容完全不同 abc', '阅读原文'],
    ['zhihu', '知乎问题标题', '知乎回答正文 xyz 完全不同', '评论置顶'],
    ['xiaohongshu', '小红书标题', '卡片文案 qwe 独特', '评论区扣模板'],
    ['douyin', '抖音标题', '口播脚本 zxc 独特', '置顶链接'],
  ];
  for (const [p, t, b, c] of v) {
    run(`INSERT INTO channel_variants (content_id, platform, title, body, cta, utm) VALUES (?,?,?,?,?,?)`, id, p, t, b, c, 'utm');
  }
}

test('证据裁判通过合规内容', () => {
  makeContent('CNT-2026-8001', goodIR);
  const v = runEvidenceJudge('CNT-2026-8001');
  assert.equal(v.verdict, 'pass');
});

test('宣传未上线能力被判 fail', () => {
  makeContent('CNT-2026-8002', {
    key_claims: [{ claim_id: 'CLM-9', statement: '支持私有化部署', claim_type: 'product_capability', evidence_ref: 'PRODUCT-CAP-PRIVATE-001', status: 'verified' }],
    counterpoints: ['x'],
  });
  const v = runEvidenceJudge('CNT-2026-8002');
  assert.equal(v.verdict, 'fail');
  assert.ok(v.findings.some(f => f.check === 'ev-truth' && f.level === 'fail'));
});

test('反方观点缺失被判 fail', () => {
  makeContent('CNT-2026-8003', { key_claims: [], counterpoints: [] });
  const v = runEvidenceJudge('CNT-2026-8003');
  assert.equal(v.verdict, 'fail');
  assert.ok(v.findings.some(f => f.check === 'ev-counter' && f.level === 'fail'));
});

test('夸大表达被品牌裁判拦截', () => {
  makeContent('CNT-2026-8004', goodIR, { hook: '闭眼冲！史上最强分析工具' });
  const v = runBrandJudge('CNT-2026-8004');
  assert.equal(v.verdict, 'fail');
});

test('平台裁判：版本不全 fail，齐备且差异化则 pass/warn', () => {
  makeContent('CNT-2026-8005', goodIR);
  run(`INSERT INTO channel_variants (content_id, platform, title, body, cta, utm) VALUES ('CNT-2026-8005', 'wechat', 't', 'b', 'c', 'u')`);
  assert.equal(runChannelJudge('CNT-2026-8005').verdict, 'fail');

  makeContent('CNT-2026-8006', goodIR);
  addVariants('CNT-2026-8006');
  const v = runChannelJudge('CNT-2026-8006');
  assert.notEqual(v.verdict, 'fail');
});

test('否定语境中的敏感词不误判（如「并不等于绝对安全」）', () => {
  makeContent('CNT-2026-8007', goodIR, { limitation: '本地并不等于绝对安全，权限管理依然重要。' });
  const v = runBrandJudge('CNT-2026-8007');
  assert.ok(!v.findings.some(f => f.check === 'bc-exaggeration' && f.level === 'fail'));
});

test('非否定的绝对化用语仍被拦截', () => {
  makeContent('CNT-2026-8008', goodIR, { hook: '这个方法绝对有效' });
  const v = runBrandJudge('CNT-2026-8008');
  assert.ok(v.findings.some(f => f.check === 'bc-exaggeration' && f.level === 'fail'));
});
