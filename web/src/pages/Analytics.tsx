import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Btn, Card, Notice, PageHead, Plat, Section } from '../ui';

const LAYERS: { name: string; kind: 'blue' | 'blue' | 'teal' | 'violet'; items: [string, string][] }[] = [
  { name: '① 内容层', kind: 'blue', items: [['曝光', 'impressions'], ['有效阅读 / 完播', 'reads'], ['收藏', 'collects']] },
  { name: '② 访问层', kind: 'blue', items: [['产品页访问', 'product_page']] },
  { name: '③ 产品层（最关键）', kind: 'teal', items: [['下载', 'download'], ['完成安装', 'install'], ['首次成功分析', 'first_analysis'], ['7 日重复使用', 'retain_7d']] },
  { name: '④ 商业层', kind: 'violet', items: [['团队协作信号', 'team_signal']] },
];

export default function Analytics() {
  const [data, setData] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('utm_content,impressions,reads,product_page,download,first_analysis,retain_7d\n');
  const [review, setReview] = useState<any>(null);

  const load = () => api.get('/analytics').then(setData);
  useEffect(() => { load(); }, []);

  const importCsv = async () => {
    try {
      const r = await api.post<{ rows: number }>('/metrics/import', { kind: 'platform', csv });
      alert(`导入完成：${r.rows} 行`);
      setShowImport(false);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const weekly = async () => {
    const r = await api.post<any>('/growth/weekly', {});
    setReview(r);
  };

  if (!data) return <p className="text-soft p-8">加载中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="增长分析" desc="不看虚荣指标。这里追踪的是：内容 → 产品页 → 下载 → 首次真实分析 → 重复使用 → 团队/企业信号。每一层都能回溯到具体是哪条内容带来的。">
        <Btn onClick={() => setShowImport(!showImport)}>⬆ 导入平台数据（CSV）</Btn>
        <Btn kind="primary" onClick={weekly}>生成本周复盘</Btn>
      </PageHead>

      <Notice><span>📥</span><div>首期指标通过 CSV 手工导入（各平台后台导出 + 产品事件表），按 UTM 来源码自动关联到内容。</div></Notice>

      {showImport && (
        <Card className="p-4">
          <Section title="粘贴 CSV" sub="支持长表（utm_content,metric,value,date）或宽表（utm_content,impressions,reads,...）" />
          <textarea className="w-full mt-2.5 border border-line-strong rounded-sm p-3 text-small font-mono" rows={5}
            value={csv} onChange={e => setCsv(e.target.value)} />
          <div className="flex gap-2 mt-2">
            <Btn kind="primary" small onClick={importCsv}>导入</Btn>
            <Btn small ghost onClick={() => setShowImport(false)}>取消</Btn>
          </div>
        </Card>
      )}

      {review && (
        <Card className="p-4">
          <Section title="本周复盘（Growth Agent 生成，提议已入待确认队列）" />
          <p className="text-small mt-2">{review.weekly_summary}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {(review.hypothesis_updates ?? []).map((h: any, i: number) => (
              <Notice key={i} kind="ok"><span>📈</span><div className="text-small">假设「{h.hypothesis}」证据充足，建议升级为策略 → 请到假设与策略库确认</div></Notice>
            ))}
            {(review.new_hypotheses ?? []).map((h: any, i: number) => (
              <Notice key={i}><span>💡</span><div className="text-small">新假设提议：{h.statement}</div></Notice>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-3.5">
        {LAYERS.map(l => (
          <Card key={l.name} className="p-4">
            <Badge kind={l.kind} dot={false}>{l.name}</Badge>
            <div className="mt-2.5 flex flex-col gap-2 text-[13px]">
              {l.items.map(([label, key]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-muted">{label}</span>
                  <strong className="num">{(data.totals[key] ?? 0).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <Section title="单篇内容效果" sub="按「激活贡献」排序——阅读量高不等于有价值" />
        </div>
        <table className="w-full">
          <thead><tr className="text-small text-soft text-left">
            {['内容', '平台', '阅读/曝光', '收藏', '产品页访问', '下载', '首次分析', '7日留存'].map(h => (
              <th key={h} className="px-3.5 py-2 font-medium border-b border-line">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[...data.contents].sort((a: any, b: any) => (b.metrics.first_analysis ?? 0) - (a.metrics.first_analysis ?? 0)).map((ct: any) => (
              <tr key={ct.content_id} className="text-[13px] hover:bg-surface-2">
                <td className="px-3.5 py-2.5 border-b border-line"><span className="font-semibold">{ct.content_id}</span> {ct.title}</td>
                <td className="px-3.5 py-2.5 border-b border-line">{ct.platforms.map((p: string) => <Plat key={p} p={p} className="mr-2" />)}</td>
                <td className="px-3.5 py-2.5 border-b border-line num">{(ct.metrics.reads ?? 0).toLocaleString()}</td>
                <td className="px-3.5 py-2.5 border-b border-line num">{ct.metrics.collects ?? 0}</td>
                <td className="px-3.5 py-2.5 border-b border-line num">{ct.metrics.product_page ?? 0}</td>
                <td className="px-3.5 py-2.5 border-b border-line num">{ct.metrics.download ?? 0}</td>
                <td className="px-3.5 py-2.5 border-b border-line num font-semibold">{ct.metrics.first_analysis ?? 0}</td>
                <td className="px-3.5 py-2.5 border-b border-line num">{ct.metrics.retain_7d ?? 0}</td>
              </tr>
            ))}
            {data.contents.length === 0 && <tr><td colSpan={8} className="px-3.5 py-6 text-center text-soft">暂无指标——先导入 CSV</td></tr>}
          </tbody>
        </table>
      </Card>

      <p className="text-meta text-soft">发布不是终点，产品激活与企业信号才是终点 · 复盘结论经你确认后才写入假设库与策略库</p>
    </div>
  );
}
