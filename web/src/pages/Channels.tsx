import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ContentDetail, PLATFORM } from '../api';
import { Badge, Btn, Card, Notice, PageHead, Plat } from '../ui';

export default function Channels() {
  const { id } = useParams();
  const [list, setList] = useState<any[]>([]);
  const [c, setC] = useState<ContentDetail | null>(null);
  const [tab, setTab] = useState('wechat');

  useEffect(() => {
    (async () => {
      const contents = await api.get<any[]>('/contents');
      setList(contents);
      const target = id ?? contents.find((x: any) => x.state !== 'IDEA')?.id ?? contents[0]?.id;
      if (target) setC(await api.get<ContentDetail>(`/contents/${target}`));
    })();
  }, [id]);

  if (!c) return <p className="text-soft p-8">加载中…</p>;

  const channelJudge = c.judges.find(j => j.judge === 'channel_quality');
  const v = c.variants.find((x: any) => x.platform === tab);

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="四平台适配" desc="同一条 Content IR 派生的四个平台原生版本——核心主张完全一致，但每个平台都按自己的方式表达，不是同文搬运。">
        <select className="border border-line-strong rounded-sm px-2 py-1.5 text-small bg-surface"
          value={c.id} onChange={e => location.hash = `#/channels/${e.target.value}`}>
          {list.map(x => <option key={x.id} value={x.id}>{x.id} · {x.title}</option>)}
        </select>
      </PageHead>

      <Card>
        <div className="flex border-b border-line px-2">
          {Object.keys(PLATFORM).map(p => {
            const pv = c.variants.find((x: any) => x.platform === p);
            return (
              <button key={p} onClick={() => setTab(p)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] border-b-2 -mb-px ${tab === p ? 'text-primary-ink border-primary font-medium' : 'text-muted border-transparent hover:text-ink'}`}>
                <Plat p={p} />
                {pv ? <Badge kind="green" dot={false}>✓</Badge> : <Badge dot={false}>—</Badge>}
              </button>
            );
          })}
        </div>

        {v ? (
          <div className="p-4 grid gap-3.5" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-meta text-soft mb-1">标题</div>
                <div className="prose-box font-semibold">{v.title}</div>
              </div>
              <div>
                <div className="text-meta text-soft mb-1">正文 / 结构</div>
                <div className="prose-box text-muted">{v.body}</div>
              </div>
              <div>
                <div className="text-meta text-soft mb-1">行动召唤 CTA</div>
                <div className="prose-box text-small">{v.cta}</div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="border border-dashed border-line-strong rounded-sm bg-surface-2 text-soft grid place-items-center text-small h-36">
                封面图占位
              </div>
              <Card className="p-3 bg-surface-2">
                <div className="text-meta font-semibold text-muted">来源追踪</div>
                <div className="text-meta mt-1 break-all font-mono">{v.utm}</div>
              </Card>
              <Card className="p-3 bg-surface-2">
                <div className="text-meta font-semibold text-muted">格式检查（Channel Quality Judge）</div>
                <div className="text-meta mt-1 leading-7">
                  {channelJudge
                    ? channelJudge.findings.map((f: any, i: number) => (
                      <div key={i}>{f.level === 'ok' ? '✓' : f.level === 'warn' ? '⚠' : '✕'} {f.message}</div>
                    ))
                    : '尚未到裁判节点'}
                </div>
              </Card>
              <Badge kind={v.approved ? 'green' : 'neutral'}>{v.approved ? '已批准' : '未批准'}</Badge>
            </div>
          </div>
        ) : (
          <div className="p-10 text-center text-soft">该平台版本尚未生成——到内容工作室推进「平台适配」节点</div>
        )}
      </Card>

      <p className="text-meta text-soft">修改主内容后，这里所有平台版本会标记「需重新适配」· 每个版本独立通过裁判检查后才能进入发布队列</p>
    </div>
  );
}
