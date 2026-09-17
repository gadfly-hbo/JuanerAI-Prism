// LLM Provider 抽象：所有 Agent 经此调用模型，不直接绑定供应商。
// PRISM_LLM_PROVIDER=mock（默认，离线 fixture）| openai（OpenAI 兼容 /chat/completions）
//                  | anthropic（Anthropic 兼容 /v1/messages，如 ZCode 配置的 MiniMax）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_DIR = path.join(ROOT, 'config', 'fixtures');

// 统一成本口径：PRISM_LLM_COST_PER_1K 可配置（美元/千 token），mock 与真实 provider 共用
const COST_PER_1K = Number(process.env.PRISM_LLM_COST_PER_1K ?? 0.002);

export interface CompleteRequest {
  agentId: string;
  system: string;
  prompt: string;
}

export interface LLMProvider {
  name: string;
  model: string;
  completeJSON(req: CompleteRequest): Promise<{ data: any; tokens: number; cost: number }>;
}

/** 两个真实 provider 的公共逻辑：解析失败时把坏文本回喂一次，让模型自我修复 */
async function completeWithRepair(
  raw: (req: CompleteRequest) => Promise<{ text: string; tokens: number }>,
  req: CompleteRequest,
): Promise<{ data: any; tokens: number; cost: number }> {
  let tokens = 0;
  let first = '';
  try {
    const r = await raw(req);
    first = r.text;
    tokens += r.tokens;
    return { data: extractJSON(first), tokens, cost: +(tokens / 1000 * COST_PER_1K).toFixed(3) };
  } catch {
    // 一次修复调用：把损坏的 JSON 原样交回模型重排
    const r = await raw({
      agentId: req.agentId,
      system: '你是 JSON 修复器。输入文本是一段损坏的 JSON，修复为合法 JSON。只输出修复后的 JSON，不要任何解释。',
      prompt: first.slice(0, 60_000),
    });
    tokens += r.tokens;
    return { data: extractJSON(r.text), tokens, cost: +(tokens / 1000 * COST_PER_1K).toFixed(3) };
  }
}

/** 本地启发式修复常见的模型 JSON 瑕疵（不改变字符串内容） */
function repairJSONLoose(t: string): string {
  return t
    .replace(/,\s*([}\]])/g, '$1')                    // 尾逗号
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3'); // 未加引号的 key
}

/** 字符串值内部的未转义引号自动转义：后随结构性字符（,}]:或串尾）视为闭合，否则视为内嵌引号 */
function escapeInnerQuotes(t: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (!inStr) {
      if (ch === '"') inStr = true;
      out += ch;
      continue;
    }
    if (ch === '\\') { out += ch + (t[i + 1] ?? ''); i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < t.length && /\s/.test(t[j])) j++;
      const nxt = t[j];
      if (nxt === undefined || ',}]:'.includes(nxt)) { inStr = false; out += ch; }
      else out += '\\"';
      continue;
    }
    out += ch;
  }
  return out;
}

/** 解析模型返回的 JSON：容忍 ```json 围栏、前后杂文本、常见语法瑕疵 */
export function extractJSON(text: string): any {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/[[{]/);
  if (start > 0) t = t.slice(start);
  const attempts = [t, repairJSONLoose(t), escapeInnerQuotes(t), repairJSONLoose(escapeInnerQuotes(t))];
  let lastErr: unknown;
  for (const a of attempts) {
    try { return JSON.parse(a); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/** Mock：返回 config/fixtures/<agentId>.json，离线可跑通全流程 */
class MockProvider implements LLMProvider {
  name = 'mock';
  model = 'fixture';
  async completeJSON(req: CompleteRequest) {
    const file = path.join(FIXTURE_DIR, `${req.agentId}.json`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const tokens = JSON.stringify(data).length;
    return { data, tokens, cost: +(tokens / 1000 * COST_PER_1K).toFixed(3) };
  }
}

/** OpenAI 兼容接口：PRISM_LLM_BASE_URL / PRISM_LLM_API_KEY / PRISM_LLM_MODEL */
class OpenAICompatibleProvider implements LLMProvider {
  name = 'openai-compatible';
  model = process.env.PRISM_LLM_MODEL || 'gpt-4o-mini';
  private base = (process.env.PRISM_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  private key = process.env.PRISM_LLM_API_KEY || '';

  private async raw(req: CompleteRequest): Promise<{ text: string; tokens: number }> {
    if (!this.key) throw new Error('未配置 PRISM_LLM_API_KEY');
    const res = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.system + '\n只输出 JSON。' },
          { role: 'user', content: req.prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM 调用失败：${res.status} ${await res.text()}`);
    const json: any = await res.json();
    const text = json.choices?.[0]?.message?.content ?? '';
    return { text, tokens: json.usage?.total_tokens ?? 0 };
  }

  completeJSON(req: CompleteRequest) {
    return completeWithRepair((r) => this.raw(r), req);
  }
}

/** Anthropic 兼容接口（MiniMax /anthropic、Claude 等）：POST {base}/v1/messages */
class AnthropicCompatibleProvider implements LLMProvider {
  name = 'anthropic-compatible';
  model = process.env.PRISM_LLM_MODEL || 'MiniMax-M3';
  private base = (process.env.PRISM_LLM_BASE_URL || 'https://api.minimax.cn/anthropic').replace(/\/$/, '');
  private key = process.env.PRISM_LLM_API_KEY || '';

  private async raw(req: CompleteRequest): Promise<{ text: string; tokens: number }> {
    if (!this.key) throw new Error('未配置 PRISM_LLM_API_KEY');
    const res = await fetch(`${this.base}/v1/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: Number(process.env.PRISM_LLM_MAX_TOKENS ?? 8192),
        system: req.system + '\n只输出 JSON，不要输出任何其他内容或代码围栏。',
        messages: [{ role: 'user', content: req.prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM 调用失败：${res.status} ${await res.text()}`);
    const json: any = await res.json();
    const text = (json.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return { text, tokens: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) };
  }

  completeJSON(req: CompleteRequest) {
    return completeWithRepair((r) => this.raw(r), req);
  }
}

export function getProvider(): LLMProvider {
  const kind = process.env.PRISM_LLM_PROVIDER;
  if (kind === 'openai') return new OpenAICompatibleProvider();
  if (kind === 'anthropic') return new AnthropicCompatibleProvider();
  return new MockProvider();
}
