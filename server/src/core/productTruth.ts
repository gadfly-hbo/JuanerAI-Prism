// 产品能力事实源读取（缓存）。裁判与 Agent 共用同一份 live 集合。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let cached: { live: Set<string>; all: any[] } | null = null;

export function productTruth() {
  if (!cached) {
    const doc = yaml.load(readFileSync(path.join(ROOT, 'config', 'product-truth.yaml'), 'utf8')) as any;
    const all = doc.capabilities ?? [];
    cached = { live: new Set(all.filter((c: any) => c.status === 'live').map((c: any) => c.id)), all };
  }
  return cached;
}

export const CLAIM_TYPES = ['fact', 'product_capability', 'inference', 'opinion'] as const;

/**
 * Claim 核实策略（确定性，不信任 LLM 自报的 confidence）：
 * - opinion：品牌立场，无需外部证据 → verified
 * - product_capability：必须命中事实源 live 条目 → verified，否则 pending_review
 * - fact：必须同时有来源与来源时间；低置信 → pending_review
 * - inference：一律 pending_review（由人类/后续证据核实）
 */
export function claimStatus(c: { claim_type: string; source?: string | null; source_time?: string | null; confidence?: string }): 'verified' | 'pending_review' {
  if (c.claim_type === 'opinion') return 'verified';
  if (c.claim_type === 'product_capability') {
    return c.source && productTruth().live.has(c.source) ? 'verified' : 'pending_review';
  }
  if (c.claim_type === 'fact') {
    return c.source && c.source_time && c.confidence !== 'low' ? 'verified' : 'pending_review';
  }
  return 'pending_review';
}
