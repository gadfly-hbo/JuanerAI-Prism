# AGENTS.md — JuanerAI Prism · 棱镜内容工作台

JuanerAI 内部 AI Native 内容运营工作台：Agent 运行内容生产，证据治理品牌表达，产品转化验证内容价值。**最终发布永远需要人类总编批准**。npm workspaces monorepo，Node ≥ 24（当前用 Node 26）。

## 目录

- `server/` — Express + `node:sqlite`（TypeScript ESM，Node 原生 strip-types 直接跑 `.ts`）。`src/core/`（状态机、Content IR 校验、Controller）、`src/agents/`（7 个领域 Agent）、`src/judges/`（3 个规则裁判）、`src/llm/`（Provider 抽象）、`src/routes.ts`（全部 REST API）、`src/seed.ts`
- `web/` — React 18 + Vite + Tailwind 3，页面在 `src/pages/`，共享组件在 `src/ui.tsx`，API 客户端在 `src/api.ts`
- `config/` — 契约层（Git 版本管理）：Content IR schema、Agent 契约、裁判 rubrics、品牌政策、`product-truth.yaml`（产品能力单一事实源）、`fixtures/`（mock LLM 输出）
- `prototype/` — 已用户确认的静态 HTML 原型，是所有前端页面的设计蓝本
- `DESIGN.md` — 视觉唯一事实源，改 UI 前先读；token 与 `web/tailwind.config.js` 保持一致
- `data/`（SQLite 库）与 `exports/`（发布包）为运行时产物，不入库

## 命令

```bash
npm run seed       # 初始化/重置示范数据（先删 data/ 再跑）
npm run dev:server # 后端 :8787（--watch）
npm run dev:web    # 前端 :5173（/api 代理到后端；本机访问用 localhost，127.0.0.1 可能不通）
npm test           # server 单测（node --test tests/*.test.ts）
npm run build      # 前端构建
npx @google/design.md lint DESIGN.md   # 改 DESIGN.md 后必须 0 错误
```

## 必须遵守的产品规则（系统强制，改动时不得削弱）

- 人工批准是硬门禁：无 approvals 记录，状态机拒绝进 `HUMAN_APPROVED`/`PUBLISHED`；裁判 `fail` 自动打回对应节点（evidence→RESEARCHED，brand→CANONICAL_DRAFTED，channel→CHANNEL_ADAPTED）
- Content IR 两级校验：采纳时草稿校验（claims 可空），研究完成后完整校验（`key_claims`、`counterpoints` 非空）——研究前必然没有 claims，不要在采纳时做完整校验
- 产品能力主张必须命中 `config/product-truth.yaml` 的 `live` 条目；四类主张（fact/product_capability/inference/opinion）不得混淆
- Agent 对假设库/策略库只有提议权，人类确认后入库（`library_proposals` 表）
- 发布只做 L0/L1（导出发布包/辅助），不实现自动发布、模拟登录、自动私信

## 技术约束与坑

- **Node strip-only 模式不支持 TS 参数属性**（`constructor(public x)`）等不可擦除语法——只写 erasable TS
- 测试文件在 import 前先设 `process.env.PRISM_DATA_DIR` 到临时目录，再动态 `await import('../src/db.ts')`
- `node --test` 参数用 `tests/*.test.ts` glob，不接受裸目录
- 后台起的 `--watch` server 持有 DB 文件句柄：重置 `data/` 前必须先 `pkill -f src/index.ts`，否则新库不生效
- 品牌裁判是关键词规则引擎（「永远正确」「闭眼冲」等），写种子/fixture 文案时避开，包括在否定句中
- LLM provider 三选一：`mock`（fixtures，离线）/ `openai`（/chat/completions）/ `anthropic`（/v1/messages）。**仓库 `.env` 已配置 ZCode 的 MiniMax（anthropic 兼容，模型 MiniMax-M3），`.env` 不入库**；`server/src/index.ts` 启动时 `process.loadEnvFile` 加载。改 provider 只动 `.env`
- 真实 LLM 的 JSON 输出经三道防线：提示词内嵌显式 schema → `extractJSON` 容错解析（围栏/尾逗号/未引号 key/字符串内未转义引号）→ 解析仍失败时把坏文本回喂模型修复一次。改 Agent 输出结构时同步改提示词模板与归一化代码
- 品牌裁判的夸大词检测有否定语境豁免（前 6 字内含「不非无未并」不算，如「并不等于绝对安全」）；改检测逻辑时同步补 `tests/judges.test.ts` 两个用例
- UI 文案默认简体中文；状态徽标用 DESIGN.md 六态语义色，颜色不作唯一信号（必须带文字）
- Agent runtime 选型已定（2026-09 评估）：不引入 deepseek-harness 等重型框架做底层，保持 `src/llm` 薄 provider 抽象 + 状态机编排；除非某个 Agent 需要工具使用/多轮对话，再单独评估 `call()` seam 后挂 executor 的试点方案

## 改动前阅读

- UI/视觉：先读 `DESIGN.md`，参照 `prototype/` 对应页面
- 状态机/门禁/契约：`config/agent-contracts.yaml`、`config/judge-rubrics.yaml`、`server/src/core/stateMachine.ts`
- 产品背景：用户原始规划见《JuanerAI AI-Native 内容运营工作台产品规划》（~/Downloads，未入库）
