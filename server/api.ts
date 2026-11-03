import { randomUUID } from 'node:crypto'
import type { Run } from '../shared/types'
import { execute } from '../skills/daggerheart-adversary-forge/scripts/analysis.ts'
import { Store } from './store.ts'

const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (message: string, status = 400) => json({ error: message }, status)
const validName = (name: unknown): name is string => typeof name === 'string' && !!name.trim() && name.trim().length <= 100 && !/[\\/\x00-\x1f]/.test(name)

type Analyze = (step: number, run: { snapshot: string }, results: any[], key: string) => Promise<unknown>
export function createApi(store: Store, analyze: Analyze = execute) {
  let key = process.env.DEEPSEEK_API_KEY || ''
  let queue = Promise.resolve()
  const schedule = (run: Run) => {
    // Capture the key for this task, never persist it in the database.
    const taskKey = key
    queue = queue.then(async () => {
      const results: any[] = []
      try {
        run.status = 'running'
        for (const step of run.steps) {
          if (step.status === 'done') { results.push(step.result); continue }
          run.current_step = step.step
          step.status = 'running'
          step.error = null
          store.saveRun(run)
          try {
            step.result = await analyze(step.step, run, results, taskKey)
            step.status = 'done'
            results.push(step.result)
            store.saveRun(run)
          } catch (error) {
            step.status = 'failed'
            step.error = error instanceof Error ? error.message : '分析失败'
            throw error
          }
        }
        run.status = 'done'
      } catch (error) {
        run.status = 'failed'
        run.error = error instanceof Error ? error.message : '分析失败'
      }
      store.saveRun(run)
    }).catch(error => console.error('Task storage failure:', error.message))
  }

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url)
      const p = url.pathname.slice(5).split('/').filter(Boolean)
      const method = request.method
      const body = async () => {
        const value = await request.json()
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('请求格式错误')
        return value as Record<string, unknown>
      }
      if (p[0] === 'health' && method === 'GET') return json({ ok: true, mode: 'local' })
      if (p[0] === 'key' && p.length === 1) {
        if (method === 'GET') return json({ configured: !!key })
        if (method === 'DELETE') { key = ''; return json({ configured: false }) }
        if (method === 'PUT') {
          const x = await body()
          if (typeof x.key !== 'string' || x.key.trim().length < 16 || x.key.length > 256) return fail('API Key 格式不正确')
          key = x.key.trim()
          return json({ configured: true })
        }
      }
      if (p[0] === 'export' && method === 'GET') return json({ version: 1, nodes: store.nodes(), runs: store.runs() })
      if (p[0] === 'nodes') {
        if (p.length === 1 && method === 'GET') return json({ nodes: store.nodes().map(({ content: _, ...node }) => node) })
        if (p.length === 1 && method === 'POST') {
          const x = await body()
          if (!validName(x.name) || !['file', 'folder'].includes(String(x.kind))) return fail('名称或类型无效')
          const parent = x.parent_id ? store.node(String(x.parent_id)) : null
          if (x.parent_id && parent?.kind !== 'folder') return fail('目标文件夹不存在')
          const id = randomUUID()
          store.saveNode({ id, kind: x.kind as 'file' | 'folder', name: x.name.trim(), parent_id: parent?.id || null, content: '', updated_at: new Date().toISOString() })
          return json({ id }, 201)
        }
        const node = store.node(p[1])
        if (!node) return fail('文件不存在', 404)
        if (p.length === 2 && method === 'GET') return json({ node })
        if (p.length === 2 && method === 'PATCH') {
          const x = await body()
          if (x.name !== undefined && !validName(x.name)) return fail('名称无效')
          if (x.content !== undefined && (node.kind !== 'file' || typeof x.content !== 'string' || x.content.length > 200000)) return fail('文件内容无效')
          if (x.parent_id !== undefined) {
            if (x.parent_id !== null && typeof x.parent_id !== 'string') return fail('目标文件夹无效')
            const target = x.parent_id ? store.node(x.parent_id) : null
            if (x.parent_id && target?.kind !== 'folder') return fail('目标文件夹不存在')
            let cursor = target
            while (cursor) {
              if (cursor.id === node.id) return fail('不能移入自身或子文件夹')
              cursor = cursor.parent_id ? store.node(cursor.parent_id) : undefined
            }
            node.parent_id = target?.id || null
          }
          if (typeof x.name === 'string') node.name = x.name.trim()
          if (typeof x.content === 'string') node.content = x.content
          node.updated_at = new Date().toISOString()
          store.saveNode(node)
          return json({ ok: true })
        }
        if (p.length === 2 && method === 'DELETE') {
          const ids = new Set([node.id])
          const nodes = store.nodes()
          for (const id of ids) for (const child of nodes) if (child.parent_id === id) ids.add(child.id)
          for (const id of ids) store.deleteNode(id)
          return json({ ok: true })
        }
      }
      if (p[0] === 'runs') {
        if (p.length === 1 && method === 'GET') {
          const file = url.searchParams.get('file')
          if (!file) return fail('缺少文件')
          return json({ runs: store.runs().filter(run => run.file_id === file).slice(0, 20).map(({ steps: _, snapshot: __, ...run }) => run) })
        }
        if (p.length === 1 && method === 'POST') {
          const x = await body(), file = store.node(String(x.file_id || ''))
          if (file?.kind !== 'file') return fail('文件不存在', 404)
          if (!key) return fail('请先设置 DeepSeek API Key')
          const run: Run = { id: randomUUID(), file_id: file.id, snapshot: file.content || '', status: 'queued', current_step: 0, error: null, created_at: new Date().toISOString(), steps: Array.from({ length: 6 }, (_, i) => ({ step: i + 1, status: 'pending', result: null, error: null })) }
          store.saveRun(run)
          schedule(run)
          return json({ id: run.id }, 202)
        }
        const run = store.run(p[1])
        if (!run) return fail('任务不存在', 404)
        if (p.length === 2 && method === 'GET') return json({ run })
        if (p.length === 3 && p[2] === 'retry' && method === 'POST') {
          if (run.status !== 'failed') return fail('只有失败任务可以重试')
          if (!key) return fail('请先设置 DeepSeek API Key')
          run.status = 'queued'; run.error = null
          store.saveRun(run)
          schedule(run)
          return json({ ok: true }, 202)
        }
      }
      return fail('接口不存在', 404)
    } catch (error) {
      return fail(error instanceof Error ? error.message : '请求失败')
    }
  }
}
