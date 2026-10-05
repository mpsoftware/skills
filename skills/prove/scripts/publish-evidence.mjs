#!/usr/bin/env node
// Publish an evidence directory for the exact pushed PR head through a
// pluggable publisher. Nothing is committed to the repository.
//
//   node publish-evidence.mjs <evidence-dir> <owner/repo#N|pr-number> --publisher <name> [--dry-run]
//
// Publishers:
//   comment       post evidence.md as a PR comment through gh (text only)
//   dir:<path>    copy the directory to <path>/<owner>-<repo>-<N>-<sha12>
//   <file.mjs>    your own module; its default export receives
//                 { directory, repository, number, sha, files } and returns { message, url? }
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function usage(message) {
  if (message) console.error(message)
  console.error('usage: publish-evidence.mjs <evidence-dir> <owner/repo#N|pr-number> --publisher <comment|dir:<path>|<module.mjs>> [--dry-run]')
  process.exit(2)
}

const positional = []
let publisherArg = null
let dryRun = false
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--dry-run') dryRun = true
  else if (args[i] === '--publisher') publisherArg = args[++i] ?? usage('--publisher needs a value.')
  else if (args[i].startsWith('--')) usage(`unknown option ${args[i]}`)
  else positional.push(args[i])
}
if (positional.length !== 2 || !publisherArg) usage()
const [dir, prArg] = positional

let publisher
if (publisherArg === 'comment') publisher = { kind: 'comment' }
else if (publisherArg.startsWith('dir:') && publisherArg.length > 4) publisher = { kind: 'dir', target: resolve(publisherArg.slice(4)) }
else if (/\.(mjs|js)$/.test(publisherArg)) publisher = { kind: 'module', path: resolve(publisherArg) }
else usage('publisher must be "comment", "dir:<path>" or a path to a .mjs/.js module.')

if (!/^[1-9]\d*$/.test(prArg) && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[1-9]\d*$/.test(prArg)) {
  usage('PR must be owner/repo#N or a positive PR number.')
}

const run = (command, commandArgs, input) => execFileSync(command, commandArgs, {
  encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], input,
}).trim()

function listFiles(root) {
  return readdirSync(root, { recursive: true })
    .map((name) => join(root, name))
    .filter((path) => statSync(path).isFile())
    .map((path) => relative(root, path))
    .sort()
}

try {
  const directory = resolve(dir)
  if (!statSync(directory).isDirectory()) throw new Error('Evidence must be a directory.')
  const files = listFiles(directory)
  if (files.length === 0) throw new Error('Evidence directory is empty.')

  let pr = prArg
  if (/^[1-9]\d*$/.test(prArg)) {
    pr = `${run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])}#${prArg}`
  }
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([1-9]\d*)$/.exec(pr)
  if (!match) throw new Error('Could not resolve the PR.')
  const [, owner, name, number] = match
  const repository = `${owner}/${name}`

  const sha = run('git', ['rev-parse', 'HEAD'])
  const pushedHead = run('gh', ['pr', 'view', number, '--repo', repository, '--json', 'headRefOid', '-q', '.headRefOid'])
  if (!/^[a-f0-9]{40,64}$/.test(sha) || pushedHead !== sha) {
    console.error('Local HEAD must match the pushed PR head. Push before publishing proof.')
    process.exit(1)
  }

  if (publisher.kind === 'comment') {
    const report = join(directory, 'evidence.md')
    if (!existsSync(report)) {
      console.error('The comment publisher needs evidence.md; run report.mjs first or write it yourself.')
      process.exit(1)
    }
    const body = `${readFileSync(report, 'utf8').trimEnd()}\n\n<sub>Evidence for head ${sha}</sub>\n`
    if (dryRun) console.log(`[dry-run] gh pr comment ${number} --repo ${repository} --body-file - (evidence.md, ${files.length} files)`)
    else {
      run('gh', ['pr', 'comment', number, '--repo', repository, '--body-file', '-'], body)
      console.log(`Evidence report posted to ${pr} for ${sha}.`)
    }
  } else if (publisher.kind === 'dir') {
    const target = join(publisher.target, `${owner}-${name}-${number}-${sha.slice(0, 12)}`)
    if (existsSync(target)) {
      console.error('Target directory already exists; refusing to overwrite evidence.')
      process.exit(1)
    }
    if (dryRun) console.log(`[dry-run] copy ${files.length} files to ${target}`)
    else {
      cpSync(directory, target, { recursive: true, errorOnExist: true, force: false })
      console.log(`Evidence copied to ${target} for ${pr} at ${sha}.`)
    }
  } else {
    const mod = await import(pathToFileURL(publisher.path).href)
    if (typeof mod.default !== 'function') throw new Error('Publisher module needs a default export function.')
    if (dryRun) console.log(`[dry-run] ${relative(process.cwd(), publisher.path)} would publish ${files.length} files for ${pr} at ${sha}`)
    else {
      const result = await mod.default({ directory, repository, number: Number(number), sha, files })
      console.log(result?.message ?? `Evidence published for ${pr} at ${sha}.`)
      if (result?.url) console.log(result.url)
    }
  }
} catch {
  // External command and publisher errors can contain credentials or captured application data.
  console.error('Evidence publication failed. Check the directory, GitHub access and the publisher.')
  process.exit(1)
}
