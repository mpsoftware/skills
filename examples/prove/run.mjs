#!/usr/bin/env node
// End-to-end example for the prove scripts: serves the example app, captures the
// "before" (?variant=old) and "after" states, and compares them twice:
// before vs after must differ, after vs a second after capture must be identical.
// Run from the repository root after `npm ci`: npm run example:prove
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const scripts = fileURLToPath(new URL('../../skills/prove/scripts/', import.meta.url))
const page = readFileSync(join(here, 'app', 'index.html'))

const server = createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/index.html') return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`

const work = mkdtempSync(join(tmpdir(), 'prove-example-'))
const flow = JSON.parse(readFileSync(join(here, 'flow.json'), 'utf8'))
// Async, so the server in this process keeps answering while a script runs.
const node = (script, args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(scripts, script), ...args])
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (status) => resolve({ status, stdout, stderr }))
})

async function capture(name, query = '') {
  const flowPath = join(work, `${name}.flow.json`)
  writeFileSync(flowPath, JSON.stringify({
    ...flow, baseUrl, steps: flow.steps.map((step) => (step.goto ? { goto: step.goto + query } : step)),
  }))
  const result = await node('capture.mjs', [flowPath, join(work, name)])
  if (result.status !== 0) throw new Error(`capture ${name} failed:\n${result.stdout}${result.stderr}`)
  return join(work, name)
}

let failed = false
try {
  const before = await capture('before', '?variant=old')
  const after = await capture('after')
  const again = await capture('after-again')
  const changed = await node('compare.mjs', [before, after, join(work, 'diff-change')])
  const stable = await node('compare.mjs', [after, again, join(work, 'diff-stable')])
  console.log(`before vs after (exit ${changed.status}, expected 1):\n${changed.stdout}`)
  console.log(`after vs after again (exit ${stable.status}, expected 0):\n${stable.stdout}`)
  failed = changed.status !== 1 || stable.status !== 0
  console.log(`Captures and diffs: ${work}`)
} finally {
  server.close()
}
process.exit(failed ? 1 : 0)
