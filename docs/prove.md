# prove

## What it does

`prove` makes an agent show that a change works before it asks anyone to merge
it. It decides which evidence the change needs, produces that evidence for the
exact commit under review, publishes the media, and writes the pull request body
around it.

Evidence here always means a before and an after. A screenshot of the broken
checkout next to the fixed one counts. So does a test run that failed on the base
commit and passes on the head, or the report output that changed. A sentence
saying the test suite passes does not count, because it gives the reviewer
nothing to check.

The skill ships small Node.js scripts that use whatever the project already has
installed: Playwright to capture a browser flow, pixelmatch to compare two
captures pixel by pixel, `gh` to read the PR head and post a report. Media never
go into git by default. Where they end up is your choice of publisher: a PR
comment with the text report, a directory that your CI uploads as an artifact,
or a module you write for your own storage.

## When to reach for it

Type `/prove`, or let the agent pick it up when it opens or updates a PR.

| Situation | What `prove` produces |
| --- | --- |
| A new screen, component or visible flow | Screenshots or a screencast of every changed state, checked against the acceptance criteria |
| A visible bug | Before and after captures of the same state |
| A refactor, lint fix or dependency bump that touches UI code | A pixel comparison of base and head, `identical: N/N` or a diff for every pair that changed |
| A logic fix with no UI | The test that was red on the base and is green on the head |
| A migration, job, API or CLI change | The output that changed, with a diagram when the flow is not obvious |
| A PR body that needs writing | Summary, Evidence and Merge Danger sections, under the repository's own template if it has one |

## The template

Three sections, in this order, below the repository's PR template if there is
one:

- **Summary** shows the change in the smallest form that still makes the point:
  pseudocode for a rule, a call tree for a changed path, a component or file tree
  for structure, a Mermaid diagram for interaction, or a shaped diff. Usually one
  of them.
- **Evidence** lists the before, the after, the commands that reproduce them, and
  the gaps: anything that was not proven, stated plainly.
- **Merge Danger** says whether the change is a **two-way door** (a revert undoes
  it) or a **one-way door** (it cannot be undone cheaply: dropped data, sent
  messages, removed public interfaces, data written in a new format), and names
  the **blast radius**: what breaks, and for whom, if the change is wrong. The
  agent writes its door call as a claim with a reason the reviewer can check.

## Common questions

**Why not just trust the test suite?**

A passing suite says nothing about whether the suite covers the change. A test
that fails on the base and passes on the head proves that this test exercises
this change. For UI, a screenshot shows what a test assertion cannot: layout,
truncation, the state the user actually sees.

**Where do the screenshots go?**

Not into git, unless your repository asks for committed proofs. Pick a
publisher: `comment` posts the text report to the PR, `dir:<path>` copies the
evidence for a CI artifact step, and your own module can upload anywhere. Every
publisher first checks that your local head is the pushed PR head, so evidence
cannot drift from the code it describes.

**Can I trust the agent's door call?**

Treat it as a claim, which is why the skill asks for a reason next to it. The
agent grading its own change is most likely to be wrong when it says "two-way,
small blast radius". Give it a list of changes your repository always treats as
one-way, such as migrations that drop data, anything that sends mail or calls
external services, or deletions, in `AGENTS.md`, `CLAUDE.md`,
`CONTRIBUTING.md` or `.github/one-way-doors.md`. The skill reads that list first,
and anything on it is one-way regardless of the agent's judgement.

**My repository already has a PR template.**

The skill fills your template first and adds Summary, Evidence and Merge Danger
below it. Your template stays the authority for anything it asks.

**The Mermaid diagram shows up as raw text.**

GitHub and GitLab render Mermaid in PR descriptions; terminals and some other
forges do not. When the body will be read somewhere without Mermaid support, a
text tree or a shaped diff carries the same information.

**Who judges the screenshots?**

You can, and for most PRs you should. For acceptance criteria that are tedious to
check by eye, the skill describes a judge prompt for a separate agent that grades
one criterion per screenshot and may answer "unknown". The judge model is
configurable (`PROVE_JUDGE_MODEL` or your agent instructions) and must not be
the agent that wrote the change.

**How do I prove that a refactor changed nothing visible?**

Capture the same states on the base and the head with the same browser, viewport,
fonts, clock and fixtures, then run `compare.mjs`. It passes only when every pair
is pixel-identical, and treats a missing pair, a size change or an empty set as
failure. If something differs, the claim failed; the diff images show where.

## It's working if

- You understand what a PR changes from its Summary before opening the diff.
- Every Evidence entry has a before and an after for the current head, and gaps
  are named instead of hidden.
- Reviewers can rerun the evidence from the commands in the body.
- One-way doors are called out, carry a checkable reason, and include every change
  on your repository's one-way list.
- No screenshot or video lands in git unless you asked for it.

## Where it fits

`prove` runs at the end of an implementation, after the code is reviewed by its
author and before a human or agent reviewer looks at the PR:

```text
plan -> implement -> self-review -> prove -> review -> merge
```

It does not open the PR, push branches or decide whether to merge. It produces
the evidence and the body that a reviewer needs for that decision. The optional
pre-PR gate (`scripts/pre-pr-gate.mjs`) is a Claude Code hook that blocks
`gh pr create` for UI changes until you have marked the current commit as checked.

A variant bound to the BB agent IDE, which uploads media into a review panel
instead of using a publisher, ships with the `bb-visual-proof` plugin.

Credits: the Summary, Evidence and Merge Danger structure and this page's layout
follow Matt Pocock's [`pr` skill](https://github.com/mattpocock/skills), which
credits Humanlayer's
[`show-me`](https://github.com/humanlayer/skills) for the smallest-view idea.
