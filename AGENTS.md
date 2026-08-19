# Project instructions for Codex

## Mission

Build **200 Crappy Words** into a calm, local-first writing application for science-fiction novelists who want to write at least 200 words a day while keeping an interconnected world bible close at hand.

The writer's words are the most important data in this repository. Prefer safety, clarity, portability, and recoverability over cleverness.

## Durable project context

Before changing code, read:

1. `docs/PRODUCT.md`
2. `ROADMAP.md`
3. `docs/CURRENT.md`
4. `docs/DECISIONS.md`
5. The specification for the active milestone in `docs/milestones/`

Treat those files, the code, and the tests as the source of truth. Do not rely on chat history for roadmap state.

## Working protocol

- Continue the active slice in `docs/CURRENT.md` unless the user changes priorities.
- Break work into small slices that leave the application in a working state.
- Define observable acceptance criteria before implementing a slice.
- Work autonomously through ordinary, reversible implementation choices.
- Run the most relevant checks after each slice and broader checks at milestone boundaries.
- Update `docs/CURRENT.md`, `ROADMAP.md`, and `docs/DECISIONS.md` whenever their recorded state changes.
- Record meaningful product or architectural decisions, including why they were made.
- Keep documentation truthful: planned behavior must never be described as already available.
- Use local Git commits as recoverable checkpoints after coherent, verified slices. Never push, publish, deploy, or create a release without explicit user approval.

## Decision gates

Pause for the user when a decision:

- materially changes the product experience with no clearly superior option;
- changes or migrates the permanent on-disk project format;
- risks losing or exposing a writer's work;
- introduces an account, paid service, cloud dependency, telemetry, or network requirement;
- requires visual or editorial taste that cannot be validated objectively; or
- expands beyond this repository or its development dependencies.

Do not pause for routine refactors, naming, test structure, reversible UI details, or other normal implementation choices.

## Privacy and boundaries

- Keep the core writing workflow offline and local-first.
- Do not inspect unrelated personal files or directories.
- Do not transmit manuscript or worldbuilding content to an external service.
- Do not add telemetry, analytics, advertising, or tracking.
- Do not add AI or cloud features unless they are optional, privacy-explicit, and approved at a decision gate.
- Use the network only for relevant documentation and development dependencies unless the user expands the scope.
- Never commit secrets, credentials, private manuscript content, or machine-specific absolute paths.

## Product principles

- Two hundred words is a welcoming floor, not a punishment.
- Missing a day must not shame the writer or erase the value of earlier work.
- Store creative work in ordinary, portable formats wherever possible.
- Add depth progressively; a new writer should be able to open the app and write immediately.
- Worldbuilding should remain within reach of the manuscript, not compete with it.
- Prefer focused, legible interfaces over dense dashboards.
- Accessibility and keyboard operation are part of completion, not later polish.

## Engineering expectations

- Preserve existing user changes and avoid destructive Git operations.
- Prefer focused components and testable pure modules over adding more behavior to `+page.svelte`.
- Handle filesystem failures explicitly and keep unsaved state recoverable.
- Avoid new production dependencies when a small, well-tested implementation is sufficient.
- When adding a dependency, document why it is appropriate and commit its lockfile changes.
- Keep Tauri permissions as narrow as the supported workflow allows.
- Run at least `npm run check` and `npm run build` for frontend-affecting milestone checkpoints.
- Add and run focused automated tests as test infrastructure is introduced.
- Run Rust checks when changing `src-tauri/`.

## Definition of done for a slice

A slice is complete only when:

- its acceptance criteria are met;
- relevant automated checks pass;
- the changed flow has been manually exercised when practical;
- errors and recovery behavior have been considered;
- documentation reflects the result; and
- the next action is recorded in `docs/CURRENT.md`.
