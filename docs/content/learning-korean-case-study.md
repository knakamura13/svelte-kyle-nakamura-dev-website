# Learning Korean — portfolio story draft

Status: source-checked draft for the local portfolio prototype, 2026-09-16. Personal voice and attribution should be reviewed before publication. No learning-outcome or adoption claims are made.

## Homepage summary

**Learning Korean**

I wanted to learn Hangul by working out its patterns. This project turns that preference into short interactive labs, with a review deck to return to between lessons.

**Worth a closer look:** explanations follow an attempt; the review scheduler distinguishes a quick correct answer from a slow one.

## Case study copy

### Learning Korean, one experiment at a time

I wanted to understand how Hangul works and make time to practise it in short sessions. That became the starting point for Learning Korean: an app where you try something, get feedback, and return to it later through spaced repetition.

### A lesson starts with something to do

The first lab asks you to make a sound and locate it on a mouth diagram. An explanation follows your answer. Later steps ask you to change a letter, build a syllable, or read unfamiliar text.

This sequence reflects a requirement in the project brief: lessons should be interactive, with explanations arriving as feedback. The goal is to give each explanation an immediate connection to something the learner has just tried.

### Keep the lesson separate from the practice schedule

A lab introduces a pattern. The review deck brings it back over time. Completing labs unlocks material for practice, so lesson progress and retention have separate jobs.

The scheduler uses correctness and response time to assign a grade. A slow correct answer receives a different grade from a fast one. A newly introduced card cannot earn the easiest grade on its first appearance. The scheduling function then calculates the next due time from the grade and the card's history.

This makes the practice loop a useful engineering story: the visible interaction is small, while the state underneath tracks what has been introduced, attempted, and scheduled for later.

### Let practice begin without an account

Signed-out use stores progress in the browser. The project also supports optional accounts and cross-device sync. The core learning experience can run as a static site; account and sync features use a server.

That split keeps the initial learning flow simple. It also creates an explicit tradeoff: browser-local progress belongs to that browser unless the learner uses the available transfer or sync features.

### What exists today

The public project contains interactive Hangul labs, a spaced-repetition review deck, browser-local progress, and optional account infrastructure. The first lab is available to explore directly.

The implementation demonstrates a product idea carried into a working learning flow. It does not, by itself, establish improved retention, a particular number of active learners, or a measured learning outcome.

## Evidence and publication notes (not website copy)

Public source revision checked: `e993c60808c3a88bb171745b8c89587fe0b2772c`.

| Claim | Evidence |
| --- | --- |
| Personal learning goal; short sessions; interactive lessons; separate retention mechanism | [MISSION.md](https://github.com/knakamura13/learning-korean/blob/e993c60808c3a88bb171745b8c89587fe0b2772c/MISSION.md) |
| The first lab asks for a sound, mouth location, and letter transformations | [lab01.ts](https://github.com/knakamura13/learning-korean/blob/e993c60808c3a88bb171745b8c89587fe0b2772c/app/src/lib/content/lab01.ts) |
| Correctness/time grading; new card rule; interval history | [srs.ts, lines 372–465](https://github.com/knakamura13/learning-korean/blob/e993c60808c3a88bb171745b8c89587fe0b2772c/app/src/lib/domain/srs.ts#L372-L465) |
| Browser-local guest use; optional sync; static/Node deployment split | [README.md](https://github.com/knakamura13/learning-korean/blob/e993c60808c3a88bb171745b8c89587fe0b2772c/README.md) |

These four public files were fetched at the pinned revision and byte-compared with the local source; each matched. Local repository HEAD differs from public main, so claims are tied to the fetched public files. Graph discovery used the learning-korean project, generation 2026-08-27T22:20:11Z; exact paths passed coverage checks. The partial LabRunner lines 311–315 were read directly; no portfolio claim depends on those lines. This is a bounded review of supporting evidence, not a project-wide audit or validation of the learning science.

Before publication, refine:

- Kyle's individual responsibilities, collaborators, and use of development tools. Repository ownership does not prove sole authorship. The draft intentionally avoids claiming sole implementation or design credit.
- One actual difficult decision, alternative considered, or iteration. Existing requirements establish the intended design; they do not establish a retrospective story about how the work happened.
- Any measured results or personal learning observations Kyle wants to share. No audience size, retention improvement, or benchmark is inferred.
- Current deployment behavior for account/sync features. These are documented source capabilities, not a claim that production credentials or sync are enabled.

The rendered prototype uses the opening, three explanatory sections, and a brief current-status section. Internal evidence gaps stay in this document. The website includes a source link, so readers can inspect implementation details without internal editorial notes appearing in the public-facing flow.

## Other homepage evidence

The existing website résumé (`static/documents/resume.pdf`) supports the mlrose-ky summary about refactoring, tests, and documentation, the historical APU role (2017–2022), and the completed Georgia Tech degree (2024). Its “Present” employment dates appear outdated relative to the current discussion; they are not repeated. Current experience and the résumé itself still need review before publication.
