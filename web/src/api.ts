const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `请求失败 ${res.status}`);
  return body as T;
}

export const api = {
  get: <T>(p: string) => req<T>(p),
  post: <T>(p: string, body?: any) => req<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: any) => req<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(p: string, body?: any) => req<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
};

export interface Overview {
  campaigns: any[];
  pendingApproval: { id: string; title: string }[];
  pendingTopics: { id: string; title: string }[];
  funnel: Record<string, number>;
}

export interface ContentDetail {
  id: string;
  campaign_id: string;
  topic_id?: string;
  title: string;
  state: string;
  risk_level: string;
  human_edits: number;
  ir: any;
  canonical: Record<string, string> | null;
  evidence_pack: any;
  variants: any[];
  judges: any[];
  approvals: any[];
  runs: any[];
  states: string[];
}

export const PLATFORM: Record<string, { name: string; color: string }> = {
  wechat: { name: '公众号', color: '#1aad19' },
  zhihu: { name: '知乎', color: '#2b5fd9' },
  xiaohongshu: { name: '小红书', color: '#e03232' },
  douyin: { name: '抖音', color: '#171823' },
};

export const STATE_LABEL: Record<string, string> = {
  IDEA: '选题', TRIAGED: '已分类', BRIEFED: '已立项', RESEARCHED: '已研究',
  CANONICAL_DRAFTED: '主内容已起草', CHANNEL_ADAPTED: '平台已适配', CREATIVE_READY: '素材就绪',
  JUDGED: '待批准', HUMAN_APPROVED: '已批准', SCHEDULED: '已预约', PUBLISHED: '已发布',
  MEASURED_24H: '24h 已度量', MEASURED_72H: '72h 已度量', MEASURED_7D: '7d 已度量',
  LEARNED: '已复盘', ARCHIVED: '已归档',
};

export const PIPELINE_STEPS = ['IDEA', 'RESEARCHED', 'CANONICAL_DRAFTED', 'CHANNEL_ADAPTED', 'CREATIVE_READY', 'JUDGED', 'HUMAN_APPROVED', 'PUBLISHED', 'LEARNED'];
export const PIPELINE_LABEL: Record<string, string> = {
  IDEA: '选题', RESEARCHED: '研究', CANONICAL_DRAFTED: '主内容', CHANNEL_ADAPTED: '平台适配',
  CREATIVE_READY: '素材', JUDGED: '裁判检查', HUMAN_APPROVED: '你批准', PUBLISHED: '发布', LEARNED: '复盘',
};
