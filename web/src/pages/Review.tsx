import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ContentDetail } from '../api';
import { Badge, Btn, Card, Notice, PageHead, Section } from '../ui';

const JUDGE_META: Record<string, { icon: string; name: string; desc: string }> = {
  evidence: { icon: '🔍', name: '事实裁判', desc: '事实是否有来源 · 数据是否过期 · 观点是否冒充事实' },
  brand_compliance: { icon: '🎨', name: '品牌与合规裁判', desc: '品牌定位 · 夸大效果 · 客户授权 · AI 标识 · 平台禁区' },
  channel_quality: { icon: '📐', name: '平台格式裁判', desc: '平台形态 · 标题封面一致性 · 是否像搬运' },
};

export default function Review() {
  const { id } = useParams();
  const [queue, setQueue] = useState<any[]>([]);
  const [c, setC] = useState<ContentDetail | null>(null);

  const load = async () => {
    const [queue, contents] = await Promise.all([
      api.get<any[]>('/review/queue'),
      api.get<any[]>('/contents'),
    ]);
    setQueue(queue);
    const target = id ?? contents.find(x => x.state === 'JUDGED')?.id ?? contents[0]?.id;
    if (target) setC(await api.get<ContentDetail>(`/contents/${target}`));
  };
  useEffect(() => { load(); }, [id]);

  const act = async (fn: () => Promise<any>) => {
    try { await fn(); await load(); } catch (e: any) { alert(e.message); }
  };

  if (!c) return <p className="text-soft p-8">加载中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="审查中心" desc="三个独立裁判（事实、品牌合规、平台格式）已经检查过每一条内容。这里没有「自动通过」——只有你看过、点头，内容才能进入发布队列。" />

      <Notice><span>🛡️</span><div>裁判由独立规则引擎担任，不由写稿 Agent 自评。裁判未通过的内容，Controller 无权跳过，必须回到对应节点重做。</div></Notice>

      <Card>
        <div className="p-4 border-b border-line"><Section title={`等待你批准（${queue.length}）`} sub="批准后可预约发布 · 退回会附带你的意见给对应 Agent" /></div>
        <table className="w-full">
          <thead><tr className="text-small text-soft text-left">
            <th className="px-3.5 py-2 font-medium border-b border-line">内容</th>
            <th className="px-3.5 py-2 font-medium border-b border-line">事实裁判</th>
            <th className="px-3.5 py-2 font-medium border-b border-line">品牌合规裁判</th>
            <th className="px-3.5 py-2 font-medium border-b border-line">平台格式裁判</th>
            <th className="px-3.5 py-2 font-medium border-b border-line">风险</th>
            <th className="px-3.5 py-2 font-medium border-b border-line"></th>
          </tr></thead>
          <tbody>
            {queue.map(q => <QueueRow key={q.id} q={q} active={q.id === c.id} />)}
            {queue.length === 0 && <tr><td colSpan={6} className="px-3.5 py-6 text-center text-soft">没有待批准的内容</td></tr>}
          </tbody>
        </table>
      </Card>

      <Section title={`${c.id}《${c.title}》审查详情`} sub="三个裁判的结构化结论" right={<Link to={`/channels/${c.id}`}><Btn small>查看四平台预览 →</Btn></Link>} />

      <div className="grid grid-cols-3 gap-3.5">
        {(['evidence', 'brand_compliance', 'channel_quality'] as const).map(jk => {
          const j = c.judges.find((x: any) => x.judge === jk);
          const meta = JUDGE_META[jk];
          return (
            <Card key={jk}>
              <div className="p-4 border-b border-line">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{meta.icon} {meta.name}</span>
                  {j ? (
                    <Badge kind={j.verdict === 'pass' ? 'green' : j.verdict === 'warn' ? 'amber' : 'red'}>
                      {j.verdict === 'pass' ? '通过' : j.verdict === 'warn' ? '有提醒' : '未通过'}
                    </Badge>
                  ) : <Badge>未运行</Badge>}
                </div>
                <div className="text-meta text-soft mt-1">{meta.desc}</div>
              </div>
              <div className="p-4 flex flex-col gap-2">
                {(j?.findings ?? []).map((f: any, i: number) => (
                  <Notice key={i} kind={f.level === 'ok' ? 'ok' : f.level === 'warn' ? 'warn' : 'fail'}>
                    <span>{f.level === 'ok' ? '✓' : f.level === 'warn' ? '⚠' : '✕'}</span>
                    <div className="text-small">{f.message}</div>
                  </Notice>
                ))}
                {!j && <span className="text-soft text-small">到「素材就绪」节点后自动运行</span>}
              </div>
            </Card>
          );
        })}
      </div>

      {c.state === 'JUDGED' && (
        <Card className="p-4">
          <Section title="你的决定" sub="批准后：内容进入发布队列；退回：选择退回节点并写明意见，Agent 会重做" />
          <div className="flex gap-2 mt-3 flex-wrap">
            <Btn kind="primary" onClick={() => act(() => api.post(`/contents/${c.id}/approve`, {}))}>✓ 批准全部四个平台</Btn>
            <Btn onClick={() => act(() => api.post(`/contents/${c.id}/approve`, { platforms: ['wechat', 'zhihu', 'xiaohongshu'] }))}>只批准公众号+知乎+小红书</Btn>
            <Btn kind="danger" onClick={() => {
              const note = prompt('退回意见（会交给对应 Agent 重做）');
              if (note) act(() => api.post(`/contents/${c.id}/reject`, { note, back_to: 'CANONICAL_DRAFTED' }));
            }}>↩ 退回修改</Btn>
          </div>
        </Card>
      )}

      {c.state !== 'JUDGED' && (
        <Notice><span>ℹ️</span><div>当前内容状态为「{c.state}」，不在待批准环节。批准记录会永久留痕。</div></Notice>
      )}

      <p className="text-meta text-soft">所有批准与退回都会留痕：操作人、时间、意见、当时的裁判结果快照</p>
    </div>
  );
}

function QueueRow({ q, active }: { q: any; active: boolean }) {
  const badge = (verdict?: string) => {
    if (!verdict) return <Badge>未运行</Badge>;
    return <Badge kind={verdict === 'pass' ? 'green' : verdict === 'warn' ? 'amber' : 'red'}>
      {verdict === 'pass' ? '通过' : verdict === 'warn' ? '提醒' : '未通过'}
    </Badge>;
  };
  return (
    <tr className={`text-[13px] ${active ? 'bg-primary-soft/40' : 'hover:bg-surface-2'}`}>
      <td className="px-3.5 py-2.5 border-b border-line"><span className="font-semibold">{q.id}</span> {q.title}</td>
      <td className="px-3.5 py-2.5 border-b border-line">{badge(q.evidence_verdict)}</td>
      <td className="px-3.5 py-2.5 border-b border-line">{badge(q.brand_verdict)}</td>
      <td className="px-3.5 py-2.5 border-b border-line">{badge(q.channel_verdict)}</td>
      <td className="px-3.5 py-2.5 border-b border-line"><Badge kind={q.risk_level === 'high' ? 'red' : q.risk_level === 'low' ? 'green' : 'amber'}>{q.risk_level}</Badge></td>
      <td className="px-3.5 py-2.5 border-b border-line"><Link to={`/review/${q.id}`} className="text-primary text-small">查看</Link></td>
    </tr>
  );
}
