// Content IR 的 zod 校验，契约见 config/content-ir.schema.yaml
import { z } from 'zod';

export const ClaimSchema = z.object({
  claim_id: z.string().regex(/^CLM-/),
  statement: z.string().min(1),
  claim_type: z.enum(['fact', 'product_capability', 'inference', 'opinion']),
  evidence_ref: z.string().optional(),
  status: z.enum(['verified', 'pending_review', 'rejected']),
});

export const ContentIRSchema = z.object({
  content_id: z.string().regex(/^CNT-\d{4}-\d{4}$/),
  campaign_id: z.string().regex(/^CAM-\d{4}-\d{3}$/),
  title: z.string().min(1),
  objective: z.enum(['O1_认知', 'O2_激活', 'O3_企业信号']),
  funnel_stage: z.enum(['awareness', 'consideration', 'activation', 'team', 'enterprise']),
  persona: z.object({
    role: z.string().min(1),
    maturity: z.string().optional(),
  }),
  job_to_be_done: z.string().min(1),
  user_problem: z.string().min(1),
  core_thesis: z.string().min(1),
  content_hypothesis: z.string().min(1),
  key_claims: z.array(ClaimSchema).min(1),
  counterpoints: z.array(z.string().min(1)).min(1, '反方观点不得为空'),
  canonical_structure: z.object({
    hook: z.string(),
    problem: z.string(),
    mechanism: z.string(),
    example: z.string(),
    limitation: z.string(),
    cta: z.string(),
  }).partial(),
  channel_intents: z.object({
    wechat: z.string(),
    zhihu: z.string(),
    xiaohongshu: z.string(),
    douyin: z.string(),
  }).partial(),
  experiment: z.object({
    variable: z.string(),
    variants: z.array(z.string()).min(2),
  }).optional(),
  success_metrics: z.array(z.string()).min(1),
  risk_level: z.enum(['low', 'medium', 'high']),
  approval_required: z.literal(true),
});

export type ContentIR = z.infer<typeof ContentIRSchema>;

/** 选题采纳阶段的草稿 IR：研究前允许 claims 为空；进入主内容生成前必须通过完整校验 */
export const DraftIRSchema = ContentIRSchema.extend({ key_claims: z.array(ClaimSchema) });

export function validateContentIR(data: unknown): { ok: true; ir: ContentIR } | { ok: false; errors: string[] } {
  const r = ContentIRSchema.safeParse(data);
  if (r.success) return { ok: true, ir: r.data };
  return { ok: false, errors: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
}

export function validateDraftIR(data: unknown): { ok: boolean; errors: string[] } {
  const r = DraftIRSchema.safeParse(data);
  return r.success ? { ok: true, errors: [] } : { ok: false, errors: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
}
