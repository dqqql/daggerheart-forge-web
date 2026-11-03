# 输入输出契约

离线输入为一个 JSON 对象：

```json
{
  "name": "灰烬门卫",
  "tier": 1,
  "type": "标准",
  "description": "持盾守门的守卫",
  "motives_tactics": "阻挡闯入者，掩护同伴",
  "features": ["盾墙 - 被动：当附近有同伴时，获得防御优势。"],
  "locked_stats": {"difficulty": 12}
}
```

`tier` 为 1–4；`type` 为标准、斗士、集群、头目、杂兵、远程、潜伏、社交、独狼、辅助，或对应英文键。可选 `experience`、`attack_name`、`attack_range`、`damage_type`。锁定字段允许 difficulty、threshold_major、threshold_severe、hp、stress、attack_bonus、attack_formula、attack_name、attack_range、damage_type。

Markdown API 输入应包含名称、位阶、类型、描述、动机与战术和特性；特性建议每条一行 `- 名称 - 动作：全文`，支持被动、动作、反应。已填数值会要求模型保留为 locked_stats。

离线证据对象包括 enemy、refs、benchmark、suggestions、groups、terminology、markdown；`needs_review: true` 表示算法候选仍需人工或模型审阅。不要直接声称完成了语义复核。

API 输出 `{ "version": 1, "steps": [...] }`，steps 按顺序包含六个对象：

1. `{enemy, refs}`：规范化敌人与三个参照，参照含 label、card、reason。
2. `{key, sample_count, ranges, notes}`：融合区间及样本信息。
3. `{suggestions, basicCard, warnings}`：数值项含 value、rationale，锁定项含 locked。
4. `{groups}`：逐特性 original、index、matches，空 matches 表示无足够相似候选。
5. `{corrections}`：可选术语修正，不直接覆盖作者文本。
6. `{markdown}`：最终完整卡片，粗体标签与正文之间留空格。

应用 API 的 run.steps 额外包装 step、status、result、error；result 就是上述同一对象。删除界面或服务不会影响本目录的 CLI 和分析逻辑。
