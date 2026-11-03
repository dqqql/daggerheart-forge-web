import { spawn } from 'node:child_process'
const child = spawn(process.execPath, ['build/server.mjs'], { stdio: 'inherit' })
let ended = false
child.on('exit', code => { ended = true; process.exit(code || 0) })
process.on('SIGINT', () => child.kill())
process.on('SIGTERM', () => child.kill())
const url = `http://127.0.0.1:${process.env.PORT || 8787}`
for (let i = 0; i < 40 && !ended; i++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) })
    if (response.ok) {
      if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }).unref()
      break
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250))
}
