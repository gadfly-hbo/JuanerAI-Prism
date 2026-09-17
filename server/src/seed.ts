// 种子数据：规划 §15「决策红利」示范用例 + 双库初始条目
// 幂等：已有数据时跳过。
import { get, run } from './db.ts';

function seed() {
  if (get(`SELECT id FROM campaigns LIMIT 1`)) {
    console.log('已有数据，跳过 seed（如需重置请删除 data/prism.db）');
    return;
  }

  // Campaigns
  run(`INSERT INTO campaigns (id, name, objective, north_star) VALUES
    ('CAM-2026-003', '决策红利认知战役', 'O1_认知', '内容归因的周激活分析用户数'),
    ('CAM-2026-004', '本地隐私实战系列', 'O2_激活', '内容归因的周激活分析用户数'),
    ('CAM-2026-005', '销售下降复盘模板', 'O2_激活', '内容归因的周激活分析用户数')`);

  // Claims
  const claims = [
    ['CLM-001', '原始数据可留在本地执行环境，不发送给云端大模型', 'product_capability', 'PRODUCT-CAP-LOCAL-001', '2026-09', 'high', 1, 'verified'],
    ['CLM-041', '2025 年社会消费品零售总额同比增速降至 4.1%', 'fact', '国家统计局公报', '2026-01', 'high', 1, 'verified'],
    ['CLM-042', '存量竞争中，决策质量对经营结果的边际贡献上升', 'inference', '基于 3 个行业案例的归纳', '2026-09', 'medium', 1, 'pending_review'],
    ['CLM-043', '未来属于「把决策当系统工程」的企业', 'opinion', '品牌立场声明', '2026-09', 'high', 1, 'verified'],
  ];
  for (const c of claims) {
    run(`INSERT INTO claims (id, statement, claim_type, source, source_time, confidence, public_ok, status) VALUES (?,?,?,?,?,?,?,?)`, ...c);
  }

  // 示范内容：决策红利（状态 CREATIVE_READY，等待裁判）
  const ir = {
    content_id: 'CNT-2026-0014', campaign_id: 'CAM-2026-003',
    title: '从执行红利到决策红利：为什么企业需要新的经营能力',
    objective: 'O1_认知', funnel_stage: 'awareness',
    persona: { role: '数据分析师、业务负责人、企业管理者', maturity: '对 AI 有认知但持谨慎态度' },
    job_to_be_done: '在存量竞争中提高经营决策质量',
    user_problem: '存量竞争下，很多团队还在用「执行力」弥补「决策质量」的不足',
    core_thesis: '执行力仍重要，但存量竞争提高了决策质量的权重；经营结果 ≈ 决策质量 × 执行能力 × 反馈速度',
    content_hypothesis: '「决策红利」叙事比「AI 提效」叙事更能打动管理者，带来更高质量的产品页访问',
    key_claims: [
      { claim_id: 'CLM-041', statement: '2025 年社会消费品零售总额同比增速降至 4.1%', claim_type: 'fact', evidence_ref: '国家统计局公报（2026-01）', status: 'verified' },
      { claim_id: 'CLM-001', statement: '原始数据可留在本地执行环境，不发送给云端大模型', claim_type: 'product_capability', evidence_ref: 'PRODUCT-CAP-LOCAL-001', status: 'verified' },
      { claim_id: 'CLM-042', statement: '存量竞争中，决策质量对经营结果的边际贡献上升', claim_type: 'inference', evidence_ref: '基于 3 个行业案例的归纳', status: 'pending_review' },
      { claim_id: 'CLM-043', statement: '未来属于「把决策当系统工程」的企业', claim_type: 'opinion', evidence_ref: '品牌立场声明，无需外部证据', status: 'verified' },
    ],
    counterpoints: ['本地模式仍需明确元数据与模型调用的边界；「决策红利」是方向性判断，不构成对任何企业经营效果的承诺。'],
    canonical_structure: {},
    channel_intents: { wechat: '深度教育与信任', zhihu: '完整回答搜索问题', xiaohongshu: '收藏型教程', douyin: '真实操作证明' },
    experiment: { variable: 'hook', variants: ['市场红利消失', '执行越快错误放大越快'] },
    success_metrics: ['landing_page_click', 'activated_user'],
    risk_level: 'medium', approval_required: true,
  };
  const canonical = {
    hook: '过去，方向没那么准也能赚钱——市场涨得快，执行够狠就行。但 2026 年，这个游戏结束了。',
    problem: '选错商品、投错用户、开错门店——存量时代，执行越快，损失放大得越快。问题不在于团队不努力，而在于决策环节缺少一套可验证的机制。',
    mechanism: '经营结果 ≈ 决策质量 × 执行能力 × 反馈速度。JuanerAI 的做法：不替你做决定，而是为每个关键问题生成多个可比较、带证据、可证伪的决策候选。',
    example: '某零售客户用 Xanthil 复盘「销售下降」：系统给出 3 个候选解释（客流减少 / 客单价下滑 / 品类结构变化）及各自证据，最终定位到品类结构——而不是直觉认为的客流问题。（匿名化案例，已获授权）',
    limitation: '这套方法不做一劳永逸的承诺；它承诺的是：每个结论都有证据链，每个假设都可以被挑战和推翻。',
    cta: '想亲自验证？下载 Xanthil Desktop，用你自己的数据跑第一次分析。',
  };
  run(`INSERT INTO contents (id, campaign_id, title, state, ir, canonical, risk_level) VALUES (?,?,?,?,?,?,?)`,
    'CNT-2026-0014', 'CAM-2026-003', ir.title, 'CREATIVE_READY', JSON.stringify(ir), JSON.stringify(canonical), 'medium');

  const variants = [
    ['wechat', '从执行红利到决策红利：为什么企业需要新的经营能力', '一、那个「执行就能赢」的时代结束了\n二、存量竞争，拼的是决策质量\n三、决策质量 × 执行能力 × 反馈速度\n四、一个零售复盘的真实案例\n五、这套方法的边界在哪里\n六、写在最后：决策是一种可以练习的能力', '点击「阅读原文」下载 Xanthil Desktop，用你的数据做第一次真实分析', 'a'],
    ['zhihu', '进入存量竞争后，企业的决策能力会比执行力更重要吗？', '结论先行：会，且权重在快速上升。然后用三个行业数据 + 一个匿名复盘案例论证；最后一段自然提及 JuanerAI 的做法，不构成推销。', '评论区置顶：文中提到的复盘方法，可用 Xanthil Desktop 免费验证', 'b'],
    ['xiaohongshu', '增量时代拼执行，存量时代先拼判断｜附复盘模板', '判断比勤奋更值钱的证据都在图里👆 评论区扣「模板」发你复盘表格', '评论区口令「模板」→ 人工回复专属链接', 'c'],
    ['douyin', '执行越快，错误放大越快？', '过去企业方向做得没那么准，只要市场增长快、执行足够强，仍然能赚钱。但存量时代不一样：选错商品、投错用户、开错门店，执行越快，损失越快。所以未来不是执行力不重要，而是经营结果越来越等于：决策质量 × 执行能力 × 反馈速度。这也是我们为什么在做 JuanerAI。', '评论区置顶链接 + 主页落地页二维码', 'd'],
  ];
  // 素材与 AI 标识为内容级元数据（A5 写入同一结构）；品牌裁判会检查 ai_labels
  const assets = JSON.stringify({
    tasks: [{ platform: 'douyin', kind: '分镜脚本', spec: '4 镜头：口播 8s / 录屏 30s / 动画 12s / CTA 10s', status: 'pending_screenrecording' }],
    ai_labels: { text: true, image: true, video: true },
  });
  for (const [platform, title, body, cta, suffix] of variants) {
    run(`INSERT INTO channel_variants (content_id, platform, title, body, cta, utm, assets) VALUES (?,?,?,?,?,?,?)`,
      'CNT-2026-0014', platform, title, body, cta,
      `utm_source=${platform}&utm_medium=content&utm_campaign=cam2026_003&utm_content=cnt20260014_${suffix}`,
      assets);
  }
  run(`INSERT INTO evidence_packs (content_id, pack) VALUES (?, ?)`, 'CNT-2026-0014',
    JSON.stringify({ facts: claims.slice(0, 2), inferences: [claims[2]], counterpoints: ir.counterpoints, usable_cases: [{ id: 'CASE-RETAIL-001', authorized: true, anonymized: true }], blocked: ['客户真实经营数字'], open_questions: ['CLM-042 措辞软化'] }));

  // 已发布内容（供分析页演示）
  run(`INSERT INTO contents (id, campaign_id, title, state, risk_level) VALUES
    ('CNT-2026-0007', 'CAM-2026-004', '数据不出本机：隐私优先的 AI 分析', 'PUBLISHED', 'low'),
    ('CNT-2026-0009', 'CAM-2026-005', 'Excel 复盘卡片模板', 'PUBLISHED', 'low')`);
  run(`INSERT INTO channel_variants (content_id, platform, title, body, cta, utm, approved) VALUES
    ('CNT-2026-0007', 'zhihu', '数据不出本机', '…', '…', 'utm_source=zhihu&utm_medium=content&utm_campaign=cam2026_004&utm_content=cnt20260007_a', 1),
    ('CNT-2026-0009', 'xiaohongshu', 'Excel 复盘卡片', '…', '…', 'utm_source=xhs&utm_medium=content&utm_campaign=cam2026_005&utm_content=cnt20260009_a', 1)`);

  // 指标（与原型一致的一组演示数字）
  run(`INSERT INTO metric_imports (kind, filename, rows) VALUES ('platform', 'seed.csv', 0)`);
  const importId = get(`SELECT last_insert_rowid() id`).id;
  const metrics: [string, string, number][] = [
    ['cnt20260007_a', 'impressions', 21304], ['cnt20260007_a', 'reads', 21304], ['cnt20260007_a', 'collects', 1860],
    ['cnt20260007_a', 'product_page', 1204], ['cnt20260007_a', 'download', 388], ['cnt20260007_a', 'first_analysis', 214],
    ['cnt20260007_a', 'retain_7d', 102],
    ['cnt20260009_a', 'impressions', 12890], ['cnt20260009_a', 'reads', 12890], ['cnt20260009_a', 'collects', 2310],
    ['cnt20260009_a', 'product_page', 812], ['cnt20260009_a', 'download', 301], ['cnt20260009_a', 'first_analysis', 147],
    ['cnt20260009_a', 'retain_7d', 88],
  ];
  for (const [u, m, v] of metrics) {
    run(`INSERT INTO metric_rows (import_id, utm_content, metric, value, date) VALUES (?,?,?,?, '2026-09-16')`, importId, u, m, v);
  }

  // 双库
  const hypotheses = [
    ['HYP-001', '隐私与可验证性比「AI 更快」更能驱动高意向下载', '数据分析师', '知乎/公众号', '激活率', 'confirmed', 5, 1],
    ['HYP-002', '录屏实操类视频激活转化显著高于口播观点类', '运营/商品', '抖音', '播放→激活', 'confirmed', 3, 0],
    ['HYP-003', '小红书用户更愿意收藏「模板型」内容，且收藏会转化为激活', '数据分析师', '小红书', '收藏→激活', 'confirmed', 2, 0],
    ['HYP-004', '「决策红利」叙事比「AI 提效」叙事更能打动管理者', '业务负责人', '公众号/知乎', '产品页访问质量', 'testing', 0, 0],
    ['HYP-005', '宏观趋势文章能有效驱动产品下载', '全部', '公众号', '阅读→激活', 'rejected', 0, 2],
  ];
  for (const h of hypotheses) {
    run(`INSERT INTO hypotheses (id, statement, audience, platform, metric, status, support, oppose) VALUES (?,?,?,?,?,?,?,?)`, ...h);
  }
  const strategies = [
    ['STR-003', '知乎：问题导向长回答 + 弱营销，激活效率最高', '数据分析师 · 认知/考虑阶段 · 知乎', '结论前置，品牌只在结尾出现一次，评论区置顶放下载链接', '阅读→激活 1.0%（平台均值 3 倍）', '回答被判定营销限流时改用纯干货版', 3],
    ['STR-007', '小红书：收藏型卡片 + 评论口令领模板', '数据分析师/运营 · 考虑阶段 · 小红书', '10 页 3:4 卡片，末页引导评论「模板」，人工回专属链接', '收藏率 17.9%，收藏→激活 6.4%', '口令评论超过日处理上限时改为主页链接', 2],
    ['STR-011', '公众号深度文：案例放第 4 段，CTA 双点布置', '业务负责人 · 认知阶段 · 公众号', '观点铺垫 3 段后给真实案例；文中「阅读原文」+ 文末二维码双 CTA', '读完率 41%，产品页访问率 6.0%', '无已授权案例时整篇降级为方法文章', 4],
  ];
  for (const s of strategies) {
    run(`INSERT INTO strategies (id, title, conditions, practice, effect, failure_condition, evidence_windows) VALUES (?,?,?,?,?,?,?)`, ...s);
  }
  run(`INSERT INTO library_proposals (kind, payload) VALUES
    ('strategy_promote', '{"hypothesis":"录屏实操类视频激活转化显著高于口播观点类","evidence":"连续 2 条内容、3 个独立证据窗口，激活效率稳定在均值 2 倍以上","action":"promote_to_strategy"}'),
    ('hypothesis_new', '{"statement":"CTA 置于正文第 2 屏比置于文末提升产品页点击","audience":"全部","platform":"公众号","metric":"产品页点击率","suggested_experiment":"EXP 正式验证"}')`);

  // 评论与线索
  const community = [
    ['zhihu', '某连锁零售企业 IT 负责人', '我们 12 人的数据分析团队，每个人都在自己电脑上跑分析，结论对不上口径。你们支持团队共享分析模板和统一指标口径吗？另外我们有私有化部署的要求，能聊聊吗？', 'enterprise_lead', '这是典型 C2B 信号（团队共享 + 私有化）。建议：标记为企业线索，由你亲自私信约访谈。', 'high'],
    ['wechat', '公众号读者', '我们部门 4 个人都在用 Xanthil，能不能把一个人的分析结论直接分享给同事复核？现在都是截图发群里，很麻烦。', 'team_signal', '谢谢反馈！多人协作复核正是我们在规划的方向。方便的话想请你聊聊具体场景（15 分钟就够）。', 'high'],
    ['xiaohongshu', '小红书用户', '导入 Excel 之后日期格式识别错了，01/02 被当成 1 月 2 日，但我们其实是 2 月 1 日，怎么改？', 'product_question', '在导入向导第二步点「日期格式」，把 DD/MM 改成你的格式就行。如果整列都识别错了，也可以选中列头右键→重新解析。', 'normal'],
    ['douyin', '抖音观众', '要是能直接连我们公司的 MySQL 就好了，每次导出再导入太麻烦。', 'feature_request', null, 'normal'],
    ['zhihu', '知乎用户', '「决策候选」说到底不还是 AI 给个答案？有什么本质区别？我持怀疑态度。', 'objection', '你的怀疑很合理。区别在于：答案只有一个，而决策候选是多个、各自带证据和适用条件、可以被你证伪的——最终决定权在你手里。欢迎试用后接着挑刺。', 'normal'],
  ];
  for (const c of community) {
    run(`INSERT INTO community_items (platform, author, body, category, draft_reply, priority) VALUES (?,?,?,?,?,?)`, ...c);
  }

  // 选题候选
  const topics = [
    ['TPC-001', '企业数据不敢发给云端大模型，怎么做 AI 数据分析？', { campaign_id: 'CAM-2026-004', strategy: 'S1 痛点切入', objective: 'O2_激活', persona: '数据分析师（已用 AI、担心数据安全）', user_problem: '企业数据不能直接发送给云端大模型', suggested_thesis: 'LLM 负责理解与生成代码，原始数据留在本地执行', formats: ['知乎长回答', '小红书收藏卡片'], expected_metrics: { product_page: 800, download: 120, activated: 40 }, cost: '低', risk: '低', sources: ['搜索问题 ×14', '用户评论 ×6'], rationale: '「数据分析 不上传 隐私」搜索量 30 天上升 62%；同主题内容带来过 19 个激活。' }],
    ['TPC-002', '「分析报告发给老板后没人行动」——决策的最后一公里', { campaign_id: 'CAM-2026-003', strategy: 'S1 痛点切入', objective: 'O1_认知', persona: '业务负责人、运营经理', user_problem: '报告只给结论，不给可比较的行动候选', suggested_thesis: '好分析的产出不是结论，而是带证据的决策候选', formats: ['公众号深度文章', '抖音 60 秒口播'], expected_metrics: { reads: 5000, product_page: 400 }, cost: '中', risk: '中', sources: ['产品反馈 ×4', '行业事件 ×1'], rationale: '评论中「报告没人行动」出现频次本周第 2；需补 2 个已授权案例。' }],
  ];
  for (const [id, title, payload] of topics) {
    run(`INSERT INTO topics (id, title, payload) VALUES (?, ?, ?)`, id, title, JSON.stringify(payload));
  }

  console.log('Seed 完成：CAM-2026-003/004/005，CNT-2026-0014（决策红利，待裁判），双库与评论示例已就绪。');
}

seed();
