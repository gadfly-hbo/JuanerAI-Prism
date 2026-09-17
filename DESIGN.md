---
version: alpha
name: JuanerAI Prism 棱镜内容工作台
description: JuanerAI 内部 AI Native 内容运营工作台的界面设计语言。浅色、克制、语义色驱动，面向非技术运营人员，品牌隐喻为「白光入、光谱出」——一条主内容派生多平台版本。
colors:
  bg: "#f5f7fa"
  surface: "#ffffff"
  surface-2: "#f9fafb"
  surface-3: "#eef2f6"
  text: "#17202a"
  muted: "#5d6b7d"
  soft: "#8a96a6"
  border: "#dce3ea"
  border-strong: "#c2ccd8"
  primary: "#155e75"
  primary-soft: "#e2eff3"
  primary-ink: "#0c3b4a"
  primary-hover: "#104c60"
  teal: "#0f766e"
  teal-soft: "#dff3f0"
  green: "#156f43"
  green-soft: "#e5f6ed"
  amber: "#8f6100"
  amber-soft: "#fff3cf"
  red: "#ba3030"
  red-soft: "#ffe6e6"
  violet: "#6d4fc2"
  violet-soft: "#efebfb"
typography:
  sans:
    fontFamily: Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, ui-sans-serif, system-ui, sans-serif
  page-title:
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1.3
  section-title:
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontSize: 14px
    lineHeight: 1.55
  small:
    fontSize: 12.5px
    lineHeight: 1.45
  meta:
    fontSize: 11.5px
    lineHeight: 1.4
rounded:
  base: 8px
  sm: 6px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
  badge-success:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
  badge-warning:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
  badge-danger:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
  badge-info:
    backgroundColor: "{colors.teal-soft}"
    textColor: "{colors.teal}"
  badge-brand:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-ink}"
  badge-neutral:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.muted}"
---

## Overview

JuanerAI Prism（棱镜内容工作台）是 JuanerAI 自媒体矩阵的内部内容运营与增长工作台，界面默认简体中文，使用者为非技术背景的运营与人类总编。设计方向：安静、专业、可长期使用的 SaaS 工作台——中性底色承载界面，语义色只表达状态，每页让用户一眼看清当前状态、风险和下一步动作。

品牌隐喻「白光入、光谱出」：一份主内容（Content IR）像白光进入棱镜，析出多平台原生版本。该隐喻只允许出现在两个位置——侧边栏品牌标识，以及内容流水线的光谱渐变进度条；其余界面不使用彩虹渐变。

## Colors

墨青 `primary` 只用于主操作、选中态、焦点环和关键强调数据（如转化率、北极星指标数值）。导航选中态用 `primary-soft` 底 + `primary-ink` 字，不用实色填充。

语义色固定含义：`green` 已通过/已成立/已发布，`amber` 待决策/待复核/进行中，`red` 未通过/已否决/高风险，`teal` 信息类确认，`violet` 企业线索与 C2B 商业信号。每个语义色配同色系 `-soft` 底色，成对出现于徽标和提示条。状态绝不只用颜色表达，必须同时带文字（如「已否决」「待复核」）。

内容主张的四分类颜色是产品语义的一部分，不可更改：事实=teal，产品能力=primary 墨青，分析推断=amber，品牌观点=violet。

暗色主题暂未定义；后续新增时必须保持与本规范相同的信息层级和状态语义，不是简单反色。

## Typography

界面正文基准为 `body`（14px），长正文（正文预览、回复草稿）行高放宽到 1.7。页面标题用 `page-title` 且每页只有一个；分区标题用 `section-title`；`small` 用于表格正文、列表摘要；`meta` 仅用于时间、来源、追踪码等辅助信息。字重只用 400/500/600 三档建立层级，不全页粗体。数字指标使用 `font-variant-numeric: tabular-nums` 对齐。所有文案按最长中文 case 检查换行，不截断关键信息。

## Layout

固定产品外壳：左侧 240px 粘性侧边栏（品牌区、两组导航、底部人类总编身份区）+ 右侧主内容区（内边距 22-28px，底部留白 48px）。侧边栏导航分「工作台」和「增长与学习」两组；有待办数量的入口挂计数胶囊。

每个页面的结构顺序固定：① 页头（标题 + 一句「这个页面是做什么的」说明 + 右侧最多一个主按钮）② 需要时的全局提示条 ③ 状态摘要或指标格 ④ 主工作区 ⑤ 页脚一行边界/原则说明。每页只设一个主按钮（墨青实色），其余动作用次要或幽灵按钮。

间距遵循 8px 网格：卡片内边距 16px，页面大区块间距 14-22px，工具栏元素间距 8px。重复项用 2-4 列网格（指标格 4-6 列，内容卡片 2 列）；主从布局用 1.6-1.9 : 1 的内容/侧栏比例。窄于 900px 时侧边栏转为顶部堆叠。

## Elevation & Depth

层级由背景色、边框和位置表达，不用大阴影。三级表面：`bg` 页面底、`surface` 卡片与面板、`surface-2`/`surface-3` 用于卡片内的次级区域（追踪码块、格式检查块、正文预览框）。浮层和悬停才可使用 `--shadow`（10px 28px 7% 透明度 + 1px 2px 6%）。

## Shapes

按钮、输入框、标签用 `sm`（6px）圆角；卡片、面板、日历格用 `base`（8px）；状态徽标用胶囊圆角；头像和流水线节点用正圆。素材占位用 1.5px 虚线边框 + `surface-2` 底，不用实色块假装图片。

## Components

**状态徽标**：胶囊形，圆点前缀 + 文字，六态配色对应 Colors 的语义色表。全站同一状态只能用一个词（如「待复核」不得写作「待检查」）。

**状态机进度条**：内容工作室专用。顶部 4px 光谱渐变条（品牌隐喻位），下方步骤节点链：已完成=墨青实心+对勾，当前=白底墨青描边，未到达=灰色。任何「未通过」都回退到对应节点，不画跳过。

**提示条 notice**：左边 3px 语义色竖条 + 图标 + 说明文字，用于页面级解释和 Agent 建议。高风险用 amber，安全承诺用 green，默认用 primary。

**主张-证据表**：内容工作室核心组件。类型列用四分类色徽标，证据来源列显示 Claim 编号与出处，状态列只显示「已核实/待复核/已确认」。反方观点区块必须保留且不可折叠隐藏。

**漏斗条**：标签 92px + 墨青渐变条 + 右对齐数值，用于内容漏斗和四层转化，不按阅读数排序而按激活贡献排序。

**日历格**：96px 最小高度，今天用墨青描边；发布条目按平台着色（公众号=teal、知乎=蓝、小红书=red、抖音=深紫），与平台标识点同色。

**平台标识**：8px 方点 + 平台名，颜色固定：公众号 #1aad19、知乎 #2b5fd9、小红书 #e03232、抖音 #171823。

**按钮**：每区域最多一个 `button-primary`；退回、删除等破坏性动作用红色描边的 danger 变体并明确标注后果；图标按钮必须有可访问名称。

## Do's and Don'ts

Do:

- 每页顶部用一句话说明页面用途和「下一步该做什么」，面向非技术人员。
- 把产品边界写成界面文案：发布需人工批准、Agent 不自动私信、数据仅用于运营目的。
- 待办数量直接挂在导航和卡片上（待批准 3、待决策 6），让总编打开就知道去哪。
- 效果数据按「激活贡献」排序展示，而非阅读量。

Don't:

- 不要做成营销首页：无巨型 hero、无装饰性渐变球、无玻璃拟态、无嵌套卡片。
- 不要在状态机/品牌位之外使用光谱渐变。
- 不要让颜色成为唯一状态信号；不用 placeholder 代替表单标签。
- 不展示无来源的数字；所有事实主张必须能追溯到 Claim 记录。
- 不提供「跳过审查」「自动发布」类入口，即使在原型中也不出现。
