// advance 内容级互斥：同一内容执行期重复推进被拒，不重复跑 Agent（LLM 费用泄漏修复）。
// 接缝 = controller.advance 公共行为 + setProvider 注入可控 fake（见 .flow/state.json seams）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.PRISM_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'prism-test-mutex-'));

const { run } = await import('../src/db.ts');
const { advance, ContentBusyError } = await import('../src/core/controller.ts');
const { currentState } = await import('../src/core/stateMachine.ts');
const { setProvider } = await import('../src/llm/index.ts');

function makeContent(id: string, state = 'BRIEFED') {
  run(`INSERT OR IGNORE INTO campaigns (id, name, objective) VALUES ('CAM-2026-001', '测试活动', 'O2_激活')`);
  const ir = {
    content_id: id, campaign_id: 'CAM-2026-001', title: `t-${id}`,
    objective: 'O2_激活', funnel_stage: 'awareness',
    persona: { role: '数据敏感的个人用户', maturity: '评估中' },
    job_to_be_done: '在本地完成数据分析', user_problem: '担心云端处理数据',
    core_thesis: '本地执行解决数据顾虑', content_hypothesis: '待验证',
    key_claims: [], counterpoints: ['待 Research Agent 补充'],
    canonical_structure: {}, channel_intents: {},
    success_metrics: ['产品页点击'], risk_level: 'medium', approval_required: true,
  };
  run(`INSERT INTO contents (id, campaign_id, title, state, ir) VALUES (?, 'CAM-2026-001', ?, ?, ?)`, id, `t-${id}`, state, JSON.stringify(ir));
}

/** 可挂起的 fake provider：第一类调用等待 release，按 agentId 返回最小合法输出 */
function fakeProvider(gate: Promise<void>, counter: { calls: number }) {
  return {
    name: 'fake', model: 'fake',
    async completeJSON(req: any) {
      counter.calls++;
      await gate;
      if (req.agentId === 'A3-canonical') {
        return { data: { hook: 'h', problem: 'p', mechanism: 'm', example: 'e', limitation: 'l', cta: 'c' }, tokens: 1, cost: 0 };
      }
      return {
        data: {
          facts: [{ claim_id: 'CLM-9001', statement: '本地执行不上传数据', claim_type: 'fact', source: '产品文档', confidence: 'high', public_ok: true }],
          counterpoints: ['需要本地算力'],
        }, tokens: 1, cost: 0,
      };
    },
  };
}

const tick = () => new Promise(r => setImmediate(r));

test('并发 advance 同一内容：Agent 只跑一次，重复请求报「正在执行中」', async () => {
  makeContent('CNT-2026-9101');
  const counter = { calls: 0 };
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  setProvider(fakeProvider(gate, counter) as any);
  try {
    const first = advance('CNT-2026-9101');
    await tick();  // 让第一次推进进入 LLM 调用
    const second = advance('CNT-2026-9101');
    release();  // 先放行，保证无实现时也能结束（不会死锁）
    // 结构化错误类型（HTTP 层按 instanceof 映射 409），不是靠文案匹配
    await assert.rejects(() => second, (e: any) => {
      assert.ok(e instanceof ContentBusyError, `应抛 ContentBusyError，实际：${e?.constructor?.name}`);
      assert.match(e.message, /正在执行中/);
      return true;
    });
    const r = await first;
    assert.equal(r.to, 'RESEARCHED');
    assert.equal(counter.calls, 1, 'LLM 只应被调用一次');
  } finally {
    setProvider();
  }
});

test('执行完成后锁释放，可再次推进；失败也释放', async () => {
  makeContent('CNT-2026-9102');
  const counter = { calls: 0 };
  const gate = Promise.resolve();
  setProvider(fakeProvider(gate, counter) as any);
  try {
    await advance('CNT-2026-9102');  // BRIEFED → RESEARCHED
    await advance('CNT-2026-9102');  // RESEARCHED → CANONICAL_DRAFTED（锁已释放的证明）
    assert.equal(currentState('CNT-2026-9102'), 'CANONICAL_DRAFTED');

    // 失败路径释放：制造一个必然失败的推进（CANONICAL_DRAFTED 的 act 是 A4，fake 返回 research 形状 → 无 variants 落库，advance 本身不失败……改用非法状态）
    makeContent('CNT-2026-9103', 'JUDGED');
    await assert.rejects(() => advance('CNT-2026-9103'), /没有自动推进动作/);
    // 抛错后锁不应残留：再次调用走的是同样的状态错误而非「正在执行中」
    await assert.rejects(() => advance('CNT-2026-9103'), /没有自动推进动作/);
  } finally {
    setProvider();
  }
});

test('不同内容可并发推进，互不影响', async () => {
  makeContent('CNT-2026-9104');
  makeContent('CNT-2026-9105');
  const counter = { calls: 0 };
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  setProvider(fakeProvider(gate, counter) as any);
  try {
    const p1 = advance('CNT-2026-9104');
    const p2 = advance('CNT-2026-9105');
    await tick();
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.to, 'RESEARCHED');
    assert.equal(r2.to, 'RESEARCHED');
    assert.equal(counter.calls, 2);
  } finally {
    setProvider();
  }
});
