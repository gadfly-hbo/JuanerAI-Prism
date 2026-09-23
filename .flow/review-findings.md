# Review Findings — v0.2（固定点 17ae96a，双轴并行审查 2026-09-17）

## Standards 轴（子代理报告摘要）

无成文标准硬违规。基线 smell（judgement call）：
1. variants.ts 与 routes.ts /analytics 重复 UTM 精确边界 JOIN 谓词（Duplicated Code）
2. `hypothesis_update` 类提议 confirm 时 no-op（沿用 A7-growth 既有缺口，被本次主路径放大）
3. Topics.tsx 硬编码 `['A','B','C']` 与上限 3 两处，与服务端常量重复
4. Studio.tsx `COMPARE_STATS` 与 `COMPARE_METRIC_LABEL` 两份指标文案映射重叠
5. routes.ts 用 `msg.includes('正在执行中')` 子串匹配做 409 分派
6. llm/index.ts `override` 声明位置在 getProvider 之后（可读性）
7. variantBlock 对 sibling `JSON.parse(s.ir)` 无容错（fail-fast，可接受）
8. db.ts 迁移循环 catch 吞错（SQLite 惯用法，可接受）

DESIGN.md 合规：确认通过（徽标带文字、单主按钮、沿用现有页面惯例）。

## Spec 轴（子代理报告摘要）

缺失/不符：
1. 契约同步未做（PRD 明文）：agent-contracts.yaml 未加 A2 变体差异输入、未加 A7-variant-conclusion 条目
2. 门禁回归用例缺失（PRD Testing Decisions 明文）：变体内容「无 approvals 不得 HUMAN_APPROVED」无用例
3. Topics 卡与原型蓝本偏差：蓝本有逐变体清单与状态，正式版只有计数标签（前端先行流程要求对齐）
4. 「存活变体 ≤3」实现为全量 COUNT，ARCHIVED 占额度，与 GRILL#1 语义不符
5. 409 绑定在中文文案子串上，改文案即破坏协议语义（GRILL#5 明确 HTTP 409 语义）

说明（不算 creep）：
- `hypotheses.topic_id` 回链 = tasks.md 切片 4 验收明文（「确认后假设库可查到记录并可回链实验」）
- ALTER 轻量迁移与 PRD「不写迁移」的解读：PRD 指不做正式迁移框架；轻量 ALTER 让用户现有 dev 库不坏，删掉代价不对称——保留，记录在案
- setProvider 测试注入口 = 已批准接缝提案的组成部分

## Blocking（进入修复循环 review_cycles=1）

- B1. `confirmProposal` 补 `hypothesis_update` 分支：verdict/evidence 落假设库（confirmed→confirmed+support、rejected→rejected+oppose、inconclusive→inconclusive），statement 匹配不到时报错；补测试
- B2. 存活口径：`createVariant` 上限计数与 `listTopics` variant_count 排除 `state='ARCHIVED'`；补「归档后可再开」测试
- B3. 同步 `config/agent-contracts.yaml`：A2-research 输入加变体差异上下文；新增 A7-variant-conclusion 条目
- B4. 补门禁回归用例：变体内容无 approvals 不得 HUMAN_APPROVED，approve 后通过
- B5. 409 结构化：新增 `ContentBusyError`，wrap 用 instanceof 分派 409；mutex 测试断言错误类型
- B6. Topics 卡补逐变体清单与状态（对齐原型蓝本）：listTopics 带出变体明细（label/state/hypothesis），Topics.tsx 渲染

## Non-blocking（记录不动）

- UTM JOIN 谓词重复（提取共享 SQL 涉及既有 /analytics，属下一轮重构机会）
- 前端 A/B/C 与上限常量重复（跨端共享需 API 下发，当前规模不值）
- COMPARE_STATS / COMPARE_METRIC_LABEL 合并
- setProvider 声明位置；sibling JSON.parse 无容错（fail-fast 符合仓库风格）；迁移 catch-all

## 第二轮核查（review_cycles=2，聚焦 B1-B6 修复）

- B2/B3/B4/B5/B6 通过；B1 轻微不通过：inconclusive 误计 support → 已修（只置状态不计数，补测试）；B2 小瑕疵（前端「下一个标签」提示按 count 计算，复用场景会错）→ 已修（按存活未占用计算）。
- 复验：56/56 单测通过，vite build 通过。无遗留 blocking。
