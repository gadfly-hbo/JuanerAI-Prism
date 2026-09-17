// CSV 导入与 UTM 归因测试（HTTP 级，真实走路由）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PRISM_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'prism-test-csv-'));

const express = (await import('express')).default;
const { api } = await import('../src/routes.ts');
const { run, get } = await import('../src/db.ts');

let server: any, base = '';

before(async () => {
  run(`INSERT INTO campaigns (id, name, objective) VALUES ('CAM-2026-009', '测试', 'O2_激活')`);
  run(`INSERT INTO contents (id, campaign_id, title) VALUES ('CNT-2026-7001', 'CAM-2026-009', 'CSV 测试内容')`);
  run(`INSERT INTO channel_variants (content_id, platform, title, body, utm) VALUES
    ('CNT-2026-7001', 'zhihu', 't', 'b', 'utm_source=zhihu&utm_medium=content&utm_campaign=cam2026_009&utm_content=cnt20267001_a')`);

  const app = express();
  app.use(express.json());
  app.use('/api', api);
  await new Promise<void>(r => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server?.close());

test('长表 CSV 导入并按 utm_content 归因', async () => {
  const csv = 'utm_content,metric,value,date\ncnt20267001_a,reads,100,2026-09-16\ncnt20267001_a,first_analysis,12,2026-09-16';
  const res = await fetch(`${base}/metrics/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'platform', csv }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.rows, 2);

  const ana = await (await fetch(`${base}/analytics`)).json();
  const c = ana.contents.find((x: any) => x.content_id === 'CNT-2026-7001');
  assert.ok(c, '分析结果应包含该内容');
  assert.equal(c.metrics.reads, 100);
  assert.equal(c.metrics.first_analysis, 12);
});

test('宽表 CSV 导入', async () => {
  const csv = 'utm_content,impressions,reads,download\ncnt20267001_a,5000,800,45';
  const res = await fetch(`${base}/metrics/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'platform', csv }),
  });
  const body = await res.json();
  assert.equal(body.rows, 3);
  const total = get(`SELECT SUM(value) v FROM metric_rows WHERE metric = 'download' AND utm_content = 'cnt20267001_a'`);
  assert.equal(total.v, 45);
});

test('引号包裹字段与 BOM/空行被正确解析', async () => {
  run(`INSERT INTO contents (id, campaign_id, title) VALUES ('CNT-2026-7004', 'CAM-2026-009', '引号解析测试')`);
  run(`INSERT INTO channel_variants (content_id, platform, title, body, utm) VALUES
    ('CNT-2026-7004', 'wechat', 't', 'b', 'utm_source=wechat&utm_medium=content&utm_campaign=cam2026_009&utm_content=cnt20267004_a')`);
  // "1,200" 引号内逗号不切分，但非数字被跳过；引号包裹的普通字段不产生列偏移
  const csv = '\uFEFFutm_content,metric,value\n\ncnt20267004_a,reads,"1,200"\ncnt20267004_a,"reads",7';
  const res = await fetch(`${base}/metrics/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'platform', csv }),
  });
  const body = await res.json();
  assert.equal(body.rows, 1);
  const row = get(`SELECT metric, value FROM metric_rows WHERE utm_content = 'cnt20267004_a'`);
  assert.equal(row.metric, 'reads');
  assert.equal(row.value, 7);
});

test('坏行被跳过，不中断导入', async () => {
  const csv = 'utm_content,metric,value\ncnt20267001_a,reads,abc\ncnt20267001_a,reads,55';
  const res = await fetch(`${base}/metrics/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'platform', csv }),
  });
  const body = await res.json();
  assert.equal(body.rows, 1);
});

test('四平台内容的一行指标只计一次（不按平台数放大）', async () => {
  run(`INSERT INTO contents (id, campaign_id, title) VALUES ('CNT-2026-7002', 'CAM-2026-009', '四平台归因测试')`);
  for (const [p, suffix] of [['wechat', 'a'], ['zhihu', 'b'], ['xiaohongshu', 'c'], ['douyin', 'd']]) {
    run(`INSERT INTO channel_variants (content_id, platform, title, body, utm) VALUES
      ('CNT-2026-7002', ?, 't', 'b', ?)`,
      p, `utm_source=${p}&utm_medium=content&utm_campaign=cam2026_009&utm_content=cnt20267002_${suffix}`);
  }
  const csv = 'utm_content,metric,value\ncnt20267002_a,reads,1000';
  await fetch(`${base}/metrics/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'platform', csv }),
  });
  const ana = await (await fetch(`${base}/analytics`)).json();
  const c = ana.contents.find((x: any) => x.content_id === 'CNT-2026-7002');
  assert.ok(c, '分析应包含四平台内容');
  assert.equal(c.metrics.reads, 1000, '一行指标必须只计一次');
});

test('utm_content 前缀包含时不误归因（cnt_a 与 cnt_a2）', async () => {
  run(`INSERT INTO contents (id, campaign_id, title) VALUES ('CNT-2026-7003', 'CAM-2026-009', '前缀碰撞测试')`);
  run(`INSERT INTO channel_variants (content_id, platform, title, body, utm) VALUES
    ('CNT-2026-7003', 'wechat', 't', 'b', 'utm_source=wechat&utm_medium=content&utm_campaign=cam2026_009&utm_content=cnt20267002_a2')`);
  const csv = 'utm_content,metric,value\ncnt20267002_a,reads,77';
  await fetch(`${base}/metrics/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'platform', csv }),
  });
  const ana = await (await fetch(`${base}/analytics`)).json();
  const c = ana.contents.find((x: any) => x.content_id === 'CNT-2026-7003');
  assert.ok(!c || !(c.metrics.reads > 0), '_a 的指标不得归因到 _a2 的内容');
});
