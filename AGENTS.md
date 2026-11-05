# Agent rules

Terms for pages and the design language are in `CONTEXT.md`.

## Merging your own PR

Squash-merge your PR into `main` once all of these hold for its head commit:

1. CI is green.
2. `/interrogate` on the PR returns a bare `PASS`, with no half-proven findings, and its report is posted on the PR.
3. The PR description names the head commit, links its CI run and the `/interrogate` comment, and carries the evidence: before and after screenshots at 1440px and 390px for a visible change, otherwise the commands you ran and their output.

These PRs wait for Kyle, because they change the gate itself:

- PRs that touch `.github/`, `nixpacks.toml`, `playwright.config.ts`, the `scripts` in `package.json`, `AGENTS.md`, `CLAUDE.md` or `.cursor/rules/`
- PRs that weaken or delete an existing test assertion. Say so in the description.
- PRs from a session that can't run `/interrogate`

Name every PR you merged in your final message.
