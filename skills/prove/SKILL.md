---
name: prove
description: Use when opening or updating a pull request, or when finishing a change that needs evidence. Picks the proof the change needs (before/after screenshots, a pixel comparison, a test that was red and is now green, changed command output), captures it reproducibly for the exact head, and writes the PR body as Summary, Evidence and Merge Danger.
metadata:
  credits:
    - skill: pr
      author: Matt Pocock
      url: "https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md"
      used: "PR body sections (Summary, Evidence, Merge Danger), door and blast-radius framing, docs layout"
    - skill: show-me
      author: Dex Horthy
      organisation: Humanlayer
      url: "https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md"
      used: "smallest-view idea for the Summary"
---

# prove

A PR is done when a reviewer can see that it works without taking your word for
it. This skill produces that evidence and puts it into the PR body.

Ground rules:

- Never fabricate, stage or reuse old evidence. Every artifact belongs to the
  exact head commit of the PR. A new head needs new evidence.
- "Tests are green" is a claim, not evidence. Evidence is a before and an after.
- Name every gap. Missing or incomplete evidence goes into the PR as a gap, never
  silently dropped.
- Keep media out of git unless the repository explicitly asks for committed
  proofs. Never include secrets, credentials, personal data or production data
  in any artifact.

## 1. Pick the evidence

| What changed | Evidence |
| --- | --- |
| UI or user-facing feature | Screenshots or a screencast of every changed screen and state (responsive, empty, loading, error where affected). |
| Visible bug fix | Before (broken) and after (fixed) captures of the same state, labeled so nobody can mix them up. |
| UI code without an intended visible change (refactor, lint, dependency update) | A pixel comparison of base and head for every affected state: `identical: N/N`, or before/after/diff for every pair that differs. See [visual-diff](reference/visual-diff.md). |
| Logic, algorithm, invisible bug fix | The exact test that fails on the base and passes on the head, with both runs' trimmed output. |
| Data, server, schema, migration, API | The command output that changed (before and after), plus a diagram of the flow when it helps. |

A change that spans several kinds needs evidence for every claim it makes.

## 2. Produce it

### Browser evidence

1. Start the app with the project's documented command and reach every changed
   state. Reuse the project's fixtures, seed data and auth helpers; never real
   user data.
2. Describe the run in a `flow.json` ([format](reference/flow-format.md)) and
   capture it into a directory outside git:

   ```bash
   node <skill-dir>/scripts/capture.mjs flow.json /tmp/pr-123-evidence
   ```

   This writes one full-page PNG per checkpoint, a video of the run under
   `video/` and `manifest.json`. It uses the project's installed Playwright
   (`playwright` or `@playwright/test`), resolved from the working directory.
3. Open every capture yourself and check it against the acceptance criteria. Fix
   defects and capture again. Report how many you checked, e.g. `8 of 8`.
4. Optional, for criteria a reviewer would otherwise judge by eye: write them as
   `criteria.json` ([format](reference/criteria-format.md)) and let an
   independent judge agent grade each screenshot
   ([prompt](reference/judge-prompt.md)). The judge model is configurable;
   it must not be the agent that wrote the change. Then build the report:

   ```bash
   node <skill-dir>/scripts/report.mjs /tmp/pr-123-evidence verdicts.json criteria.json
   ```

   `report.mjs` writes `verdict.json` and a text-only `evidence.md`, and exits
   non-zero unless every criterion passes.

### No intended visible change

Declare the intent first, then capture the same states on the base and the head
with identical settings and compare them:

```bash
node <skill-dir>/scripts/compare.mjs /tmp/base /tmp/head /tmp/diff
```

`compare.mjs` uses the project's installed `pixelmatch` and `pngjs`, compares
every PNG pair by file name with a color threshold of 0, and exits 0 only for
`identical: N/N` with N > 0. A missing pair, a size change or an empty set is a
failure, not a pass. Never raise the threshold, mask an area or refresh the base
from the head to turn a difference into a pass. Details, determinism settings and
the text report: [visual-diff](reference/visual-diff.md).

### Tests and command output

- Run the exact test on the base (red) and the head (green). Keep the command and
  the trimmed output of both runs.
- For server, data or tooling changes, show the output that changed: a query
  result, a migration check, a CLI run, a count.
- Text evidence may be committed (for example under `docs/proofs/`) when the
  repository keeps proofs; it must be reproducible from the commands shown.

## 3. Publish media

Publish after the head is pushed and the PR exists:

```bash
node <skill-dir>/scripts/publish-evidence.mjs /tmp/pr-123-evidence owner/repo#123 --publisher comment
node <skill-dir>/scripts/publish-evidence.mjs /tmp/pr-123-evidence 123 --publisher dir:/tmp/ci-artifacts
node <skill-dir>/scripts/publish-evidence.mjs /tmp/pr-123-evidence 123 --publisher ./tools/upload-proof.mjs
```

The script refuses to publish unless the local `HEAD` equals the pushed PR head.
Publishers:

- `comment`: posts `evidence.md` as a PR comment through `gh`. Text only; it names
  the media files without embedding them.
- `dir:<path>`: copies the evidence directory to
  `<path>/<owner>-<repo>-<N>-<sha12>`, for example for a CI artifact upload step.
- a path to your own `.mjs` module: its default export receives
  `{ directory, repository, number, sha, files }` and returns
  `{ message, url? }`. Use this for a storage bucket, an artifact service or an
  internal review tool.

`--dry-run` checks the directory, the head and the publisher without publishing;
a custom module is loaded but not called. Failures exit
non-zero without echoing external command output, which could contain
credentials. If no publisher fits the environment, keep the directory, say where
it is, and record the gap in the PR.

## 4. Write the PR body

If the repository has `.github/pull_request_template.md` (or another PR
template), fill it first and put the three sections below it. Otherwise start
directly with `## Summary`; no preamble.

```markdown
## Summary

<the smallest view that shows the change>

## Evidence

- **Before:** <capture, failing test run or old output>
- **After:** <capture, passing test run or new output>
- **Reproduce:** <exact commands and prerequisites>
- **Gaps:** <what is not proven, or "none">

## Merge Danger

**Door:** <one-way | two-way> (agent's claim: <one sentence the reviewer can check>)

**Blast radius:** <what breaks, and for whom, if this is wrong>
```

- **Summary:** choose one view, rarely two: pseudocode, a call tree, a component
  tree, a file tree, a Mermaid diagram or a shaped diff. Keep only the parts the
  reviewer needs. Examples: [pr-body](reference/pr-body.md). Mermaid renders on
  GitHub and GitLab, not in terminals or every other forge; when the body is read
  elsewhere, prefer a text tree.
- **Evidence:** the before and after from step 2. Link or name published media;
  never claim an artifact you did not produce.
- **Merge Danger:** a two-way door can be undone cheaply by reverting; a one-way
  door cannot (destructive migrations, deletions, anything sent outward such as
  mails or webhooks, removed public APIs, data written in a new format). Read the
  repository's list of always-one-way changes first if it has one (in
  `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` or `.github/one-way-doors.md`);
  anything on it is one-way regardless of your judgement. Your door call is a
  claim about your own work, so write it as a checkable statement, not a
  reassurance. Blast radius names the concrete things that break: a layout, an
  API's consumers, a job's downstream data.

Rewrite the body when a later push changes what it describes.

## 5. Check before handing over

The proof is working if:

- the Summary alone tells a reviewer what changed, before they open the diff;
- every claim in the PR has a before and an after, bound to the current head;
- every gap is named, and nothing claims evidence that does not exist;
- the door call names a reason the reviewer can verify, and changes on the
  repository's one-way list are never called two-way;
- a reviewer can rerun the evidence from the commands in the body.

## Scripts

All scripts are plain Node.js (18+) without their own dependencies; they use the
project's installed tools.

| Script | Purpose |
| --- | --- |
| `scripts/capture.mjs` | Runs `flow.json` in Chromium: checkpoint screenshots, run video, `manifest.json`. |
| `scripts/report.mjs` | Builds `verdict.json` and a text-only `evidence.md` from the manifest and judge verdicts. |
| `scripts/compare.mjs` | Pixel comparison of two capture directories; writes diff images and a result table. |
| `scripts/publish-evidence.mjs` | Publishes an evidence directory for the exact pushed head through a pluggable publisher. |
| `scripts/pre-pr-gate.mjs` | Optional Claude Code `PreToolUse` hook that blocks `gh pr create` for UI changes until the head is marked as checked. |

### Optional pre-PR gate

Register `pre-pr-gate.mjs` as a `PreToolUse` hook with matcher `Bash` in your
Claude Code settings. For a diff that touches UI paths it blocks `gh pr create`
until the current commit is marked as checked locally:

```bash
mkdir -p .prove && git rev-parse HEAD > .prove/PROVEN
```

Keep `.prove/` untracked. The marker records your own check, not a review.
`PROVE_BASE` overrides the base branch, `PROVE_UI_REGEX` the UI path pattern,
and `PROVE_SKIP=1 gh pr create ...` skips the gate for a non-visual change. The
gate fails open: an undecidable base or an internal error allows the command.
