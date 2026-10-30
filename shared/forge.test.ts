import { describe, expect, it } from 'vitest'
import { chineseFeatureName, chineseFeatureText, chineseReferenceReason, cleanFinalCardMarkdown, diceStats, extractMarkdownFeatures, finalCard, matchFeatures, normalize, recommend, selectReferences, terminology, type Card } from './forge'
import adversaries from '../worker/data/adversaries.json'
import benchmarks from '../worker/data/benchmarks.json'

const cards=adversaries as Card[]
const bench=benchmarks as Record<string,any>
describe('敌人锻造数据边界',()=>{
  const enemy=normalize({name:'灰烬门卫',tier:1,type:'标准',description:'持盾守门的守卫',motives_tactics:'阻挡闯入者，掩护同伴',features:['盾墙 - 被动：当附近有同伴时，获得防御优势。'],locked_stats:{difficulty:12}})
  it('只从同位阶 SRD 选三个不同参照',()=>{const refs=selectReferences(enemy,cards);expect(refs).toHaveLength(3);expect(new Set(refs.map(r=>r.card.id)).size).toBe(3);expect(refs.every(r=>r.card.tier===1&&r.card.source_status==='srd')).toBe(true)})
  it('尊重锁定数值并生成可核验骰式',()=>{const refs=selectReferences(enemy,cards),recs=recommend(enemy,refs,bench['1:standard'],cards);expect(recs.difficulty.value).toBe(12);expect(recs.difficulty.locked).toBe(true);expect(diceStats(recs.attack_formula.value)).toEqual(recs.attack_formula.stats);expect(finalCard(enemy,recs)).toContain('盾墙 - 被动')})
  it('特性匹配只引用 SRD，术语建议保留原文',()=>{const matches=matchFeatures(enemy,cards);expect(matches).toHaveLength(1);expect(matches[0].matches.length).toBeLessThanOrEqual(3);expect(matches[0].matches.every(m=>cards.some(c=>c.id===m.adversary_id&&c.source_status==='srd'))).toBe(true);expect(terminology(matches)).toEqual([])})
  it('拒绝无效锁定骰式',()=>expect(()=>normalize({name:'测试',tier:1,type:'标准',locked_stats:{attack_formula:'1x6'}})).toThrow())
  it('保留模型对象特性与 Markdown 原文，避免转换成对象占位符',()=>{const markdown='**坚韧厚皮 - 被动：** 当土龙受到物理伤害时，伤害减少 3。\n\n**猛咬 - 动作：** 成功时，花费 1 恐惧点。';expect(extractMarkdownFeatures(markdown)).toEqual(['坚韧厚皮 - 被动：当土龙受到物理伤害时，伤害减少 3。','猛咬 - 动作：成功时，花费 1 恐惧点。']);const parsed=normalize({name:'青年土龙兽',tier:1,type:'斗士',features:[{name:'坚韧厚皮',kind:'被动',description:'伤害减少 3。'}]});expect(parsed.features).toEqual(['坚韧厚皮 - 被动： 伤害减少 3。']);expect(parsed.features).not.toContain('[object Object]')})
  it('参考与特性展示清除英文残留和中文间异常空格',()=>{expect(chineseReferenceReason('同为 tier 1 bruiser，其战斗职责相近。')).toBe('同为1阶斗士，其战斗职责相近。');expect(chineseFeatureName('集群 Horde (2d6+5)')).toBe('集群');expect(chineseFeatureText('嘲讽打击 Goading Strike - 动作：对一个 目标 进行 普通攻击 。标记 1 压力点。')).toBe('对一个目标进行普通攻击。标记1压力点。');expect(cleanFinalCardMarkdown('## 特性\n\n- 嘲讽打击 Goading Strike - 动作：对一个 目标 进行 普通攻击 。')).toBe('## 特性\n\n- 嘲讽打击 - 动作：对一个目标进行普通攻击。')})
})
