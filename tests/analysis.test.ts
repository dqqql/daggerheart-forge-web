import { afterEach, expect, it, vi } from 'vitest'
import { execute } from '../skills/daggerheart-adversary-forge/scripts/analysis.ts'

afterEach(() => vi.unstubAllGlobals())
it('runs the independent six-step engine with provider responses and preserves authored features', async () => {
  const original = '盾墙 - 被动：当附近有同伴时，获得防御优势。'
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    expect(request.model).toBe('deepseek-chat')
    const [instruction, source] = request.messages[1].content.split('\n输入：')
    const payload = JSON.parse(source)
    let answer: unknown
    if (instruction.startsWith('从 Markdown')) answer = { name: '灰烬门卫', tier: 1, type: '标准', description: '持盾守门的守卫', features: ['模型改写不应覆盖原文'], locked_stats: { difficulty: 12 } }
    else if (instruction.startsWith('从给出的三个')) answer = { reasons: Object.fromEntries(payload.candidates.map((card: any) => [card.id, '同位阶的守卫参照'])) }
    else if (instruction.startsWith('逐项复核')) answer = { rationales: {}, adjustments: {}, warnings: [] }
    else if (instruction.startsWith('逐个原创特性')) answer = { keep: Object.fromEntries(payload.map((group: any) => [group.index, []])) }
    else if (instruction.startsWith('只保留有 SRD')) answer = { keep: [] }
    else throw Error('Unexpected provider request')
    return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] })
  }))
  const run = { snapshot: `# 灰烬门卫\n位阶 1 标准\n- ${original}` }
  const results: any[] = []
  for (let step = 1; step <= 6; step++) results.push(await execute(step, run, results, 'mock-key'))
  expect(results[0].refs).toHaveLength(3)
  expect(results[0].enemy.features).toEqual([original])
  expect(results[1].sample_count).toBeGreaterThan(0)
  expect(results[2].suggestions.difficulty.value).toBe(12)
  expect(results[3].groups[0].original).toBe(original)
  expect(results[5].markdown).toContain(original)
})
