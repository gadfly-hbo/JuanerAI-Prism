import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Badge, Btn, Card, Notice, PageHead } from '../ui';

const METRIC_LABEL: Record<string, string> = {
  reads: '有效阅读', product_page: '产品页访问', download: '下载',
  activated: '激活', completion_rate: '完播率', impressions: '曝光',
};

function fmtMetrics(m: Record<string, any> | undefined): string {
  if (!m) return '—';
  return Object.entries(m)
    .map(([k, v]) => `${METRIC_LABEL[k] ?? k} ${typeof v === 'number' && v < 1 ? `${Math.round(v * 100)}%` : `${v}+`}`)
    .join(' · ');
}

export default function Topics() {
  const [topics, setTopics] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ title: '', campaign_id: '', strategy: 'S1 痛点切入', user_problem: '' });
  const nav = useNavigate();

  const load = () => api.get<any[]>('/topics').then(setTopics).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    api.get<any[]>('/overview').then(o => setCampaigns(o.campaigns)).catch(() => {});
  }, []);

  const addTopic = async () => {
    if (!draft.title.trim() || !draft.campaign_id) return;
    try {
      await api.post('/topics', { title: draft.title.trim(), payload: { ...draft } });
      setShowAdd(false);
      setDraft({ title: '', campaign_id: '', strategy: 'S1 痛点切入', user_problem: '' });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const adopt = async (id: string) => {
    try {
      const r = await api.post<{ content_id: string }>(`/topics/${id}/adopt`, {});
      nav(`/studio/${r.content_id}`);
    } catch (e: any) { alert(e.message); }
  };
  const shelve = async (id: string) => { await api.post(`/topics/${id}/shelve`); load(); };

  // 信号汇总：从各选题的来源标签聚合（如「搜索问题 ×14」）
  const signalTotals: Record<string, number> = {};
  for (const t of topics) {
    for (const s of t.payload?.sources ?? []) {
      const m = String(s).match(/^(.+?)\s*×(\d+)$/);
      if (m) signalTotals[m[1]] = (signalTotals[m[1]] ?? 0) + Number(m[2]);
    }
  }
  const SIGNAL_ORDER = ['用户评论', '产品反馈', '搜索问题', '版本更新', '行业事件'];
  const hasSignals = Object.keys(signalTotals).length > 0;

  const strategies = [...new Set(topics.map(t => t.payload?.strategy).filter(Boolean))] as string[];
  const shown = filter
    ? topics.filter(t => t.payload?.strategy === filter)
    : [...topics].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="选题雷达" desc="Agent 每天从用户评论、产品反馈、搜索问题、版本更新和历史表现中汇总「值得做的选题」，并说明为什么值得做。你只做一件事：采纳，或搁置。">
        <Btn kind="primary" onClick={() => setShowAdd(!showAdd)}>＋ 手动添加选题</Btn>
      </PageHead>

      {err && <Notice kind="warn">{err}</Notice>}

      {showAdd && (
        <Card className="p-4">
          <div className="text-section-title">手动添加选题</div>
          <div className="text-small text-soft mt-0.5">必填：标题与所属活动；其余字段可在采纳后由 Research Agent 补齐</div>
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1.4fr' }}>
            <label className="flex flex-col gap-1">
              <span className="text-small text-muted">选题标题 *</span>
              <input autoFocus className="border border-line-strong rounded-sm px-2.5 py-1.5 text-[13px]"
                placeholder="例：销售下降该怎么复盘"
                value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-small text-muted">所属活动 *</span>
              <select className="border border-line-strong rounded-sm px-2.5 py-1.5 text-[13px] bg-surface"
                value={draft.campaign_id} onChange={e => setDraft({ ...draft, campaign_id: e.target.value })}>
                <option value="">请选择…</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-small text-muted">服务策略</span>
              <select className="border border-line-strong rounded-sm px-2.5 py-1.5 text-[13px] bg-surface"
                value={draft.strategy} onChange={e => setDraft({ ...draft, strategy: e.target.value })}>
                {['S1 痛点切入', 'S2 实战证明', 'S3 方法建信任', 'S4 公开构建'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-small text-muted">核心问题（可选）</span>
              <input className="border border-line-strong rounded-sm px-2.5 py-1.5 text-[13px]"
                value={draft.user_problem} onChange={e => setDraft({ ...draft, user_problem: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <Btn kind="primary" small onClick={addTopic} disabled={!draft.title.trim() || !draft.campaign_id}>✓ 加入候选</Btn>
            <Btn small ghost onClick={() => setShowAdd(false)}>取消</Btn>
          </div>
        </Card>
      )}

      {hasSignals && (
        <div className="grid grid-cols-6 gap-3.5">
          {SIGNAL_ORDER.map(k => (
            <Card key={k} className="px-4 py-3">
              <div className="text-small text-muted">{k}</div>
              <div className="text-[19px] font-semibold num mt-0.5">{signalTotals[k] ?? 0}</div>
            </Card>
          ))}
          <Card className="px-4 py-3">
            <div className="text-small text-muted">历史内容表现</div>
            <div className="text-[19px] font-semibold num mt-0.5">—</div>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-small text-muted">筛选：</span>
        <Btn small kind={filter === null ? 'primary' : 'secondary'} onClick={() => setFilter(null)}>
          全部候选（{topics.length}）
        </Btn>
        {strategies.map(s => (
          <Btn key={s} small kind={filter === s ? 'primary' : 'secondary'} onClick={() => setFilter(s)}>
            {s}（{topics.filter(t => t.payload?.strategy === s).length}）
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        {shown.map(t => {
          const p = t.payload ?? {};
          const pending = t.status === 'pending';
          return (
            <div key={t.id} className={`border border-line rounded-base bg-surface p-4 ${pending ? '' : 'opacity-70'}`}>
              <div className="flex items-center justify-between">
                <Badge kind={pending ? 'amber' : t.status === 'adopted' ? 'green' : 'neutral'}>
                  {pending ? '待决策' : t.status === 'adopted' ? '已采纳' : '已搁置'}
                </Badge>
                <span className="text-meta text-soft">来自：{(p.sources ?? []).join(' · ') || '手动添加'}</span>
              </div>
              <h3 className="mt-2 text-[14.5px] font-semibold">{t.title}</h3>
              <dl className="grid gap-x-3 gap-y-1 mt-2.5 text-[13px]" style={{ gridTemplateColumns: '88px 1fr' }}>
                {p.strategy && (
                  <>
                    <dt className="text-soft">服务策略</dt>
                    <dd className="flex gap-1.5">
                      <span className="text-meta bg-surface-3 rounded px-1.5 py-0.5 text-muted">{p.strategy}</span>
                      {p.objective && <span className="text-meta bg-surface-3 rounded px-1.5 py-0.5 text-muted">{p.objective}</span>}
                    </dd>
                  </>
                )}
                {p.persona && <><dt className="text-soft">目标人群</dt><dd>{p.persona}</dd></>}
                {p.user_problem && <><dt className="text-soft">核心问题</dt><dd>{p.user_problem}</dd></>}
                {p.suggested_thesis && <><dt className="text-soft">建议观点</dt><dd>{p.suggested_thesis}</dd></>}
                {p.formats && <><dt className="text-soft">建议格式</dt><dd>{p.formats.join(' + ')}</dd></>}
                {p.expected_metrics && <><dt className="text-soft">预期指标</dt><dd>{fmtMetrics(p.expected_metrics)}</dd></>}
                {p.cost && <><dt className="text-soft">成本 / 风险</dt><dd>成本 {p.cost} · 风险 {p.risk}</dd></>}
                {t.status === 'shelved' && p.shelve_reason && <><dt className="text-soft">搁置原因</dt><dd>{p.shelve_reason}</dd></>}
              </dl>
              {p.rationale && (
                <div className="mt-2.5"><Notice kind="ok"><span>🔎</span><div><strong>为什么值得做：</strong>{p.rationale}</div></Notice></div>
              )}
              {pending && (
                <div className="flex gap-2 mt-3">
                  <Btn kind="primary" small onClick={() => adopt(t.id)}>✓ 采纳，进入研究</Btn>
                  <Btn small ghost onClick={() => shelve(t.id)}>搁置</Btn>
                </div>
              )}
            </div>
          );
        })}
        {topics.length === 0 && !err && (
          <Card className="p-8 text-center text-soft col-span-2">暂无选题候选——到战略驾驶舱让 Strategy Agent 生成一批</Card>
        )}
      </div>
      <p className="text-meta text-soft">选题由 Strategy & Audience Agent 生成候选，人类总编保留最终决定权 · 已采纳的选题自动进入内容工作室</p>
    </div>
  );
}
