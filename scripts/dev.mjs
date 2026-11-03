import { context } from 'esbuild'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const probe = createServer()
await new Promise((resolve, reject) => {
  probe.once('error', () => reject(Error('本地端口 8787 已被占用，请先关闭旧服务。')))
  probe.listen(8787, '127.0.0.1', () => probe.close(resolve))
})
const ctx = await context({ entryPoints: ['server/index.ts'], outfile: 'build/server.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22' })
await ctx.rebuild()
await ctx.watch()
const children = [
  spawn(process.execPath, ['--watch', 'build/server.mjs'], { stdio: 'inherit', env: { ...process.env, FORGE_DEV: '1', PORT: '8787' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' }),
]
let closing = false
async function close(code = 0) { if (closing) return; closing = true; for (const child of children) child.kill(); await ctx.dispose(); process.exit(code) }
for (const child of children) child.on('exit', code => close(code || 0))
process.on('SIGINT', () => close())
process.on('SIGTERM', () => close())
