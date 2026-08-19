# Decision log

This is a lightweight record of product and architectural decisions that future work should not have to rediscover. Newer decisions may supersede older ones but should not erase their history.

## D-001 — Local-first core

- Date: 2026-08-19
- Status: accepted

The core writing, project, goal, search, and worldbuilding workflows must function without an account or network connection. Creative content is not sent elsewhere as part of ordinary operation.

Why: unpublished fiction is sensitive, reliable offline access matters, and local ownership is a defining product value.

## D-002 — Portable creative files

- Date: 2026-08-19
- Status: accepted

Creative writing and lore should use ordinary Markdown or plain-text files wherever possible. App-specific metadata must be human-readable, documented, versioned, and kept minimal.

Why: writers should be able to inspect, back up, search, and edit their work without this application.

## D-003 — Two hundred is the opinionated default

- Date: 2026-08-19
- Status: accepted

The default daily target is 200 words. A later milestone may make the target configurable, but product language and default design should retain the identity of 200 Crappy Words.

Why: a small concrete floor reduces the emotional cost of starting and gives the product a memorable promise.

## D-004 — Humane progress

- Date: 2026-08-19
- Status: accepted

Progress and streak features must encourage returning without punishment, public competition, shame, or the destruction of earned history after a missed day.

Why: the product exists to sustain creative practice rather than optimize an engagement metric.

## D-005 — Initial daily-credit semantics

- Date: 2026-08-19
- Status: accepted, subject to usability testing

Daily credit will initially use gross positive word-count changes made during active editing sessions. Deletions do not remove already-earned daily credit. Paste behavior counts initially because this is a private aid, not a competitive score.

Why: revision and rewriting are real work, while comparing only end-of-day document sizes would punish deletion and restructuring. The behavior will be clearly documented and tested before storage is made permanent.

## D-006 — No required generative AI

- Date: 2026-08-19
- Status: accepted

Generative AI is not required for the core product. Deterministic, source-linked continuity checks come first. Any later AI integration must be optional, disclose what leaves the computer, and pass a separate product/privacy decision gate.

Why: the product should remain private, dependable, and useful without an external provider.

## D-007 — Repository-backed continuity

- Date: 2026-08-19
- Status: accepted

`ROADMAP.md`, `docs/CURRENT.md`, milestone specifications, and this decision log are the durable project memory. `AGENTS.md` requires Codex to read and maintain them.

Why: chat context is temporary; project intent and execution state must survive new tasks, compaction, and time away.

## D-008 — Autonomy and checkpoints

- Date: 2026-08-19
- Status: accepted

Codex may make ordinary, reversible, in-repository implementation decisions and continue across planned slices. It pauses at the decision gates in `AGENTS.md`. Verified local commits may be used as recoverable checkpoints, but publishing, pushing, deploying, and releasing require explicit approval.

Why: the project should keep moving without making the user remember or supervise every technical detail, while respecting privacy and consequential boundaries.

## D-009 — TypeScript and focused Vitest tests

- Date: 2026-08-19
- Status: accepted

New frontend application logic is written in TypeScript. Pure state and domain behavior is tested with Vitest; component or browser-level tools will be added only when a slice requires them.

Why: the prototype's unchecked JavaScript hid baseline errors, while the save and recovery work needs deterministic race-condition coverage. Vitest uses the existing Vite pipeline and supports the installed Node and Vite versions.
