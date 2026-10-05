// CLI regressions use isolated command stubs; no git or GitHub writes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publish = fileURLToPath(new URL('./publish-evidence.mjs', import.meta.url))
const head = 'a'.repeat(40)

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'prove-publish-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  const evidence = join(root, 'proof $(touch injected); with spaces')
  const log = join(root, 'calls.jsonl')
  mkdirSync(bin)
  mkdirSync(join(evidence, 'video'), { recursive: true })
  writeFileSync(join(evidence, 'checkout.png'), 'png')
  writeFileSync(join(evidence, 'video', 'run.webm'), 'webm')
  if (options.report !== false) writeFileSync(join(evidence, 'evidence.md'), '# Evidence\n\nAll 2 criteria pass.\n')
  writeFileSync(log, '')
  for (const command of ['git', 'gh']) {
    writeFileSync(join(bin, command), `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
const stdin = args.includes('--body-file') ? readFileSync(0, 'utf8') : undefined;
appendFileSync(process.env.PROVE_TEST_LOG, JSON.stringify({ command: ${JSON.stringify(command)}, args, stdin }) + '\\n');
if (${JSON.stringify(command)} === 'git') {
  if (JSON.stringify(args) !== JSON.stringify(['rev-parse', 'HEAD'])) process.exit(9);
  console.log(${JSON.stringify(head)});
} else if (args[0] === 'repo' && args[1] === 'view') console.log('acme/shop');
else if (args[0] === 'pr' && args[1] === 'view') console.log(${JSON.stringify(options.remoteHead ?? head)});
else if (args[0] === 'pr' && args[1] === 'comment') {
  if (process.env.PROVE_TEST_FAIL === '1') { console.error('SENTINEL_PRIVATE_COMMAND_OUTPUT'); process.exit(1); }
} else process.exit(9);
`, { mode: 0o755 })
  }
  return {
    root,
    evidence,
    run: (args) => spawnSync(process.execPath, [publish, evidence, ...args], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, PATH: bin, PROVE_TEST_LOG: log, PROVE_TEST_FAIL: options.fail ? '1' : '0' },
    }),
    calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  }
}

test('comment publisher posts evidence.md for the exact pushed head', (t) => {
  const f = fixture(t)
  const result = f.run(['acme/shop#123', '--publisher', 'comment'])
  assert.equal(result.status, 0, result.stderr)
  const calls = f.calls()
  assert.deepEqual(calls.map((call) => [call.command, ...call.args]), [
    ['git', 'rev-parse', 'HEAD'],
    ['gh', 'pr', 'view', '123', '--repo', 'acme/shop', '--json', 'headRefOid', '-q', '.headRefOid'],
    ['gh', 'pr', 'comment', '123', '--repo', 'acme/shop', '--body-file', '-'],
  ])
  assert.match(calls[2].stdin, /All 2 criteria pass/)
  assert.match(calls[2].stdin, new RegExp(`Evidence for head ${head}`))
})

test('numeric PR resolves the current repository; dry-run does not publish', (t) => {
  const f = fixture(t)
  const result = f.run(['123', '--publisher', 'comment', '--dry-run'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\[dry-run\] gh pr comment 123 --repo acme\/shop/)
  assert.ok(f.calls().every((call) => call.args[1] !== 'comment'))
})

test('dir publisher copies the whole directory and never overwrites', (t) => {
  const f = fixture(t)
  const out = join(f.root, 'artifacts')
  const target = join(out, `acme-shop-123-${head.slice(0, 12)}`)
  assert.equal(f.run(['123', '--publisher', `dir:${out}`, '--dry-run']).status, 0)
  assert.equal(existsSync(target), false)
  const result = f.run(['123', '--publisher', `dir:${out}`])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readdirSync(target).sort(), ['checkout.png', 'evidence.md', 'video'])
  assert.equal(readFileSync(join(target, 'video', 'run.webm'), 'utf8'), 'webm')
  const again = f.run(['123', '--publisher', `dir:${out}`])
  assert.equal(again.status, 1)
  assert.match(again.stderr, /refusing to overwrite/)
})

test('module publisher receives the context; dry-run loads but does not call it', (t) => {
  const f = fixture(t)
  const marker = join(f.root, 'published.json')
  const module = join(f.root, 'upload-proof.mjs')
  writeFileSync(module, `import { writeFileSync } from 'node:fs'
export default async function publish(context) {
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify(context))
  return { message: 'uploaded', url: 'https://proof.example.test/123' }
}
`)
  assert.equal(f.run(['123', '--publisher', module, '--dry-run']).status, 0)
  assert.equal(existsSync(marker), false)
  const result = f.run(['123', '--publisher', module])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /uploaded\nhttps:\/\/proof\.example\.test\/123/)
  const context = JSON.parse(readFileSync(marker, 'utf8'))
  assert.deepEqual(context, {
    directory: f.evidence, repository: 'acme/shop', number: 123, sha: head,
    files: ['checkout.png', 'evidence.md', join('video', 'run.webm')],
  })
})

test('unpushed local head blocks publication', (t) => {
  const f = fixture(t, { remoteHead: 'b'.repeat(40) })
  const result = f.run(['acme/shop#123', '--publisher', 'comment'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Push before publishing/)
  assert.ok(f.calls().every((call) => call.args[1] !== 'comment'))
})

test('invalid arguments never run anything', (t) => {
  const f = fixture(t)
  for (const args of [
    ['123oops', '--publisher', 'comment'], ['-1', '--publisher', 'comment'], ['acme/shop#0', '--publisher', 'comment'],
    ['123'], ['123', '--publisher', 'upload'], ['123', '--publisher', 'dir:'], ['123', '--publisher', 'comment', '--branch', 'x'],
  ]) {
    const result = f.run(args)
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`)
  }
  assert.deepEqual(f.calls(), [])
})

test('comment publisher without evidence.md fails before posting', (t) => {
  const f = fixture(t, { report: false })
  const result = f.run(['123', '--publisher', 'comment'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /needs evidence\.md/)
  assert.ok(f.calls().every((call) => call.args[1] !== 'comment'))
})

test('publication failures are nonzero and do not echo external output', (t) => {
  const f = fixture(t, { fail: true })
  const result = f.run(['acme/shop#123', '--publisher', 'comment'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Evidence publication failed/)
  assert.doesNotMatch(result.stdout + result.stderr, /SENTINEL_PRIVATE_COMMAND_OUTPUT/)
})

test('missing evidence directory blocks publication', (t) => {
  const f = fixture(t)
  rmSync(f.evidence, { recursive: true })
  const result = f.run(['acme/shop#123', '--publisher', 'comment'])
  assert.equal(result.status, 1)
  assert.deepEqual(f.calls(), [])
})
