// One-time migration of a trusted D1 SQL export. No cloud credentials are needed.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
const input = process.argv[2]
if (!input) throw Error('Usage: node scripts/import-cloud.mjs <trusted-backup.sql> [data-directory]')
const directory = resolve(process.argv[3] || 'data')
mkdirSync(directory, { recursive: true })
const path = join(directory, 'forge.sqlite')
if (existsSync(path)) throw Error('目标已有数据库；请选择空目录，避免覆盖本地文稿')
const old = new DatabaseSync(':memory:')
old.exec(readFileSync(input, 'utf8'))
const db = new DatabaseSync(path)
db.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE runs (id TEXT PRIMARY KEY, payload TEXT NOT NULL); BEGIN')
let nodes = 0, runs = 0
try {
  for (const row of old.prepare('SELECT id,parent_id,kind,name,content,updated_at FROM nodes').all()) {
    db.prepare('INSERT INTO nodes VALUES (?,?)').run(row.id, JSON.stringify(row)); nodes++
  }
  for (const row of old.prepare('SELECT id,file_id,status,current_step,error,snapshot,created_at FROM runs').all()) {
    const stored = old.prepare('SELECT step,status,result,error FROM run_steps WHERE run_id=? ORDER BY step').all(row.id)
    const legacy = stored.some(step => step.step === 7)
    const steps = stored.filter(step => !legacy || step.step !== 6).map(step => ({ ...step, step: legacy && step.step === 7 ? 6 : step.step, result: step.result ? JSON.parse(step.result) : null }))
    db.prepare('INSERT INTO runs VALUES (?,?)').run(row.id, JSON.stringify({ ...row, current_step: Math.min(Number(row.current_step), 6), steps })); runs++
  }
  db.exec('COMMIT')
} catch (error) { db.exec('ROLLBACK'); throw error }
db.close(); old.close()
console.log(`Imported ${nodes} nodes and ${runs} runs to ${path}. Accounts and API keys were not imported.`)
