#!/usr/bin/env node
// Pixel comparison of two capture directories for a "no visible change" claim.
// Pairs PNG files by name, counts differing pixels with the project's installed
// pixelmatch and pngjs, and writes a diff image for every pair that differs.
//
//   node <skill-dir>/scripts/compare.mjs <base-dir> <head-dir> <diff-dir> [--threshold 0] [--json]
//
// Exit codes: 0 every pair identical (at least one pair), 1 any difference,
// missing pair or empty set, 2 usage or tool error.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function usage(message) {
  if (message) console.error(message)
  console.error('usage: compare.mjs <base-dir> <head-dir> <diff-dir> [--threshold <0..1>] [--json]')
  process.exit(2)
}

const positional = []
let threshold = 0
let json = false
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--json') json = true
  else if (args[i] === '--threshold') {
    threshold = Number(args[++i])
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) usage('--threshold must be a number from 0 to 1.')
  } else if (args[i].startsWith('--')) usage(`unknown option ${args[i]}`)
  else positional.push(args[i])
}
if (positional.length !== 3) usage()
const [baseDir, headDir, diffDir] = positional.map((dir) => resolve(dir))

// Resolve the tools from the working directory, so the project's versions are used.
async function load(name) {
  const require = createRequire(join(process.cwd(), 'noop.js'))
  try {
    const path = require.resolve(name)
    const version = JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version
    return { mod: await import(pathToFileURL(path).href), version }
  } catch {
    usage(`${name} not found. Install pixelmatch and pngjs in the project and run from its root.`)
  }
}

const pngFiles = (dir) => {
  try {
    return readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.png'))
  } catch {
    usage(`cannot read directory ${dir}`)
  }
}

try {
  const pixelmatch = await load('pixelmatch')
  const pngjs = await load('pngjs')
  const match = pixelmatch.mod.default ?? pixelmatch.mod
  const PNG = pngjs.mod.PNG ?? pngjs.mod.default?.PNG

  const base = new Set(pngFiles(baseDir))
  const head = new Set(pngFiles(headDir))
  const names = [...new Set([...base, ...head])].sort()
  mkdirSync(diffDir, { recursive: true })

  const pairs = names.map((name) => {
    if (!base.has(name) || !head.has(name)) {
      return { name, result: 'missing', side: base.has(name) ? 'head' : 'base' }
    }
    const a = PNG.sync.read(readFileSync(join(baseDir, name)))
    const b = PNG.sync.read(readFileSync(join(headDir, name)))
    if (a.width !== b.width || a.height !== b.height) {
      return { name, result: 'size', base: `${a.width}x${a.height}`, head: `${b.width}x${b.height}` }
    }
    const diff = new PNG({ width: a.width, height: a.height })
    const pixels = match(a.data, b.data, diff.data, a.width, a.height, { threshold, includeAA: true })
    if (pixels === 0) return { name, result: 'identical', pixels }
    writeFileSync(join(diffDir, name), PNG.sync.write(diff))
    return { name, result: 'different', pixels, diff: join(diffDir, name) }
  })

  const identical = pairs.filter((pair) => pair.result === 'identical').length
  const passed = pairs.length > 0 && identical === pairs.length
  const summary = {
    tool: `pixelmatch ${pixelmatch.version}, pngjs ${pngjs.version}`,
    threshold,
    includeAA: true,
    identical,
    total: pairs.length,
    passed,
    pairs,
  }
  if (json) console.log(JSON.stringify(summary, null, 2))
  else {
    console.log(`Tool: ${summary.tool}; threshold=${threshold}; antialiasing counted; allowed pixels=0`)
    for (const pair of pairs) {
      const detail = pair.result === 'missing' ? `missing on ${pair.side}`
        : pair.result === 'size' ? `size ${pair.base} -> ${pair.head}`
          : `${pair.pixels} pixels`
      console.log(`  ${pair.result === 'identical' ? '=' : '≠'} ${pair.name}: ${detail}`)
    }
    console.log(pairs.length === 0 ? 'Result: no PNG pairs found; nothing was compared' : `Result: identical: ${identical}/${pairs.length}`)
  }
  process.exit(passed ? 0 : 1)
} catch (err) {
  console.error(`Comparison failed: ${err?.message ?? err}`)
  process.exit(2)
}
