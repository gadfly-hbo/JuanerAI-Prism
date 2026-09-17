import { test } from 'node:test';
import assert from 'node:assert/strict';

const { validateContentIR } = await import('../src/core/contentIR.ts');

const base = {
  content_id: 'CNT-2026-0001', campaign_id: 'CAM-2026-001', title: 't',
  objective: 'O2_激活', funnel_stage: 'awareness',
  persona: { role: '数据分析师' },
  job_to_be_done: 'j', user_problem: 'p', core_thesis: 't', content_hypothesis: 'h',
  key_claims: [{ claim_id: 'CLM-001', statement: 's', claim_type: 'fact', status: 'verified' }],
  counterpoints: ['反方'],
  canonical_structure: {}, channel_intents: {},
  success_metrics: ['landing_page_click'], risk_level: 'low', approval_required: true,
};

test('合法 IR 通过', () => {
  const r = validateContentIR(base);
  assert.ok(r.ok);
});

test('反方观点为空被拒', () => {
  const r = validateContentIR({ ...base, counterpoints: [] });
  assert.equal(r.ok, false);
});

test('approval_required 恒为 true', () => {
  const r = validateContentIR({ ...base, approval_required: false });
  assert.equal(r.ok, false);
});

test('主张类型非法被拒', () => {
  const r = validateContentIR({ ...base, key_claims: [{ claim_id: 'CLM-1', statement: 's', claim_type: 'gossip', status: 'verified' }] });
  assert.equal(r.ok, false);
});
