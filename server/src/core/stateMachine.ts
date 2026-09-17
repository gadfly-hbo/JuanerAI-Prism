// 端到端状态机：规划 §6。人工批准是硬门禁，裁判不通过必须回退。
import { all, get, run, touchContent } from '../db.ts';

export const STATES = [
  'IDEA', 'TRIAGED', 'BRIEFED', 'RESEARCHED', 'CANONICAL_DRAFTED',
  'CHANNEL_ADAPTED', 'CREATIVE_READY', 'JUDGED', 'HUMAN_APPROVED',
  'SCHEDULED', 'PUBLISHED', 'MEASURED_24H', 'MEASURED_72H',
  'MEASURED_7D', 'LEARNED', 'ARCHIVED',
] as const;
export type State = typeof STATES[number];

// 允许的状态转移。前进靠 Controller 逐节点执行；回退只由裁判失败或人工退回触发。
const TRANSITIONS: Record<State, State[]> = {
  IDEA: ['TRIAGED', 'ARCHIVED'],
  TRIAGED: ['BRIEFED', 'ARCHIVED'],
  BRIEFED: ['RESEARCHED', 'ARCHIVED'],
  RESEARCHED: ['CANONICAL_DRAFTED', 'BRIEFED'],
  CANONICAL_DRAFTED: ['CHANNEL_ADAPTED', 'RESEARCHED'],
  CHANNEL_ADAPTED: ['CREATIVE_READY', 'CANONICAL_DRAFTED'],
  CREATIVE_READY: ['JUDGED', 'CHANNEL_ADAPTED', 'CANONICAL_DRAFTED', 'RESEARCHED'],
  JUDGED: ['HUMAN_APPROVED', 'RESEARCHED', 'CANONICAL_DRAFTED', 'CHANNEL_ADAPTED'],
  HUMAN_APPROVED: ['SCHEDULED', 'JUDGED', 'RESEARCHED', 'CANONICAL_DRAFTED', 'CHANNEL_ADAPTED'],
  SCHEDULED: ['PUBLISHED', 'HUMAN_APPROVED'],
  PUBLISHED: ['MEASURED_24H'],
  MEASURED_24H: ['MEASURED_72H'],
  MEASURED_72H: ['MEASURED_7D'],
  MEASURED_7D: ['LEARNED'],
  LEARNED: ['ARCHIVED'],
  ARCHIVED: [],
};

export class TransitionError extends Error {}

export function currentState(contentId: string): State {
  const row = get(`SELECT state FROM contents WHERE id = ?`, contentId);
  if (!row) throw new TransitionError(`内容不存在：${contentId}`);
  return row.state;
}

export function canTransition(from: State, to: State): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 状态转移的唯一入口，强制两条硬规则：
 * 1. 进入 HUMAN_APPROVED：必须在 JUDGED 且无 fail 裁判结果，且本次调用附带 approvals 记录；
 * 2. 进入 PUBLISHED：必须存在有效的 approve 记录。
 */
export function transition(contentId: string, to: State, ctx: { reason?: string } = {}): State {
  const from = currentState(contentId);
  if (!canTransition(from, to)) {
    throw new TransitionError(`不允许的状态转移：${from} → ${to}（${ctx.reason ?? '无说明'}）`);
  }

  if (to === 'HUMAN_APPROVED') {
    const fail = get(
      `SELECT COUNT(*) n FROM judge_results jr
       JOIN (SELECT judge, MAX(id) mid FROM judge_results WHERE content_id = ? GROUP BY judge) t
         ON jr.id = t.mid
       WHERE jr.verdict = 'fail'`, contentId);
    if (fail.n > 0) throw new TransitionError('存在未通过的裁判结论，不能进入待批准');
    const judged = get(`SELECT COUNT(DISTINCT judge) n FROM judge_results WHERE content_id = ?`, contentId);
    if (judged.n < 3) throw new TransitionError('三个裁判尚未全部给出结论');
  }

  // 进入 HUMAN_APPROVED / PUBLISHED 都要求「最新一次人工决定是 approve」
  if (to === 'HUMAN_APPROVED' || to === 'PUBLISHED') {
    const ap = get(
      `SELECT decision FROM approvals WHERE content_id = ? ORDER BY id DESC LIMIT 1`, contentId);
    if (!ap || ap.decision !== 'approve') {
      throw new TransitionError('没有有效的人工批准记录（最新决定不是 approve），不能继续');
    }
  }

  run(`UPDATE contents SET state = ?, updated_at = datetime('now') WHERE id = ?`, to, contentId);
  return to;
}

/** 裁判失败回退：按 rubric 的 fallback_to 回到对应节点 */
export function fallbackFor(judge: string): State {
  if (judge === 'evidence') return 'RESEARCHED';
  if (judge === 'brand_compliance') return 'CANONICAL_DRAFTED';
  return 'CHANNEL_ADAPTED';
}

export function latestJudgeResults(contentId: string) {
  const rows = all(
    `SELECT jr.* FROM judge_results jr
     JOIN (SELECT judge, MAX(id) mid FROM judge_results WHERE content_id = ? GROUP BY judge) t
       ON jr.id = t.mid`, contentId);
  return rows;
}
