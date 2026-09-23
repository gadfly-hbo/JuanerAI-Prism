// 假设库/策略库提议确认：Agent 只有提议权，人类确认后才入库（产品硬规则）。
import { get, nextId, run } from '../db.ts';

/** 确认提议：按类型落库；假设类提议携带 topic_id 时写回 hypotheses 以便回链实验 */
export function confirmProposal(id: number | string) {
  const p = get(`SELECT * FROM library_proposals WHERE id = ?`, id);
  if (!p || p.status !== 'pending') throw new Error('提议不存在或已处理');
  const payload = JSON.parse(p.payload);
  if (p.kind === 'hypothesis_new') {
    const hid = nextId('hypotheses', 'HYP', 3);
    run(`INSERT INTO hypotheses (id, statement, audience, platform, metric, topic_id) VALUES (?, ?, ?, ?, ?, ?)`,
      hid, payload.statement, payload.audience ?? null, payload.platform ?? null, payload.metric ?? null, payload.topic_id ?? null);
  } else if (p.kind === 'strategy_promote') {
    const sid = nextId('strategies', 'STR', 3);
    run(`INSERT INTO strategies (id, title, practice, effect, evidence_windows) VALUES (?, ?, ?, ?, ?)`,
      sid, payload.hypothesis, payload.evidence, '待补充量化口径', 3);
    run(`UPDATE hypotheses SET status = 'confirmed', updated_at = datetime('now') WHERE statement = ?`, payload.hypothesis);
  } else if (p.kind === 'hypothesis_update') {
    // 确认一条假设更新提议：把 Agent 的裁决（人工背书后）写回假设库
    const h = get(`SELECT id FROM hypotheses WHERE statement = ?`, payload.hypothesis ?? '');
    if (!h) throw new Error(`假设库中找不到「${payload.hypothesis ?? ''}」，无法更新（可在假设库核对原文后驳回该提议）`);
    const verdict = payload.verdict ?? 'inconclusive';
    if (verdict === 'confirmed' || verdict === 'rejected') {
      const status = verdict === 'rejected' ? 'rejected' : 'confirmed';
      const col = verdict === 'rejected' ? 'oppose' : 'support';
      run(`UPDATE hypotheses SET status = ?, ${col} = ${col} + 1, updated_at = datetime('now') WHERE id = ?`, status, h.id);
    } else {
      // 无从裁决：只改状态，不计入支持/反对票
      run(`UPDATE hypotheses SET status = 'inconclusive', updated_at = datetime('now') WHERE id = ?`, h.id);
    }
  }
  run(`UPDATE library_proposals SET status = 'confirmed' WHERE id = ?`, p.id);
  return { ok: true };
}
