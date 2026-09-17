import { useEffect, useState } from 'react';
import { api, PLATFORM } from '../api';
import { Badge, Btn, Card, Notice, PageHead, Plat, Section } from '../ui';

export default function Calendar() {
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);

  const load = async () => {
    setPkgs(await api.get<any[]>('/calendar'));
    const contents = await api.get<any[]>('/contents');
    setApproved(contents.filter(c => c.state === 'HUMAN_APPROVED'));
  };
  useEffect(() => { load(); }, []);

  // 当月月历
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一开头
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const itemsByDay: Record<number, any[]> = {};
  for (const p of pkgs) {
    if (!p.scheduled_at) continue;
    const d = new Date(p.scheduled_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      (itemsByDay[d.getDate()] ??= []).push(p);
    }
  }

  const exportPkg = async (contentId: string) => {
    try {
      const r = await api.post<{ exported: any[] }>(`/contents/${contentId}/export`, {});
      alert(`已导出 ${r.exported.length} 个平台发布包`);
      load();
    } catch (e: any) { alert(e.message); }
  };
  const schedule = async (contentId: string, platform: string) => {
    const when = prompt('预约时间（YYYY-MM-DD HH:mm）', '2026-09-18 10:00');
    if (!when) return;
    await api.post(`/contents/${contentId}/schedule`, { platform, scheduled_at: when });
    load();
  };
  const markPublished = async (contentId: string, platform: string) => {
    await api.post(`/contents/${contentId}/published`, { platform });
    load();
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="日历与发布" desc="统一的发布节奏视图：哪天发什么、发到哪个平台、发布包准备好了没有。系统只做准备和提醒，最终点击发布的永远是你。" />

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'minmax(0,1.8fr) minmax(0,1fr)' }}>
        <Card className="p-4">
          <Section title={`${year} 年 ${month + 1} 月`} sub="同一主题的四平台版本错开 1-3 天发布，避免自我抢量" />
          <div className="grid grid-cols-7 gap-1.5 mt-3">
            {['一', '二', '三', '四', '五', '六', '日'].map(d => (
              <div key={d} className="text-small text-soft text-center py-1">{d}</div>
            ))}
            {cells.map((d, i) => (
              <div key={i} className={`min-h-[92px] border rounded-sm p-1.5 ${d ? 'bg-surface border-line' : 'bg-surface-2 border-line'} ${d === now.getDate() ? 'border-primary' : ''}`}>
                {d && <div className={`text-small ${d === now.getDate() ? 'text-primary font-bold' : 'text-soft'}`}>{d}{d === now.getDate() ? ' · 今天' : ''}</div>}
                {(d && itemsByDay[d] ? itemsByDay[d] : []).map((p, j) => (
                  <div key={j} className="mt-1 text-meta leading-snug px-1.5 py-0.5 rounded truncate"
                    style={{ background: `${PLATFORM[p.platform]?.color}18`, color: PLATFORM[p.platform]?.color }}>
                    {PLATFORM[p.platform]?.name} · {p.content_title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-3.5 min-w-0">
          <Card>
            <div className="p-4 border-b border-line"><Section title="发布队列" sub="发布包 = 标题/正文/封面/标签/CTA/追踪码 全套素材" /></div>
            <div className="p-4 flex flex-col gap-3">
              {pkgs.map(p => (
                <div key={p.id} className="border border-line rounded-base p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-small"><Plat p={p.platform} /> <strong>{p.scheduled_at ?? '未预约'}</strong></span>
                    <Badge kind={p.status === 'published' ? 'green' : p.status === 'scheduled' ? 'blue' : 'neutral'}>
                      {p.status === 'published' ? '已发布' : p.status === 'scheduled' ? '已预约' : '已导出'}
                    </Badge>
                  </div>
                  <div className="text-small mt-1.5">{p.content_title}</div>
                  <div className="flex gap-2 mt-2">
                    {p.status === 'exported' && <Btn small onClick={() => schedule(p.content_id, p.platform)}>预约发布</Btn>}
                    {p.status === 'scheduled' && <Btn small kind="primary" onClick={() => markPublished(p.content_id, p.platform)}>我已手动发布，标记完成</Btn>}
                    <span className="text-meta text-soft self-center break-all">{p.path}</span>
                  </div>
                </div>
              ))}
              {approved.map(ct => (
                <div key={ct.id} className="border border-line rounded-base p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-small font-semibold">{ct.id} {ct.title}</span>
                    <Badge kind="green">已批准</Badge>
                  </div>
                  <div className="mt-2"><Btn small kind="primary" onClick={() => exportPkg(ct.id)}>⬇ 导出发布包</Btn></div>
                </div>
              ))}
              {pkgs.length === 0 && approved.length === 0 && (
                <div className="text-center text-soft py-6">队列为空——内容经审查中心批准后可在此导出发布包</div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <Section title="发布边界（安全承诺）" />
            <div className="mt-2.5 flex flex-col gap-2 text-small text-muted">
              <div className="flex gap-2"><span className="text-green">✓</span>系统自动：准备素材、生成草稿、提醒你</div>
              <div className="flex gap-2"><span className="text-green">✓</span>你手动：最终检查、点击发布</div>
              <div className="flex gap-2"><span className="text-red">✕</span>系统绝不：模拟登录、批量操作、无人值守发布</div>
            </div>
          </Card>
        </div>
      </div>

      <p className="text-meta text-soft">发布失败不自动重试，会通知你处理 · 每次发布保留操作者与授权记录</p>
    </div>
  );
}
