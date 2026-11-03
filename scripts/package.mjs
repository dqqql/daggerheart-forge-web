import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const output = resolve('release')
mkdirSync(output, { recursive: true })
const stage = join(output, `stage-${Date.now()}`)
mkdirSync(stage)
const skill = 'skills/daggerheart-adversary-forge'
const zip = (source, destination) => {
  const result = process.platform === 'win32'
    ? spawnSync('pwsh', ['-NoProfile', '-Command', 'Compress-Archive -LiteralPath $env:FORGE_ARCHIVE_SOURCE -DestinationPath $env:FORGE_ARCHIVE_DESTINATION -Force'], { stdio: 'inherit', env: { ...process.env, FORGE_ARCHIVE_SOURCE: source, FORGE_ARCHIVE_DESTINATION: destination } })
    : spawnSync('zip', ['-qr', destination, source.split('/').at(-1)], { cwd: resolve(source, '..'), stdio: 'inherit' })
  if (result.status !== 0) throw Error('Archive creation failed')
}
const hashes = []
function archive(source, name) {
  const path = join(output, name + '.zip')
  zip(source, path)
  hashes.push(`${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${name}.zip`)
}
cpSync(skill, join(stage, 'daggerheart-adversary-forge'), { recursive: true })
archive(join(stage, 'daggerheart-adversary-forge'), `daggerheart-adversary-forge-${version}`)

const app = join(stage, 'daggerheart-forge')
mkdirSync(app)
for (const path of ['dist', 'build', 'skills', 'README.md', 'LICENSE', 'NOTICE.md', 'docs']) cpSync(path, join(app, path), { recursive: true })
mkdirSync(join(app, 'scripts'))
copyFileSync('scripts/import-cloud.mjs', join(app, 'scripts/import-cloud.mjs'))
copyFileSync('scripts/launch.mjs', join(app, 'scripts/launch.mjs'))
writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'daggerheart-forge', version, private: true, type: 'module', scripts: { start: 'node build/server.mjs' }, engines: { node: '>=22.14' } }, null, 2))
writeFileSync(join(app, 'start.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nif exist node.exe (set "NODE=node.exe") else (set "NODE=node")\r\n"%NODE%" --version >nul 2>&1\r\nif errorlevel 1 (echo Please install Node.js 22.14 or later. & pause & exit /b 1)\r\n"%NODE%" scripts\\launch.mjs\r\npause\r\n')
// Collect actual dependency license files from the production dependency tree.
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const notices = []
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path || pkg.dev || !existsSync(path)) continue
  const licenses = readdirSync(path).filter(name => /^(license|licence|copying|notice)(\.|$)/i.test(name))
  notices.push(`\n=== ${path} ${pkg.version} (${pkg.license || 'see package'}) ===\n`)
  for (const name of licenses) notices.push(readFileSync(join(path, name), 'utf8'))
}
writeFileSync(join(app, 'THIRD-PARTY-LICENSES.txt'), notices.join('\n'))
archive(app, `daggerheart-forge-${version}-node`)
if (process.platform === 'win32') {
  copyFileSync(process.execPath, join(app, 'node.exe'))
  const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`)
  if (!response.ok) throw Error('Could not obtain Node.js license')
  writeFileSync(join(app, 'NODE-LICENSE.txt'), await response.text())
  archive(app, `daggerheart-forge-${version}-windows-${process.arch}`)
}
writeFileSync(join(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n')
console.log(`Release packages written to ${output}; runtime ${process.version}`)
