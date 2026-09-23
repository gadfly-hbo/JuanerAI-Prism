import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ContentDetail, PLATFORM, PIPELINE_LABEL, PIPELINE_STEPS, STATE_LABEL } from '../api';
import { Badge, Btn, Card, Notice, PageHead, Plat, Section } from '../ui';

const CLAIM_KIND: Record<string, { label: string; cls: string }> = {
  fact: { label: '事实', cls: 'bg-teal-soft text-teal' },
  product_capability: { label: '产品能力', cls: 'bg-primary-soft text-primary-ink' },
  inference: { label: '分析推断', cls: 'bg-amber-soft text-amber' },
  opinion: { label: '品牌观点', cls: 'bg-violet-soft text-violet' },
};

const CANONICAL_LABELS: [string, string][] = [
  ['hook', '① 钩子 HOOK'], ['problem', '② 问题 PROBLEM'], ['mechanism', '③ 机制 MECHANISM'],
  ['example', '④ 案例 EXAMPLE'], ['limitation', '⑤ 限制 LIMITATION'], ['cta', '⑥ 行动 CTA'],
];

const COMPARE_STATS: [string, string][] = [
  ['reads', '阅读'], ['product_page', '产品页'], ['first_analysis', '首次分析'],
];
const COMPARE_METRIC_LABEL: Record<string, string> = { first_analysis: '首次分析', reads: '阅读' };

function stateBadgeKind(state: string): 'green' | 'amber' | 'blue' {
  if (['PUBLISHED', 'MEASURED_24H', 'MEASURED_72H', 'MEASURED_7D', 'LEARNED', 'ARCHIVED'].includes(state)) return 'green';
  if (['JUDGED', 'HUMAN_APPROVED', 'SCHEDULED'].includes(state)) return 'amber';
  return 'blue';
}

/** 同选题实验对照（原型 prototype/variant-compare.html 已确认）：变体卡 × 累计指标 + 领先摘要 + 结论提议 */
function VariantCompare({ topicId, currentId }: { topicId: string; currentId: string }) {
  const [data, setData] = useState<any>(null);
  const [conclusion, setConclusion] = useState('');
  useEffect(() => {
    setConclusion('');
    api.get<any>(`/topics/${topicId}/variants`).then(setData).catch(() => {});
  }, [topicId]);
  if (!data || data.variants.length === 0) return null;

  const hasData = data.variants.some((v: any) => Object.keys(v.totals ?? {}).length > 0);
  const topLabel = data.summary?.[0]?.leader?.variant;

  const propose = async () => {
    try {
      const r = await api.post<{ conclusion: string }>(`/topics/${topicId}/conclusion-proposal`);
      setConclusion(r.conclusion);
    } catch (e: any) { alert(e.message); }
  };

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center justify-between gap-3">
        <Section title="实验对照" sub={`同选题《${data.topic.title}》的 ${data.variants.length} 个变体 · 累计数据，发布后在「增长分析」导入 CSV 更新`} />
        {hasData && <Btn small onClick={propose}>提议实验结论</Btn>}
      </div>
      <div className="p-4">
        {!hasData ? (
          <Notice kind="warn"><span>📥</span><div>这组变体还没有指标数据。发布后去「增长分析」导入平台后台导出的 CSV（按 UTM 自动关联），这里就会出现对照。</div></Notice>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(data.variants.length, 3)}, 1fr)` }}>
              {data.variants.map((v: any) => (
                <div key={v.content_id} className={`border rounded-base p-3.5 ${v.content_id === currentId ? 'border-primary' : 'border-line'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-meta bg-surface-3 rounded px-1.5 py-0.5 text-muted whitespace-nowrap">
                      变体 {v.variant_label}{v.variant_label === topLabel ? ' · 领先' : ''}
                    </span>
                    <Badge kind={stateBadgeKind(v.state)}>{STATE_LABEL[v.state] ?? v.state}</Badge>
                  </div>
                  <div className="text-small mt-2"><strong>假设：</strong>{v.hypothesis || '—'}</div>
                  <div className="text-meta text-soft mt-0.5">{v.content_id}</div>
                  {Object.keys(v.platforms ?? {}).length > 0 && (
                    <div className="flex gap-3 mt-1.5 text-meta">
                      {Object.keys(v.platforms).map(p => <Plat key={p} p={p} />)}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 mt-2.5">
                    {COMPARE_STATS.map(([k, label]) => (
                      <div key={k}>
                        <div className="text-meta text-soft">{label}</div>
                        <div className="text-[19px] font-semibold num">{(v.totals?.[k] ?? 0).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {(data.summary ?? []).length > 0 && (
              <div className="mt-3">
                <Notice>
                  <span>🏁</span>
                  <div>
                    <strong>领先摘要：</strong>
                    {data.summary.map((s: any) => {
                      const m = COMPARE_METRIC_LABEL[s.metric] ?? s.metric;
                      const base = `「${m}」变体 ${s.leader.variant}（${PLATFORM[s.leader.platform]?.name ?? s.leader.platform}）${s.leader.value.toLocaleString()} 次`;
                      return s.runner_up && s.lead_pct !== null ? `${base}，比变体 ${s.runner_up.variant} 高 ${s.lead_pct}%` : base;
                    }).join('；')}。
                  </div>
                </Notice>
              </div>
            )}
          </>
        )}
        {conclusion && (
          <div className="mt-3">
            <Notice kind="ok">
              <span>✅</span>
              <div>
                实验结论已生成并进入「假设与策略库」待确认列表：<strong>{conclusion}</strong>
                <Link to="/library" className="ml-1 underline">去确认 →</Link>
              </div>
            </Notice>
          </div>
        )}
        <div className="text-meta text-soft mt-2">结论提议基于上面的真实数字；你确认后才会写入假设库，Agent 不直接修改两库。</div>
      </div>
    </Card>
  );
}

function Pipeline({ state }: { state: string }) {  // TRIAGED/BRIEFED 属于选题立项期，MEASURED_* 属于已发布观察期，ARCHIVED 视为全程完成
  const ALIAS: Record<string, number> = { TRIAGED: 0, BRIEFED: 0, MEASURED_24H: 7, MEASURED_72H: 7, MEASURED_7D: 7, ARCHIVED: 9 };
  const idx = state in ALIAS ? ALIAS[state] : PIPELINE_STEPS.indexOf(state);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-small text-soft">内容流水线状态</span>
        <Badge kind={state === 'JUDGED' ? 'amber' : state === 'PUBLISHED' || state === 'LEARNED' ? 'green' : 'blue'}>
          当前：{STATE_LABEL[state] ?? state}
        </Badge>
      </div>
      <div className="spectrum-bar mt-2.5" />
      <div className="flex items-center mt-2.5 overflow-x-auto">
        {PIPELINE_STEPS.map((s, i) => {
          const done = i < idx, now = i === idx;
          return (
            <div key={s} className="flex items-center flex-none">
              <div className="flex items-center gap-1.5">
                <div className={`w-[22px] h-[22px] rounded-full grid place-items-center text-meta border ${done ? 'bg-primary border-primary text-white' : now ? 'bg-white border-2 border-primary text-primary font-bold' : 'bg-surface-3 border-line text-soft'}`}>
                  {done ? '✓' : i + 1}
                </div>
                <span className={`text-small whitespace-nowrap ${now ? 'text-primary-ink font-semibold' : done ? 'text-muted' : 'text-soft'}`}>{PIPELINE_LABEL[s]}</span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && <div className={`w-6 h-0.5 mx-2 ${i < idx ? 'bg-primary' : 'bg-line'}`} />}
            </div>
          );
        })}
      </div>
      <div className="text-meta text-soft mt-2">白光束入，光谱析出——一条主内容（Content IR）派生四个平台原生版本，任何一步未通过都会被打回对应节点重做。</div>
    </Card>
  );
}

export default function Studio() {
  const { id } = useParams();
  const nav = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [c, setC] = useState<ContentDetail | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (cid?: string) => {
    try {
      const contents = await api.get<any[]>('/contents');
      setList(contents);
      const target = cid ?? id ?? contents[0]?.id;
      if (target) setC(await api.get<ContentDetail>(`/contents/${target}`));
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [id]);

  const advance = async () => {
    if (!c) return;
    setBusy(true);
    try { await api.post(`/contents/${c.id}/advance`); await load(c.id); }
    catch (e: any) { alert(e.message); await load(c.id); }
    finally { setBusy(false); }
  };

  const saveCanonical = async () => {
    if (!c || editing === null) return;
    const next = { ...(c.canonical ?? {}), [editing]: draft };
    await api.put(`/contents/${c.id}/canonical`, next);
    setEditing(null);
    load(c.id);
  };

  const canAdvance = c && !['JUDGED', 'HUMAN_APPROVED', 'SCHEDULED', 'PUBLISHED', 'MEASURED_24H', 'MEASURED_72H', 'MEASURED_7D', 'LEARNED', 'ARCHIVED'].includes(c.state);

  if (err) return <Notice kind="warn">{err}</Notice>;
  if (!c) return <p className="text-soft p-8">加载中…（若无内容，请先在选题雷达采纳选题）</p>;

  const ir = c.ir ?? {};

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="内容工作室" desc="一条内容从选题到发布的完整生命周期的家。Agent 在这里研究、写稿、接受检查；你在这里批注、修改、决定它能不能往下走。">
        {canAdvance && <Btn kind="primary" onClick={advance} disabled={busy}>{busy ? '执行中…' : '▶ 推进下一节点'}</Btn>}
        {c.state === 'JUDGED' && <Link to={`/review/${c.id}`}><Btn kind="primary">前往审查中心 →</Btn></Link>}
      </PageHead>

      <Card className="p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[13px] min-w-0">
          <span className="text-meta text-soft flex-none">当前内容</span>
          <strong className="flex-none">{c.id}</strong>
          <span className="truncate">{c.title}</span>
          <span className="text-meta bg-surface-3 rounded px-1.5 py-0.5 text-muted flex-none">{c.campaign_id}</span>
        </div>
        <select className="border border-line-strong rounded-sm px-2 py-1 text-small bg-surface" value={c.id}
          onChange={e => nav(`/studio/${e.target.value}`)}>
          {list.map(x => <option key={x.id} value={x.id}>{x.id} · {x.title}</option>)}
        </select>
      </Card>

      <Pipeline state={c.state} />

      {c.topic_id && <VariantCompare topicId={c.topic_id} currentId={c.id} />}

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'minmax(0,1.9fr) minmax(0,1fr)' }}>
        <div className="flex flex-col gap-3.5 min-w-0">
          <Card>
            <div className="p-4 border-b border-line"><Section title="内容简报 Brief" /></div>
            <div className="p-4">
              <dl className="grid gap-x-3 gap-y-1.5 text-[13px]" style={{ gridTemplateColumns: '88px 1fr' }}>
                <dt className="text-soft">漏斗阶段</dt><dd><Badge kind="blue" dot={false}>{ir.funnel_stage}</Badge></dd>
                <dt className="text-soft">目标人群</dt><dd>{ir.persona?.role}</dd>
                <dt className="text-soft">要解决的问题</dt><dd>{ir.user_problem}</dd>
                <dt className="text-soft">核心观点</dt><dd>{ir.core_thesis}</dd>
                <dt className="text-soft">内容假设</dt><dd>{ir.content_hypothesis}</dd>
                <dt className="text-soft">行动召唤</dt><dd>{ir.canonical_structure?.cta ?? c.canonical?.cta ?? '—'}</dd>
              </dl>
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b border-line flex items-center justify-between">
              <Section title="核心主张与证据" sub="每条主张都有类型和证据来源，四类内容绝不混淆" />
              <div className="flex gap-1.5 text-meta">
                {Object.values(CLAIM_KIND).map(k => <span key={k.label} className={`px-1.5 py-0.5 rounded ${k.cls}`}>{k.label}</span>)}
              </div>
            </div>
            <table className="w-full">
              <thead><tr className="text-small text-soft text-left">
                <th className="px-3.5 py-2 font-medium border-b border-line w-[90px]">类型</th>
                <th className="px-3.5 py-2 font-medium border-b border-line">主张</th>
                <th className="px-3.5 py-2 font-medium border-b border-line">证据来源</th>
                <th className="px-3.5 py-2 font-medium border-b border-line">状态</th>
              </tr></thead>
              <tbody>
                {(ir.key_claims ?? []).map((cl: any) => (
                  <tr key={cl.claim_id} className="text-[13px]">
                    <td className="px-3.5 py-2.5 border-b border-line"><span className={`px-1.5 py-0.5 rounded text-meta ${CLAIM_KIND[cl.claim_type]?.cls}`}>{CLAIM_KIND[cl.claim_type]?.label}</span></td>
                    <td className="px-3.5 py-2.5 border-b border-line">{cl.statement}</td>
                    <td className="px-3.5 py-2.5 border-b border-line text-muted text-small">{cl.claim_id} · {cl.evidence_ref ?? '—'}</td>
                    <td className="px-3.5 py-2.5 border-b border-line">
                      <Badge kind={cl.status === 'verified' ? 'green' : cl.status === 'rejected' ? 'red' : 'amber'}>
                        {cl.status === 'verified' ? '已核实' : cl.status === 'rejected' ? '已否决' : '待复核'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {(ir.key_claims ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3.5 py-6 text-center text-soft">等待 Research Agent 填充证据</td></tr>
                )}
              </tbody>
            </table>
            <div className="p-4 border-t border-line">
              <div className="text-small font-semibold">反方观点与限制（必须保留，不得删除）</div>
              <div className="prose-box mt-2 text-muted text-small">{(ir.counterpoints ?? []).join('\n') || '待补充'}</div>
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b border-line flex items-center justify-between">
              <Section title="主内容（Canonical）" sub="唯一事实源：所有平台版本都由它派生" />
              <span className="text-meta bg-surface-3 rounded px-1.5 py-0.5 text-muted">人工修改 {c.human_edits} 处</span>
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {CANONICAL_LABELS.map(([key, label]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-meta text-soft">{label}</span>
                    {editing !== key && <Btn small ghost onClick={() => { setEditing(key); setDraft(c.canonical?.[key] ?? ''); }}>编辑</Btn>}
                  </div>
                  {editing === key ? (
                    <div>
                      <textarea className="w-full border border-line-strong rounded-sm p-3 text-[13.5px] leading-relaxed" rows={4}
                        value={draft} onChange={e => setDraft(e.target.value)} />
                      <div className="flex gap-2 mt-1.5">
                        <Btn small kind="primary" onClick={saveCanonical}>保存（计入人工修改）</Btn>
                        <Btn small ghost onClick={() => setEditing(null)}>取消</Btn>
                      </div>
                    </div>
                  ) : (
                    <div className="prose-box">{c.canonical?.[key] || <span className="text-soft">待 Canonical Agent 生成</span>}</div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3.5 min-w-0">
          <Card className="p-4">
            <Section title="Content IR 元信息" />
            <dl className="grid gap-x-3 gap-y-1.5 mt-2.5 text-small" style={{ gridTemplateColumns: '76px 1fr' }}>
              <dt className="text-soft">内容 ID</dt><dd>{c.id}</dd>
              <dt className="text-soft">风险等级</dt><dd><Badge kind={c.risk_level === 'high' ? 'red' : c.risk_level === 'low' ? 'green' : 'amber'}>{c.risk_level === 'high' ? '高' : c.risk_level === 'low' ? '低' : '中'}</Badge></dd>
              <dt className="text-soft">需要批准</dt><dd>是（所有内容都需要）</dd>
              {ir.experiment && <><dt className="text-soft">实验变量</dt><dd>{ir.experiment.variable}：{ir.experiment.variants?.join(' / ')}</dd></>}
              <dt className="text-soft">成功指标</dt><dd>{(ir.success_metrics ?? []).join(' · ')}</dd>
            </dl>
          </Card>

          <Card className="p-4">
            <Section title="平台派生状态" sub="同一 Content IR 的四个原生版本" />
            <div className="mt-2.5 flex flex-col gap-2">
              {['wechat', 'zhihu', 'xiaohongshu', 'douyin'].map(p => {
                const v = c.variants.find((x: any) => x.platform === p);
                return (
                  <div key={p} className="flex items-center justify-between">
                    <Plat p={p} />
                    {v ? <Badge kind="green">已适配</Badge> : <Badge>待生成</Badge>}
                  </div>
                );
              })}
            </div>
            <Link to={`/channels/${c.id}`}><Btn small className="w-full justify-center mt-3">前往四平台适配 →</Btn></Link>
          </Card>

          <Card className="p-4">
            <Section title="Agent 运行记录" />
            <div className="mt-2.5 flex flex-col gap-2 text-small">
              {c.runs.length === 0 && <span className="text-soft">尚无运行记录</span>}
              {c.runs.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-meta bg-primary-soft text-primary-ink">{r.agent_id}</span>
                  <span className="text-muted">{r.model} · {r.tokens} tok · ¥{r.cost}</span>
                  <span className="text-meta text-soft ml-auto">{r.created_at}</span>
                </div>
              ))}
            </div>
            <div className="text-meta text-soft mt-2.5">全部运行可回溯（Prompt 版本 / 输入引用 / 输出哈希）</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
