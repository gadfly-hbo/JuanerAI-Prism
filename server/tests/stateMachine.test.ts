// 状态机与硬门禁测试。每个测试文件用独立临时 DB（PRISM_DATA_DIR）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PRISM_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'prism-test-sm-'));

const { db, run, get } = await import('../src/db.ts');
const { transition, TransitionError, currentState } = await import('../src/core/stateMachine.ts');
const { approve, reject } = await import('../src/core/controller.ts');

function makeContent(id: string, state = 'JUDGED') {
  run(`INSERT OR IGNORE INTO campaigns (id, name, objective) VALUES ('CAM-2026-001', '测试活动', 'O2_激活')`);
  run(`INSERT INTO contents (id, campaign_id, title, state) VALUES (?, 'CAM-2026-001', ?, ?)`, id, `t-${id}`, state);
}

test('非法转移被拒绝', () => {
  makeContent('CNT-2026-9001', 'IDEA');
  assert.throws(() => transition('CNT-2026-9001', 'PUBLISHED'), TransitionError);
  assert.equal(currentState('CNT-2026-9001'), 'IDEA');
});

test('未批准不能进入 HUMAN_APPROVED / PUBLISHED', () => {
  makeContent('CNT-2026-9002', 'JUDGED');
  for (const judge of ['evidence', 'brand_compliance', 'channel_quality']) {
    run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES (?, ?, 'pass', '[]')`, 'CNT-2026-9002', judge);
  }
  // 没有 approval 记录：拒绝
  assert.throws(() => transition('CNT-2026-9002', 'HUMAN_APPROVED'), TransitionError);
  // 走正常批准流程
  approve('CNT-2026-9002', 'ok');
  assert.equal(currentState('CNT-2026-9002'), 'HUMAN_APPROVED');
  // SCHEDULED 之后再发布
  transition('CNT-2026-9002', 'SCHEDULED', { reason: '预约' });
  transition('CNT-2026-9002', 'PUBLISHED', { reason: '人工确认' });
  assert.equal(currentState('CNT-2026-9002'), 'PUBLISHED');
});

test('裁判 fail 时不能进入 HUMAN_APPROVED', () => {
  makeContent('CNT-2026-9003', 'JUDGED');
  run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9003', 'evidence', 'fail', '[]')`);
  run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9003', 'brand_compliance', 'pass', '[]')`);
  run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9003', 'channel_quality', 'pass', '[]')`);
  run(`INSERT INTO approvals (content_id, decision) VALUES ('CNT-2026-9003', 'approve')`);
  assert.throws(() => transition('CNT-2026-9003', 'HUMAN_APPROVED'), /裁判/);
});

test('裁判不全（<3）不能批准', () => {
  makeContent('CNT-2026-9004', 'JUDGED');
  run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9004', 'evidence', 'pass', '[]')`);
  run(`INSERT INTO approvals (content_id, decision) VALUES ('CNT-2026-9004', 'approve')`);
  assert.throws(() => transition('CNT-2026-9004', 'HUMAN_APPROVED'), /裁判/);
});

test('人工退回回到指定节点并留痕', () => {
  makeContent('CNT-2026-9005', 'JUDGED');
  reject('CNT-2026-9005', '第 4 段重写', 'CANONICAL_DRAFTED');
  assert.equal(currentState('CNT-2026-9005'), 'CANONICAL_DRAFTED');
  const a = get(`SELECT * FROM approvals WHERE content_id = 'CNT-2026-9005'`);
  assert.equal(a.decision, 'reject');
  assert.equal(a.note, '第 4 段重写');
});

test('旧的 fail 裁判结果在重跑通过后不再阻塞（按 judge 取最新）', () => {
  makeContent('CNT-2026-9006', 'JUDGED');
  run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9006', 'evidence', 'fail', '[]')`);
  for (const judge of ['brand_compliance', 'channel_quality']) {
    run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9006', ?, 'pass', '[]')`, judge);
  }
  // 修复后重跑事实裁判通过
  run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9006', 'evidence', 'pass', '[]')`);
  approve('CNT-2026-9006');
  assert.equal(currentState('CNT-2026-9006'), 'HUMAN_APPROVED');
});

test('批准后可退回（HUMAN_APPROVED → 起草节点），且最新决定为 reject 时不能再次批准', () => {
  makeContent('CNT-2026-9007', 'JUDGED');
  for (const judge of ['evidence', 'brand_compliance', 'channel_quality']) {
    run(`INSERT INTO judge_results (content_id, judge, verdict, findings) VALUES ('CNT-2026-9007', ?, 'pass', '[]')`, judge);
  }
  approve('CNT-2026-9007');
  assert.equal(currentState('CNT-2026-9007'), 'HUMAN_APPROVED');
  // 退回成功且不留孤儿记录（事务）
  reject('CNT-2026-9007', '批准后发现措辞问题', 'CANONICAL_DRAFTED');
  assert.equal(currentState('CNT-2026-9007'), 'CANONICAL_DRAFTED');
  // 模拟内容重跑裁判回到 JUDGED：最新人工决定仍是 reject，必须重新批准才能进入 HUMAN_APPROVED
  run(`UPDATE contents SET state = 'JUDGED' WHERE id = 'CNT-2026-9007'`);
  assert.throws(() => transition('CNT-2026-9007', 'HUMAN_APPROVED'), /批准/);
});
