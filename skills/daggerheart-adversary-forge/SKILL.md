---
name: daggerheart-adversary-forge
description: 为匕首之心原创敌人补数值、检索 SRD 参照和相似特性、审阅术语并输出 Markdown 数据块。支持独立离线证据检索或 DeepSeek 六步分析，无需网页工程。
---

# 匕首之心敌人锻炉

保留作者的名称、叙述、动机战术、特性全文和锁定数值。数值为创作建议，不能称为官方强制标准；中文快照不代表出版方认证的官方中文译名。

本目录是完整独立 skill。Node.js 22.14+ 可直接运行，无需 npm install、账号、Cloudflare 或外层工程。软件与文档许可见 [LICENSE](LICENSE)，参考数据来源见 [NOTICE](NOTICE.md)。

## 工作流程

1. 将输入整理为 JSON，字段与输出结构见[输入输出契约](references/contract.md)。缺失的创作事实留空；纯文本输入先提取，不虚构。Markdown 也可直接用于下述 API 模式。
2. 在本目录执行离线检索：

   ```powershell
   node --experimental-strip-types .\scripts\cli.ts --input .\enemy.json --output .\evidence.json
   ```

3. 审阅证据包中的三个同位阶 SRD 参照，结合描述、战术、普通攻击和特性分别判断各项数值。锁定值不可覆盖；融合区间是设计参考。特殊动作的射程、伤害类型不能直接当作普通攻击依据；证据不足时说明暂定。骰式要检查最低、期望、最高值；固定伤害数字同样有效。
4. 逐特性核对触发、成本、范围、状态、移动、伤害结构。候选相似度不足时返回空匹配，不硬凑；检索分数不是官方相似度。术语建议只能使用可追溯的相近 SRD 原文作证据，不补造命中条件、目标、范围或伤害类型。
5. 按六步输出：官方怪物参考 → 推荐区间 → 推荐数值及理由与基础数据块 → 特性匹配 → 术语推荐 → 最终完整数据块。理由引用真实敌人名，最终卡片置于最后并保留作者原文。特性匹配引用 SRD 全文，来源 URL 保留在证据中。

## API 模式

环境变量 `DEEPSEEK_API_KEY` 配置后，可用同一套提示词与算法执行六步分析：

```powershell
node --experimental-strip-types .\scripts\cli.ts --input .\enemy.md --analyze --output .\analysis.json
```

这会把文稿和相关参照发送至 DeepSeek；离线证据模式不联网。API 调用失败时返回非零退出码，不把未审阅候选冒充完整结果。结构见[输入输出契约](references/contract.md)。

## 维护边界

`scripts/forge.ts` 是确定性检索、数值初算、术语和卡片生成；`scripts/analysis.ts` 是 API 提示词与六步执行；`data/` 是唯一数据源。外层应用只负责编辑管理、持久化、调度和展示，不在外层维护第二套锻造规则。更新数据须保持 `source_status == "srd"` 的候选边界与来源 URL。
