import { readFileSync, writeFileSync } from 'node:fs'
import { normalize, selectReferences, recommend, matchFeatures, terminology, finalCard, type Card } from './forge.ts'
import { execute } from './analysis.ts'
import adversaries from '../data/adversaries.json' with { type: 'json' }
import benchmarks from '../data/benchmarks.json' with { type: 'json' }

// No application imports or npm dependencies: this folder can be copied alone.
const args = process.argv.slice(2)
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const input = option('--input')
if (!input || args.includes('--help')) {
  console.log('node --experimental-strip-types scripts/cli.ts --input enemy.json [--output evidence.json] [--analyze]\n默认输出离线证据包；--analyze 输入 Markdown，以 DEEPSEEK_API_KEY 调用六步分析。')
  process.exit(args.includes('--help') ? 0 : 1)
}
try {
  const source = readFileSync(input, 'utf8')
  let result: unknown
  if (args.includes('--analyze')) {
    const key = process.env.DEEPSEEK_API_KEY
    if (!key) throw Error('请设置 DEEPSEEK_API_KEY')
    const results: unknown[] = []
    for (let step = 1; step <= 6; step++) results.push(await execute(step, { snapshot: source }, results, key))
    result = { version: 1, steps: results }
  } else {
    const enemy = normalize(JSON.parse(source))
    const cards = adversaries as Card[]
    const refs = selectReferences(enemy, cards)
    const benchmark = (benchmarks as Record<string, any>)[`${enemy.tier}:${enemy.type}`]
    const suggestions = recommend(enemy, refs, benchmark, cards)
    const groups = matchFeatures(enemy, cards)
    result = { version: 1, needs_review: true, enemy, refs, benchmark, suggestions, groups, terminology: terminology(groups), markdown: finalCard(enemy, suggestions) }
  }
  const output = JSON.stringify(result, null, 2) + '\n'
  const file = option('--output')
  if (file) writeFileSync(file, output, 'utf8')
  else process.stdout.write(output)
} catch (error) { console.error(error instanceof Error ? error.message : '处理失败'); process.exit(1) }
