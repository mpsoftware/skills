// Runs compare.mjs against generated PNGs. Needs pixelmatch and pngjs resolvable
// from the working directory (the repository's dev dependencies).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const compare = fileURLToPath(new URL('./compare.mjs', import.meta.url))
const { PNG } = createRequire(join(process.cwd(), 'noop.js'))('pngjs')

function png(width, height, paint = () => [255, 255, 255]) {
  const image = new PNG({ width, height })
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const [r, g, b] = paint(x, y)
      image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = 255
    }
  }
  return PNG.sync.write(image)
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'prove-compare-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dirs = { base: join(root, 'base'), head: join(root, 'head'), diff: join(root, 'diff') }
  mkdirSync(dirs.base)
  mkdirSync(dirs.head)
  return {
    ...dirs,
    write: (side, name, data) => writeFileSync(join(dirs[side], name), data),
    run: (...extra) => spawnSync(process.execPath, [compare, dirs.base, dirs.head, dirs.diff, ...extra], {
      cwd: process.cwd(), encoding: 'utf8',
    }),
  }
}

test('identical pairs pass with identical: N/N', (t) => {
  const f = fixture(t)
  for (const name of ['desktop.png', 'mobile.png']) {
    f.write('base', name, png(8, 8))
    f.write('head', name, png(8, 8))
  }
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /threshold=0; antialiasing counted/)
  assert.match(result.stdout, /Result: identical: 2\/2/)
})

test('a single changed pixel fails and writes a diff image', (t) => {
  const f = fixture(t)
  f.write('base', 'desktop.png', png(8, 8))
  f.write('head', 'desktop.png', png(8, 8, (x, y) => (x === 3 && y === 4 ? [250, 255, 255] : [255, 255, 255])))
  const result = f.run('--json')
  assert.equal(result.status, 1)
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.passed, false)
  assert.deepEqual(summary.pairs.map((pair) => [pair.name, pair.result, pair.pixels]), [['desktop.png', 'different', 1]])
  assert.ok(existsSync(join(f.diff, 'desktop.png')))
})

test('size changes and missing pairs fail', (t) => {
  const f = fixture(t)
  f.write('base', 'desktop.png', png(8, 8))
  f.write('head', 'desktop.png', png(8, 9))
  f.write('base', 'only-base.png', png(4, 4))
  const result = f.run()
  assert.equal(result.status, 1)
  assert.match(result.stdout, /desktop\.png: size 8x8 -> 8x9/)
  assert.match(result.stdout, /only-base\.png: missing on head/)
  assert.match(result.stdout, /identical: 0\/2/)
})

test('an empty comparison is not a pass', (t) => {
  const f = fixture(t)
  const result = f.run()
  assert.equal(result.status, 1)
  assert.match(result.stdout, /no PNG pairs found/)
})

test('bad usage exits 2', (t) => {
  const f = fixture(t)
  assert.equal(f.run('--threshold', '2').status, 2)
  assert.equal(f.run('--mask', 'x').status, 2)
  const missing = spawnSync(process.execPath, [compare, f.base], { encoding: 'utf8' })
  assert.equal(missing.status, 2)
})
