import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Overview, STATE_LABEL } from '../api';
import { Badge, Btn, Card, Meter, Notice, PageHead, Section } from '../ui';

const FUNNEL: [string, string][] = [
  ['内容触达', 'impressions'], ['有效阅读', 'reads'], ['产品页访问', 'product_page'],
  ['下载安装', 'download'], ['首次成功分析', 'first_analysis'], ['7日重复使用', 'retain_7d'], ['团队/企业信号', 'team_signal'],
];

const OSM = [
  { id: 'O1', name: '建立「决策候选」品类认知', desc: 'BI 给数据，智能问数给答案，JuanerAI 给可验证、可比较、可执行的决策候选。', weight: '30%', kind: 'blue' as const },
  { id: 'O2', name: '获取并激活 Xanthil Desktop 个人用户', desc: '访问产品页 → 下载 → 安装 → 完成第一次真实分析 → 7 天内再次使用。', weight: '50%', kind: 'teal' as const },
  { id: 'O3', name: '发现团队与企业转化信号', desc: '团队共享、数据库接入、权限审计与私有化需求，沉淀 Domain Pack 场景。', weight: '20%', kind: 'violet' as const },
];

// 本期内容策略（OSM 的 S 层，静态配置）
const STRATEGIES = [
  ['S1 · 痛点切入', '取数、清洗、验证、隐私、报告无人行动——从真实工作困境获客。'],
  ['S2 · 实战证明', '销售下降、会员复购、商品库存三个案例，证明产品可用。'],
  ['S3 · 方法建信任', '假设—证据—证伪、Analysis IR、决策候选的可信分析方法。'],
  ['S4 · 公开构建', '产品负责人视角：设计取舍、用户反馈、失败与迭代。'],
];

// 北极星月目标（激活定义：安装 + 导入数据 + 完成首次真实分析）；首期手工设定
const NORTH_STAR_TARGET = 240;

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', objective: 'O2_激活', north_star: '内容归因的周激活分析用户数' });
  const [saving, setSaving] = useState(false);

  const load = () => api.get<Overview>('/overview').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const createCampaign = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/campaigns', form);
      setShowNew(false);
      setForm({ name: '', objective: 'O2_激活', north_star: '内容归因的周激活分析用户数' });
      load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (err) return <Notice kind="warn">连接后端失败：{err}。请先启动 server（npm run dev:server）。</Notice>;
  if (!data) return <p className="text-soft p-8">加载中…</p>;

  const max = Math.max(1, ...FUNNEL.map(([, k]) => data.funnel[k] ?? 0));

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="战略驾驶舱" desc="这里回答三个问题：我们的内容目标是什么、现在跑到哪了、下一步该做什么。所有 Agent 的工作都围绕这里设定的目标展开。">
        <Btn kind="primary" onClick={() => setShowNew(true)}>＋ 新建内容活动</Btn>
      </PageHead>

      {showNew && (
        <Card className="p-4">
          <div className="text-section-title">新建内容活动</div>
          <div className="text-small text-soft mt-0.5">活动下辖若干内容资产；创建后可以让 Strategy Agent 为它生成选题候选</div>
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: '1.4fr 1fr 1.4fr' }}>
            <label className="flex flex-col gap-1">
              <span className="text-small text-muted">活动名称</span>
              <input autoFocus className="border border-line-strong rounded-sm px-2.5 py-1.5 text-[13px]"
                placeholder="例：会员复购实战系列"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-small text-muted">服务目标</span>
              <select className="border border-line-strong rounded-sm px-2.5 py-1.5 text-[13px] bg-surface"
                value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })}>
                <option value="O1_认知">O1 · 品类认知</option>
                <option value="O2_激活">O2 · 获客激活</option>
                <option value="O3_企业信号">O3 · 企业信号</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-small text-muted">北极星指标</span>
              <input className="border border-line-strong rounded-sm px-2.5 py-1.5 text-[13px]"
                value={form.north_star} onChange={e => setForm({ ...form, north_star: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <Btn kind="primary" small onClick={createCampaign} disabled={saving || !form.name.trim()}>
              {saving ? '创建中…' : '✓ 创建活动'}
            </Btn>
            <Btn small ghost onClick={() => setShowNew(false)}>取消</Btn>
          </div>
        </Card>
      )}

      {(data.pendingApproval.length > 0 || data.pendingTopics.length > 0) && (
        <Notice kind="warn">
          <span>⚠️</span>
          <div>
            {data.pendingApproval.length > 0 && (
              <><strong className="text-ink">{data.pendingApproval.length} 条内容正等待你批准</strong>
                （<Link className="text-primary underline" to="/review">审查中心</Link>）</>
            )}
            {data.pendingTopics.length > 0 && (
              <>{data.pendingApproval.length > 0 ? '；另有 ' : ''}{data.pendingTopics.length} 条新选题候选在<Link className="text-primary underline" to="/topics">选题雷达</Link>等你决策</>
            )}
            。
          </div>
        </Notice>
      )}

      {/* 北极星指标 */}
      <Card>
        <div className="px-4 pt-4 flex items-start justify-between">
          <div>
            <div className="text-small text-soft">北极星指标</div>
            <div className="flex items-center gap-3 mt-1">
              <h2 className="text-[16px] font-semibold">内容归因的激活分析用户数</h2>
              <Badge kind="teal">激活 = 安装 + 导入数据 + 完成首次真实分析</Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[32px] font-semibold num leading-none">
              {(data.funnel.first_analysis ?? 0).toLocaleString()}
              <span className="text-muted text-[15px]"> / {NORTH_STAR_TARGET}</span>
            </div>
            <div className="text-small text-soft mt-1">本月目标</div>
          </div>
        </div>
        <div className="px-4 pb-4 mt-3">
          <Meter pct={((data.funnel.first_analysis ?? 0) / NORTH_STAR_TARGET) * 100} />
          <div className="text-meta text-soft mt-1.5">
            目标完成度 {Math.round(((data.funnel.first_analysis ?? 0) / NORTH_STAR_TARGET) * 100)}% · 指标来自 CSV 导入，按 UTM 归因
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3.5">
        {OSM.map(o => (
          <Card key={o.id} className="p-4">
            <div className="flex items-center justify-between">
              <Badge kind={o.kind}>{o.id} · {o.id === 'O1' ? '认知' : o.id === 'O2' ? '获客激活' : 'C2B 线索'}</Badge>
              <span className="text-meta text-soft">权重 {o.weight}</span>
            </div>
            <h3 className="mt-2.5 text-[15px] font-semibold">{o.name}</h3>
            <p className="text-small text-muted mt-1.5">{o.desc}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: '1.7fr 1fr' }}>
        <Card>
          <div className="p-4 border-b border-line">
            <Section title="进行中的内容活动" sub="每个活动下辖若干内容资产，按状态推进" right={<Link to="/calendar"><Btn small>查看日历</Btn></Link>} />
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-small text-soft text-left">
                <th className="px-3.5 py-2 font-medium border-b border-line">活动</th>
                <th className="px-3.5 py-2 font-medium border-b border-line">服务目标</th>
                <th className="px-3.5 py-2 font-medium border-b border-line">内容数</th>
                <th className="px-3.5 py-2 font-medium border-b border-line">已发布</th>
                <th className="px-3.5 py-2 font-medium border-b border-line"></th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c: any) => (
                <tr key={c.id} className="text-[13px] hover:bg-surface-2">
                  <td className="px-3.5 py-2.5 border-b border-line"><span className="font-semibold">{c.id} {c.name}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-line"><span className="text-meta bg-surface-3 rounded px-1.5 py-0.5 text-muted">{c.objective}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-line num">{c.contents}</td>
                  <td className="px-3.5 py-2.5 border-b border-line num">{c.published}</td>
                  <td className="px-3.5 py-2.5 border-b border-line whitespace-nowrap">
                    <button className="text-primary text-small mr-3" onClick={async () => {
                      try {
                        const r = await api.post<{ topics: string[] }>(`/campaigns/${c.id}/strategy`, {});
                        alert(`Strategy Agent 已生成 ${r.topics.length} 个选题候选，去选题雷达决策`);
                      } catch (e: any) { alert(e.message); }
                    }}>让 Agent 出选题</button>
                    <Link to="/topics" className="text-primary text-small">选题雷达 →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <Section title="内容漏斗" sub="从曝光到企业信号，逐级转化" />
          <div className="mt-3">
            {FUNNEL.map(([label, key]) => {
              const v = data.funnel[key] ?? 0;
              return (
                <div key={key} className="grid items-center gap-2 py-1" style={{ gridTemplateColumns: '88px 1fr 64px' }}>
                  <span className="text-small text-muted">{label}</span>
                  <div className="h-[20px] rounded-[5px] bg-primary-soft relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-primary opacity-85 rounded-[5px]" style={{ width: `${(v / max) * 100}%` }} />
                  </div>
                  <span className="text-right num font-semibold text-[13px]">{v.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <Notice>瓶颈在「阅读 → 产品页访问」。本周 A/B 实验正在测试 CTA 位置。</Notice>
          </div>
        </Card>
      </div>

      {/* 本期内容策略 */}
      <div>
        <Section title="本期内容策略（S）" sub="选题雷达里的每个候选都会标注它服务哪条策略" />
        <div className="grid grid-cols-4 gap-3.5 mt-3">
          {STRATEGIES.map(([name, desc]) => (
            <Card key={name} className="p-4">
              <div className="text-small font-semibold">{name}</div>
              <p className="text-meta text-muted mt-1.5 leading-relaxed">{desc}</p>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-meta text-soft mt-2">JuanerAI Prism · 最终发布永远需要人类总编批准</p>
    </div>
  );
}
