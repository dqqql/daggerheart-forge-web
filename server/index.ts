import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from './store.ts'
import { createApi } from './api.ts'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const directory = resolve(process.env.FORGE_DATA_DIR || resolve(root, 'data'))
const port = Number(process.env.PORT || 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be between 1 and 65535')
const token = randomBytes(32).toString('hex')
const equal = (value: string) => Buffer.byteLength(value) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(value), Buffer.from(token))
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || ''
    if (!allowedHosts.has(host)) { res.writeHead(403).end('Invalid Host'); return }
    const url = new URL(req.url || '/', `http://${host}`)
    const origin = req.headers.origin
    const devOrigin = process.env.FORGE_DEV === '1' ? ['http://127.0.0.1:5173', 'http://localhost:5173'] : []
    if ((origin && origin !== url.origin && !devOrigin.includes(origin)) || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403).end('Invalid Origin'); return }
    if (url.pathname === '/api/session' && req.method === 'GET') {
      res.writeHead(200, { 'Set-Cookie': `forge_local=${token}; HttpOnly; SameSite=Strict; Path=/`, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"ok":true}')
      return
    }
    if (url.pathname.startsWith('/api/')) {
      const bearer = req.headers.authorization?.replace(/^Bearer /, '') || ''
      const cookie = req.headers.cookie?.match(/(?:^|;\s*)forge_local=([^;]+)/)?.[1] || ''
      if (!equal(bearer) && !equal(cookie)) { res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"本地会话已失效，请刷新页面"}'); return }
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 1048576) { res.writeHead(413).end('Request too large'); return }
        chunks.push(chunk)
      }
      const body = Buffer.concat(chunks)
      const response = await api(new Request(url, { method: req.method, headers: { 'Content-Type': 'application/json' }, ...(!['GET', 'HEAD'].includes(req.method || 'GET') && body.length ? { body } : {}) }))
      res.writeHead(response.status, { ...Object.fromEntries(response.headers), 'Cache-Control': 'no-store' }).end(Buffer.from(await response.arrayBuffer()))
      return
    }
    if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405).end(); return }
    const base = resolve(root, 'dist')
    const path = resolve(base, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    if (!path.startsWith(base + sep) || !existsSync(path) || !statSync(path).isFile()) { res.writeHead(404).end('Not found'); return }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600' })
    res.end(req.method === 'HEAD' ? undefined : readFileSync(path))
  } catch { res.writeHead(500).end('Local server error') }
})
// Bind before opening SQLite so a second launch on the same port cannot mark
// the first process's running jobs as interrupted or replace its API token.
await new Promise<void>((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, '127.0.0.1', resolve)
})
const store = new Store(directory)
const api = createApi(store)
writeFileSync(resolve(directory, '.api-token'), token, { mode: 0o600 })
console.log(`敌人锻炉：http://127.0.0.1:${port}\n本地数据：${directory}\n按 Ctrl+C 关闭服务。`)
server.on('error', error => { console.error(error.message); store.close(); process.exit(1) })
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { store.close(); process.exit(0) })
