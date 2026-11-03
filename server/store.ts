import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Run, TreeNode } from '../shared/types'

export class Store {
  db: DatabaseSync
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(join(directory, 'forge.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, payload TEXT NOT NULL);`)
    for (const run of this.runs()) {
      if (['queued', 'running'].includes(run.status)) {
        run.status = 'failed'
        run.error = '本地服务已重启，请重试任务'
        for (const step of run.steps) if (step.status === 'running') step.status = 'failed'
        this.saveRun(run)
      }
    }
  }
  nodes(): TreeNode[] { return this.db.prepare('SELECT payload FROM nodes').all().map(row => JSON.parse(String(row.payload))) }
  node(id: string): TreeNode | undefined { const row = this.db.prepare('SELECT payload FROM nodes WHERE id=?').get(id); return row ? JSON.parse(String(row.payload)) : undefined }
  saveNode(node: TreeNode) { this.db.prepare('INSERT OR REPLACE INTO nodes VALUES (?,?)').run(node.id, JSON.stringify(node)) }
  deleteNode(id: string) { this.db.prepare('DELETE FROM nodes WHERE id=?').run(id) }
  runs(): Run[] { return this.db.prepare('SELECT payload FROM runs ORDER BY rowid DESC').all().map(row => JSON.parse(String(row.payload))) }
  run(id: string): Run | undefined { const row = this.db.prepare('SELECT payload FROM runs WHERE id=?').get(id); return row ? JSON.parse(String(row.payload)) : undefined }
  saveRun(run: Run) { this.db.prepare('INSERT INTO runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(run.id, JSON.stringify(run)) }
  close() { this.db.close() }
}
