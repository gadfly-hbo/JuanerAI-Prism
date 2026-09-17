# JuanerAI Prism · 棱镜内容工作台 — UI 原型

纯静态 HTML，无需构建。直接双击 `index.html` 即可在浏览器打开，页面间通过左侧导航互相跳转。

## 页面

| 文件 | 模块 | 看什么 |
|---|---|---|
| index.html | 战略驾驶舱 | OSM 三目标、北极星指标、内容漏斗、本期策略 |
| topics.html | 选题雷达 | Agent 生成的选题候选（含"为什么值得做"）、采纳/搁置 |
| studio.html | 内容工作室 | 状态机光谱条、Brief、主张-证据四分类、主内容、批注 |
| channels.html | 四平台适配 | 公众号/知乎/小红书/抖音标签页、UTM、格式检查 |
| review.html | 审查中心 | 三裁判结构化结论、批准/退回操作区 |
| calendar.html | 日历与发布 | 2026 年 9 月月历、发布队列、发布边界承诺 |
| analytics.html | 增长分析 | 四层漏斗、单篇效果（按激活排序）、A/B 实验 |
| library.html | 假设与策略库 | 假设状态徽章、Agent 提议待确认、策略卡（适用/失效条件） |
| community.html | 评论与线索 | 分类收件箱、Agent 回复草稿、企业线索标记 |

## 设计基线

- `assets/prism.css` 遵循 AgentOps SaaS 产品 UI 规范（浅色、克制、语义色）
- 品牌隐喻：白光入 / 光谱出 —— 一条主内容（Content IR）派生四平台版本；状态机进度条用光谱渐变
- 示例数据全部来自产品规划 §15「决策红利」示范用例

## 本地服务方式（可选）

```bash
cd prototype && python3 -m http.server 8931
# 打开 http://127.0.0.1:8931
```

`output/` 目录是各页面的 1440px 宽截图，可不打开浏览器直接看图。
