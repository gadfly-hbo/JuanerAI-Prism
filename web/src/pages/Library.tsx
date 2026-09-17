import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Btn, Card, Notice, PageHead, Section } from '../ui';

const HYP_STATUS: Record<string, { label: string; kind: 'green' | 'red' | 'amber' | 'neutral' }> = {
  confirmed: { label: '已成立', kind: 'green' },
  rejected: { label: '已否决', kind: 'red' },
  testing: { label: '验证中', kind: 'amber' },
  inconclusive: { label: '尚无结论', kind: 'neutral' },
};

export default function Library() {
  const [hyps, setHyps] = useState<any[]>([]);
  const [strs, setStrs] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);

  const load = async () => {
    setHyps(await api.get<any[]>('/hypotheses'));
    setStrs(await api.get<any[]>('/strategies'));
    setProposals(await api.get<any[]>('/library/proposals'));
  };
  useEffect(() => { load(); }, []);

  const decide = async (id: number, action: 'confirm' | 'dismiss') => {
    await api.post(`/library/proposals/${id}/${action}`);
    load();
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="假设与策略库" desc="工作台的记忆与经验。假设库记录「我们正在验证什么判断」，策略库记录「已经验证、可以复用的做法」。爆款不是知识，被重复验证的适用条件才是。" />

      <Notice><span>🔒</span><div>Agent 只能<strong>提议</strong>更新两库——每条记录的成立、否决或修改，都必须经你确认后才真正生效。</div></Notice>

      {proposals.length > 0 && (
        <Card>
          <div className="p-4 border-b border-line"><Section title={`Agent 提议的库更新（${proposals.length}）`} sub="你确认后才生效" /></div>
          <div className="p-4 flex flex-col gap-3">
            {proposals.map(p => (
              <div key={p.id} className="flex items-center justify-between border border-line rounded-base p-3.5">
                <div>
                  <div className="text-small font-semibold">
                    {p.kind === 'strategy_promote' ? `建议将「${p.payload.hypothesis}」从假设升级为策略`
                      : p.kind === 'hypothesis_new' ? `建议新增假设：「${p.payload.statement}」`
                      : `建议更新假设：「${p.payload.hypothesis ?? p.payload.statement ?? ''}」`}
                  </div>
                  <div className="text-meta text-muted mt-1">依据：{p.payload.evidence ?? p.payload.suggested_experiment ?? '—'}</div>
                </div>
                <div className="flex gap-2 flex-none">
                  <Btn small kind="primary" onClick={() => decide(p.id, 'confirm')}>确认</Btn>
                  <Btn small ghost onClick={() => decide(p.id, 'dismiss')}>暂不</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b border-line"><Section title="内容假设库" sub="对受众、问题和传播机制的判断，及其当前证据状态" /></div>
        <table className="w-full">
          <thead><tr className="text-small text-soft text-left">
            {['假设', '适用受众 / 平台', '关键指标', '证据', '状态'].map(h => (
              <th key={h} className="px-3.5 py-2 font-medium border-b border-line">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {hyps.map(h => (
              <tr key={h.id} className="text-[13px] hover:bg-surface-2">
                <td className="px-3.5 py-2.5 border-b border-line max-w-[280px]"><span className="font-semibold">{h.statement}</span></td>
                <td className="px-3.5 py-2.5 border-b border-line text-muted">{h.audience}<br />{h.platform}</td>
                <td className="px-3.5 py-2.5 border-b border-line">{h.metric}</td>
                <td className="px-3.5 py-2.5 border-b border-line text-muted">支持 {h.support} · 反对 {h.oppose}</td>
                <td className="px-3.5 py-2.5 border-b border-line"><Badge kind={HYP_STATUS[h.status]?.kind}>{HYP_STATUS[h.status]?.label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Section title="内容策略库（已验证做法）" sub="格式：在什么受众、什么平台、什么目标下，哪种做法更有效" />
      <div className="grid grid-cols-2 gap-3.5">
        {strs.map(s => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between">
              <Badge kind="teal" dot={false}>策略 {s.id}</Badge>
              <span className="text-meta text-soft">证据窗口 ×{s.evidence_windows}</span>
            </div>
            <div className="text-small font-semibold mt-2">{s.title}</div>
            <dl className="grid gap-x-3 gap-y-1 mt-2.5 text-small" style={{ gridTemplateColumns: '76px 1fr' }}>
              <dt className="text-soft">适用条件</dt><dd>{s.conditions}</dd>
              <dt className="text-soft">做法</dt><dd>{s.practice}</dd>
              <dt className="text-soft">效果</dt><dd>{s.effect}</dd>
              <dt className="text-soft">失效条件</dt><dd>{s.failure_condition}</dd>
            </dl>
          </Card>
        ))}
      </div>

      <p className="text-meta text-soft">两库与 JuanerAI 的假设库 / 策略库同源同构 · 这里是内容运营领域的实例</p>
    </div>
  );
}
