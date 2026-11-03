import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../server/store.ts'
import { createApi } from '../server/api.ts'
import type { Run } from '../shared/types'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
function setup(analyze?: Parameters<typeof createApi>[1]) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-test-'))
  const store = new Store(dir)
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => store.close())
  const api = createApi(store, analyze)
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await api(new Request('http://127.0.0.1/api/' + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
    return { status: response.status, body: await response.json() as any }
  }
  return { dir, store, call }
}
async function settle(store: Store, id: string) {
  for (let i = 0; i < 100; i++) {
    const run = store.run(id)!
    if (['done', 'failed'].includes(run.status)) return run
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw Error('Task did not settle')
}

describe('local workspace', () => {
  it('persists drafts and rejects folder cycles without modifying the tree', async () => {
    const { store, call } = setup()
    const parent = (await call('nodes', 'POST', { kind: 'folder', name: '父目录' })).body.id
    const child = (await call('nodes', 'POST', { kind: 'folder', name: '子目录', parent_id: parent })).body.id
    expect((await call('nodes/' + parent, 'PATCH', { parent_id: child })).status).toBe(400)
    const id = (await call('nodes', 'POST', { kind: 'file', name: '敌人.md', parent_id: child })).body.id
    await call('nodes/' + id, 'PATCH', { content: '# 原始敌人\n中文内容' })
    expect(store.node(id)?.content).toContain('中文内容')
    expect((await call('nodes/' + id)).body.node.content).toContain('中文内容')
    await call('nodes/' + parent, 'DELETE')
    expect(store.nodes()).toHaveLength(0)
  })
  it('captures immutable snapshots, retries only incomplete steps and keeps keys out of exports', async () => {
    const seen: number[] = []
    let fail = true
    const { store, call } = setup(async (step, run, results) => {
      seen.push(step)
      expect(run.snapshot).toBe('original')
      expect(results).toHaveLength(step - 1)
      if (step === 3 && fail) { fail = false; throw Error('simulated outage') }
      return { step }
    })
    const id = (await call('nodes', 'POST', { kind: 'file', name: 'enemy.md' })).body.id
    await call('nodes/' + id, 'PATCH', { content: 'original' })
    await call('key', 'PUT', { key: 'test-key-1234567890' })
    const runId = (await call('runs', 'POST', { file_id: id })).body.id
    await call('nodes/' + id, 'PATCH', { content: 'changed' })
    expect((await settle(store, runId)).status).toBe('failed')
    expect((await call('runs/' + runId + '/retry', 'POST')).status).toBe(202)
    expect((await settle(store, runId)).status).toBe('done')
    expect(seen).toEqual([1, 2, 3, 3, 4, 5, 6])
    expect(JSON.stringify((await call('export')).body)).not.toContain('test-key')
    await call('key', 'DELETE')
    expect((await call('key')).body.configured).toBe(false)
    expect((await call('runs', 'POST', { file_id: id })).status).toBe(400)
  })
  it('recovers interrupted jobs and reads content after reopening SQLite', () => {
    const { dir, store } = setup()
    store.saveNode({ id: 'file', name: '测试.md', kind: 'file', content: 'saved', parent_id: null, updated_at: new Date().toISOString() })
    store.saveRun({ id: 'run', file_id: 'file', status: 'running', current_step: 2, error: null, snapshot: 'saved', created_at: new Date().toISOString(), steps: [{ step: 1, status: 'done', result: { ok: true }, error: null }, { step: 2, status: 'running', result: null, error: null }] } as Run)
    const reopened = new Store(dir)
    expect(reopened.node('file')?.content).toBe('saved')
    expect(reopened.run('run')?.status).toBe('failed')
    expect(reopened.run('run')?.steps[0].result).toEqual({ ok: true })
    reopened.close()
  })
})
