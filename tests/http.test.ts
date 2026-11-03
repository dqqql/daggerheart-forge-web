import { afterAll, beforeAll, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let child: ChildProcess
let directory: string
let base: string
beforeAll(async () => {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address() as { port: number }
  await new Promise<void>(resolve => probe.close(() => resolve()))
  base = `http://127.0.0.1:${address.port}`
  directory = mkdtempSync(join(tmpdir(), 'forge-http-'))
  child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], { env: { ...process.env, PORT: String(address.port), FORGE_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise<void>((resolve, reject) => {
    child.stdout?.on('data', data => { if (String(data).includes(base)) resolve() })
    child.on('exit', code => reject(Error('Server exited: ' + code)))
    child.on('error', reject)
  })
})
afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.on('exit', resolve))
    child.kill(); await exited
  }
  if (directory) rmSync(directory, { recursive: true, force: true })
})
it('requires a local session and rejects cross-site and rebound requests', async () => {
  expect((await fetch(base + '/api/nodes')).status).toBe(401)
  expect((await fetch(base + '/api/session', { headers: { Origin: 'https://example.com' } })).status).toBe(403)
  const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(base + '/api/session', { headers: { Host: 'evil.example.com' } }, response => { response.resume(); resolve(response.statusCode) }).on('error', reject)
  })
  expect(reboundStatus).toBe(403)
  const session = await fetch(base + '/api/session')
  const cookie = session.headers.get('set-cookie')!
  expect(cookie).toContain('HttpOnly; SameSite=Strict')
  expect((await fetch(base + '/api/nodes', { headers: { Cookie: cookie.split(';')[0] } })).status).toBe(200)
  const token = readFileSync(join(directory, '.api-token'), 'utf8')
  expect((await fetch(base + '/api/health', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200)
  expect((await fetch(base + '/api/nodes', { headers: { Cookie: cookie.split(';')[0], 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
})
