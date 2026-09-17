import { useEffect, useState } from 'react';
import { api, PLATFORM } from '../api';
import { Badge, Btn, Notice, PageHead, Plat } from '../ui';

const CATEGORY: Record<string, { label: string; kind: 'violet' | 'blue' | 'teal' | 'amber' | 'red' | 'neutral' }> = {
  enterprise_lead: { label: '企业线索 · 优先', kind: 'violet' },
  team_signal: { label: '团队需求 · 优先', kind: 'blue' },
  product_question: { label: '产品使用问题', kind: 'teal' },
  feature_request: { label: '功能建议', kind: 'amber' },
  objection: { label: '反对意见', kind: 'red' },
  pain_point: { label: '分析痛点', kind: 'amber' },
  spam: { label: '垃圾与风险', kind: 'neutral' },
  uncategorized: { label: '未分类', kind: 'neutral' },
};

export default function Community() {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [draftText, setDraftText] = useState('');

  const load = () => api.get<any[]>('/community').then(setItems);
  useEffect(() => { load(); }, []);

  const reply = async (id: number) => {
    await api.post(`/community/${id}/reply`);
    load();
  };
  const saveDraft = async (id: number) => {
    try {
      await api.patch(`/community/${id}/draft`, { draft_reply: draftText });
      setDrafting(null);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const shown = filter ? items.filter(i => i.category === filter) : items.filter(i => i.status === 'open');
  const cats = [...new Set(items.map(i => i.category))];

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="评论与线索收件箱" desc="各平台评论和私信经 Agent 分类后汇总到这里。Agent 只起草回复，高价值线索（团队需求、企业意向）永远由你亲自处理。" />

      <Notice><span>🤖</span><div>Agent 不会自动回复或私信任何人——它只分类、起草、标记。你点「发送」之前，什么都不会发出去。</div></Notice>

      <div className="flex gap-2 flex-wrap">
        <Btn small={!filter} kind={filter === null ? 'primary' : 'secondary'} onClick={() => setFilter(null)}>待处理（{items.filter(i => i.status === 'open').length}）</Btn>
        {cats.map(c => (
          <Btn key={c} small kind={filter === c ? 'primary' : 'secondary'} onClick={() => setFilter(c)}>
            {CATEGORY[c]?.label ?? c}（{items.filter(i => i.category === c).length}）
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        {shown.map(i => {
          const meta = CATEGORY[i.category] ?? CATEGORY.uncategorized;
          const high = i.priority === 'high';
          return (
            <div key={i.id} className={`border border-line rounded-base bg-surface p-4 ${high ? 'border-l-[3px] border-l-violet' : ''} ${i.status === 'replied' ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                <Badge kind={meta.kind}>{meta.label}</Badge>
                <Plat p={i.platform} />
                <span className="text-meta text-soft ml-auto">{i.created_at}</span>
              </div>
              <p className="text-small mt-2">「{i.body}」</p>
              {i.author && <div className="text-meta text-soft mt-1">来自 {i.author}</div>}
              {i.draft_reply && (
                <div className="prose-box mt-2.5 text-small">
                  <div className="text-meta font-semibold text-muted mb-1">Agent 起草的回复（待你确认）</div>
                  {i.draft_reply}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                {i.status === 'open' && i.draft_reply && (
                  <Btn small kind="primary" onClick={() => reply(i.id)}>✓ 确认发送</Btn>
                )}
                {i.status === 'open' && (drafting !== i.id) && (
                  <Btn small onClick={() => { setDrafting(i.id); setDraftText(i.draft_reply ?? ''); }}>
                    {i.draft_reply ? '改写回复' : '起草回复'}
                  </Btn>
                )}
                {i.status === 'replied' && <Badge kind="green">已回复</Badge>}
              </div>
              {drafting === i.id && (
                <div className="mt-2.5">
                  <textarea className="w-full border border-line-strong rounded-sm p-2.5 text-small leading-relaxed"
                    rows={3} autoFocus value={draftText} onChange={e => setDraftText(e.target.value)}
                    placeholder="写下你要回复的内容（保存后仍需你手动确认发送）" />
                  <div className="flex gap-2 mt-1.5">
                    <Btn small kind="primary" onClick={() => saveDraft(i.id)}>保存草稿</Btn>
                    <Btn small ghost onClick={() => setDrafting(null)}>取消</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div className="col-span-2 text-center text-soft py-10">没有更多内容</div>}
      </div>

      <p className="text-meta text-soft">评论与线索数据只用于内容运营目的 · 用户要求删除时执行删除并留审计记录</p>
    </div>
  );
}
