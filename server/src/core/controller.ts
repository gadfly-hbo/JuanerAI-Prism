// Content Controller：调度 Agent、推进状态机。自己不写稿、不跳过裁判、不代替人工批准。
import { get, run, tx } from '../db.ts';
import { currentState, transition, fallbackFor, type State } from './stateMachine.ts';
import { validateContentIR, validateDraftIR } from './contentIR.ts';
import {
  runResearchAgent, runCanonicalAgent, runChannelAgent, runCreativeAgent,
} from '../agents/index.ts';
import { runAllJudges } from '../judges/index.ts';

/** 每个状态对应的下一步动作 */
const ADVANCE: Partial<Record<State, { agent: string; act: (id: string) => Promise<void>; to: State }>> = {
  TRIAGED: {
    agent: 'controller',
    async act(id) {
      const c = get(`SELECT ir FROM contents WHERE id = ?`, id);
      const v = validateDraftIR(JSON.parse(c?.ir ?? '{}'));
      if (!v.ok) throw new Error(`Content IR 草稿不合法：\n${v.errors.join('\n')}`);
    },
    to: 'BRIEFED',
  },
  BRIEFED: { agent: 'A2-research', act: async id => { await runResearchAgent(id); }, to: 'RESEARCHED' },
  RESEARCHED: {
    agent: 'A3-canonical',
    async act(id) {
      // 研究完成后、生成主内容前：完整校验 IR（含 claims 与 counterpoints 非空）
      const c = get(`SELECT ir FROM contents WHERE id = ?`, id);
      const v = validateContentIR(JSON.parse(c?.ir ?? '{}'));
      if (!v.ok) throw new Error(`研究后 Content IR 仍不合法：\n${v.errors.join('\n')}`);
      await runCanonicalAgent(id);
    },
    to: 'CANONICAL_DRAFTED',
  },
  CANONICAL_DRAFTED: { agent: 'A4-channel', act: async id => { await runChannelAgent(id); }, to: 'CHANNEL_ADAPTED' },
  CHANNEL_ADAPTED: { agent: 'A5-creative', act: async id => { await runCreativeAgent(id); }, to: 'CREATIVE_READY' },
  CREATIVE_READY: {
    agent: 'judges',
    async act(id) {
      const verdicts = runAllJudges(id);
      const failed = verdicts.find(v => v.verdict === 'fail');
      if (failed) {
        const to = fallbackFor(failed.judge);
        transition(id, to, { reason: `裁判未通过：${failed.judge}` });
        throw new JudgeFailedError(failed.judge, failed.findings.filter(f => f.level === 'fail').map(f => f.message), to);
      }
    },
    to: 'JUDGED',
  },
};

export class JudgeFailedError extends Error {
  judge: string;
  failures: string[];
  fallbackTo: State;
  constructor(judge: string, failures: string[], fallbackTo: State) {
    super(`裁判 ${judge} 未通过：${failures.join('；')}。已打回 ${fallbackTo}`);
    this.judge = judge;
    this.failures = failures;
    this.fallbackTo = fallbackTo;
  }
}

/** 同一内容的推进正在执行中（HTTP 层映射为 409） */
export class ContentBusyError extends Error {
  constructor(contentId: string) {
    super(`内容 ${contentId} 正在执行中，请等待本次推进完成`);
  }
}

/** 进程内互斥：同一内容同时只允许一个 advance 在执行（防重复点击重复烧 LLM 费用）。单进程部署，无需跨进程锁。 */
const advancing = new Set<string>();

/**
 * 推进一个节点。返回 { from, to }；裁判失败时抛出 JudgeFailedError（状态已回退）。
 * JUDGED 之后的前进只能靠人工批准接口，Controller 无权推进。
 */
export async function advance(contentId: string): Promise<{ from: State; to: State }> {
  if (advancing.has(contentId)) throw new ContentBusyError(contentId);
  advancing.add(contentId);
  try {
    const from = currentState(contentId);
    const step = ADVANCE[from];
    if (!step) {
      throw new Error(`状态 ${from} 没有自动推进动作（JUDGED 之后需要人工批准，发布需要人工操作）`);
    }
    await step.act(contentId);
    // 裁判失败时 act 内已回退状态并抛错；走到这里说明 act 成功
    const to = transition(contentId, step.to, { reason: `controller advance by ${step.agent}` });
    return { from, to };
  } finally {
    advancing.delete(contentId);
  }
}

/** 人工批准：写入批准记录并推进到 HUMAN_APPROVED（事务：要么全成功要么全回滚） */
export function approve(contentId: string, note = '', platforms: string[] | null = null, operator = '人类总编') {
  const state = currentState(contentId);
  if (state !== 'JUDGED') throw new Error(`当前状态 ${state} 不能批准（需要先通过裁判检查）`);
  tx(() => {
    run(`INSERT INTO approvals (content_id, decision, platforms, note, operator) VALUES (?, 'approve', ?, ?, ?)`,
      contentId, platforms ? JSON.stringify(platforms) : null, note, operator);
    if (platforms?.length) {
      run(`UPDATE channel_variants SET approved = 1 WHERE content_id = ? AND platform IN (${platforms.map(() => '?').join(',')})`,
        contentId, ...platforms);
    } else {
      run(`UPDATE channel_variants SET approved = 1 WHERE content_id = ?`, contentId);
    }
    transition(contentId, 'HUMAN_APPROVED', { reason: `人工批准 by ${operator}` });
  });
}

/** 人工退回：回到指定节点，记录意见（事务） */
export function reject(contentId: string, note: string, backTo: State = 'CANONICAL_DRAFTED', operator = '人类总编') {
  const state = currentState(contentId);
  if (state !== 'JUDGED' && state !== 'HUMAN_APPROVED') throw new Error(`当前状态 ${state} 不能退回`);
  tx(() => {
    run(`INSERT INTO approvals (content_id, decision, note, operator) VALUES (?, 'reject', ?, ?)`,
      contentId, note, operator);
    transition(contentId, backTo, { reason: `人工退回：${note}` });
  });
}
