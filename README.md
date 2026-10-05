# Skills

Agent skills from mpsoftware. Each skill is a folder with a `SKILL.md` and the
scripts it needs, and works with any agent that reads the
[Agent Skills](https://agentskills.io) format.

| Skill | What it does | Docs |
| --- | --- | --- |
| [`prove`](skills/prove/SKILL.md) | Equips a pull request with evidence that it works: before/after screenshots, pixel comparisons, red-to-green tests or changed output, and a PR body with Summary, Evidence and Merge Danger. | [docs/prove.md](docs/prove.md) |

## Install

Pick one way; installing both gives you every skill twice.

**Claude Code plugin**, managed and updated as a bundle:

```text
/plugin marketplace add mpsoftware/skills
/plugin install mpsoftware-skills@mpsoftware
```

**skills.sh**, for Claude Code, Codex and other agents, as editable files in your
project:

```bash
npx skills@latest add mpsoftware/skills
```

## Requirements

The skills' scripts are plain Node.js (18 or later) and have no dependencies of
their own. They use the tools your project already has:

- `prove` capture: `playwright` or `@playwright/test`
- `prove` pixel comparison: `pixelmatch` and `pngjs`
- `prove` publishing and head checks: `git` and the GitHub CLI `gh`

## Layout

```text
skills/<name>/SKILL.md     the skill, with scripts/ and reference/ next to it
docs/<name>.md             what it does, when to use it, common questions
examples/<name>/           a runnable example
.claude-plugin/            Claude Code plugin and marketplace manifests
```

## Development

```bash
npm ci
npm test               # unit tests for all skill scripts
npm run example:prove  # captures the example app and runs the pixel comparison
```

`npm run example:prove` needs a Chromium for Playwright (`npx playwright install chromium`).

## Credits

`prove` structures the PR body after Matt Pocock's
[`pr` skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md)
(MIT), which in turn credits Humanlayer's
[`show-me`](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md).
The docs layout follows the same repository. All text here is written for this
repository; the credits are also recorded in each skill's `metadata.credits`.

## License

[MIT](LICENSE)
