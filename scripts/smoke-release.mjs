// Run after extracting a release: node scripts/smoke-release.mjs <app-directory>
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const directory = resolve(process.argv[2])
const node = existsSync(join(directory, 'node.exe')) ? join(directory, 'node.exe') : process.execPath
const port = '18787'
const base = 'http://127.0.0.1:' + port
let child
async function start() {
  child = spawn(node, ['build/server.mjs'], { cwd: directory, env: { ...process.env, PORT: port, FORGE_DATA_DIR: join(directory, 'smoke-data'), DEEPSEEK_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((resolve, reject) => {
    child.stdout.on('data', data => { if (String(data).includes(base)) resolve() })
    child.on('exit', code => reject(Error('Server exited: ' + code)))
    child.on('error', reject)
  })
}
async function stop() { if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited } }
let cookie
async function session() { cookie = (await fetch(base + '/api/session')).headers.get('set-cookie').split(';')[0] }
async function api(path, method = 'GET', data) {
  const response = await fetch(base + '/api/' + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
  assert(response.ok, `API ${method} ${path}: ${response.status}`)
  return response.json()
}
try {
  await start(); await session()
  assert.match(await (await fetch(base)).text(), /敌人锻炉/)
  assert.equal((await fetch(base + '/api/nodes')).status, 401)
  const file = await api('nodes', 'POST', { kind: 'file', name: '发布包测试.md' })
  await api('nodes/' + file.id, 'PATCH', { content: '# 测试\n中文往返保存' })
  await api('key', 'PUT', { key: 'smoke-test-key-123456789' })
  await stop(); await start(); await session()
  assert.equal((await api('nodes/' + file.id)).node.content, '# 测试\n中文往返保存')
  assert.equal((await api('key')).configured, false)
  const skill = join(directory, 'skills/daggerheart-adversary-forge')
  const input = join(directory, 'smoke-input.json')
  const output = join(directory, 'smoke-evidence.json')
  writeFileSync(input, JSON.stringify({ name: '灰烬门卫', tier: 1, type: '标准', description: '持盾守卫', locked_stats: { difficulty: 12 } }))
  const cli = spawnSync(node, ['--experimental-strip-types', join(skill, 'scripts/cli.ts'), '--input', input, '--output', output], { cwd: skill, encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  const evidence = JSON.parse(readFileSync(output, 'utf8'))
  assert.equal(evidence.refs.length, 3)
  assert.equal(evidence.suggestions.difficulty.value, 12)
  console.log('Extracted release passed: UI assets, API, persistence, key clearing, independent skill CLI.')
} finally { await stop() }
