// Claim 核实策略：不信任 LLM 自报 confidence，按确定性规则判定
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { claimStatus } = await import('../src/core/productTruth.ts');

test('opinion 无需外部证据 → verified', () => {
  assert.equal(claimStatus({ claim_type: 'opinion' }), 'verified');
});

test('product_capability 必须命中 live 能力 → 未上线/未知一律 pending', () => {
  assert.equal(claimStatus({ claim_type: 'product_capability', source: 'PRODUCT-CAP-LOCAL-001' }), 'verified');
  assert.equal(claimStatus({ claim_type: 'product_capability', source: 'PRODUCT-CAP-PRIVATE-001' }), 'pending_review');
  assert.equal(claimStatus({ claim_type: 'product_capability', source: 'MADE-UP-CAP' }), 'pending_review');
});

test('fact 需要来源+时间；LLM 自称 confidence=high 但无来源 → pending', () => {
  assert.equal(claimStatus({ claim_type: 'fact', source: '国家统计局', source_time: '2026-01', confidence: 'high' }), 'verified');
  assert.equal(claimStatus({ claim_type: 'fact', confidence: 'high' }), 'pending_review');
  assert.equal(claimStatus({ claim_type: 'fact', source: '某报告', source_time: '2020-01', confidence: 'low' }), 'pending_review');
});

test('inference 一律 pending，不因高置信而放行', () => {
  assert.equal(claimStatus({ claim_type: 'inference', source: '案例归纳', confidence: 'high' }), 'pending_review');
});
