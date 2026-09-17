# JuanerAI Prism · 棱镜内容工作台

JuanerAI 自媒体矩阵的内部 AI Native 内容运营与增长工作台。以 Agent 运行内容生产，以证据治理品牌表达，以产品转化验证内容价值——最终发布永远需要人类总编批准。

## 快速开始

双击 `启动Prism.command` 即可（自动装依赖、初始化数据、拉起前后端并打开浏览器；关闭终端窗口即停止全部服务）。

命令行方式：

```bash
npm install        # 安装依赖（Node ≥ 24）
npm run seed       # 初始化数据库 + 示范数据（规划 §15「决策红利」用例）
npm run dev:server # 终端 1：后端 http://127.0.0.1:8787
npm run dev:web    # 终端 2：前端 http://localhost:5173
```

打开 http://localhost:5173 ，建议演示路径：

1. **选题雷达**：采纳一个选题 → 自动进入内容工作室
2. **内容工作室**：连点「推进下一节点」，看 Agent 依次完成研究 → 主内容 → 四平台适配 → 素材；到「素材就绪」后自动触发三裁判检查
3. **审查中心**：查看三裁判结构化结论，点「批准」或「退回」
4. **日历与发布**：导出发布包（落到 `exports/<内容ID>/<平台>/`），预约 → 手动发布后标记完成
5. **增长分析**：粘贴平台 CSV 导入指标，按 UTM 自动归因到内容；「生成本周复盘」让 Growth Agent 提议双库更新
6. **假设与策略库**：确认或搁置 Agent 的提议

## 架构

```
config/      Content IR schema、Agent 契约、裁判规则、品牌政策、产品事实源、mock fixtures（Git 版本管理）
server/      Express + node:sqlite（data/prism.db）
  src/core/    状态机（stateMachine）、Content IR 校验（zod）、Controller 调度
  src/agents/  7 个领域 Agent（Strategy/Research/Canonical/Channel/Creative/Publishing/Growth）
  src/judges/  3 个独立规则裁判（事实 / 品牌合规 / 平台格式）
  src/llm/     LLM Provider 抽象：mock（默认，离线 fixture）| openai 兼容接口
web/         React 18 + Vite + Tailwind，视觉遵循根目录 DESIGN.md
prototype/   已确认的静态 HTML 原型（设计蓝本）
```

## 关键规则（系统强制，非约定）

- **人工批准是硬门禁**：没有批准记录，状态机拒绝进入 `HUMAN_APPROVED` / `PUBLISHED`；裁判 fail 自动打回对应节点
- **四类内容分色**：事实 / 产品能力 / 分析推断 / 品牌观点；产品能力主张必须命中 `config/product-truth.yaml` 的已上线条目
- **反方观点不得为空**，裁判会拦截
- **Agent 对双库只有提议权**，人类确认后生效
- **发布边界**：只做发布包导出与草稿辅助（L0/L1），无自动发布、无模拟登录

## LLM 接入

默认读取仓库根目录 `.env`（已配置为 ZCode 中的 MiniMax Anthropic 兼容接口，模型 MiniMax-M3；`.env` 不入库）。每个真实 Agent 输出都经 schema 提示词约束 + 坏 JSON 自动修复（本地启发式 + 回喂重排）+ 裁判规则校验三道防线。

```bash
# .env 结构
PRISM_LLM_PROVIDER=anthropic          # mock | openai | anthropic
PRISM_LLM_BASE_URL=https://api.minimax.cn/anthropic
PRISM_LLM_API_KEY=…
PRISM_LLM_MODEL=MiniMax-M3
```

切回离线演示：把 `.env` 中 `PRISM_LLM_PROVIDER` 改为 `mock`（使用 `config/fixtures/` 的固定输出）。

## 验证

```bash
npm test         # 18 个单测：状态机门禁 / IR 校验 / 裁判规则 / CSV 导入归因
npm run build    # 前端构建
```

## 设计规范

`DESIGN.md` 为本产品视觉唯一事实源（通过 `@google/design.md` lint），并已在双端注册为全局默认 UI 基线（`~/.zcode/design/DESIGN.md`）。
