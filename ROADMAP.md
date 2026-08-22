# Product roadmap

This roadmap is the durable source of truth for the intended direction of 200 Crappy Words. Detailed acceptance criteria live in `docs/milestones/`. Current execution state lives in `docs/CURRENT.md`.

Status legend: `PLANNED`, `ACTIVE`, `BLOCKED`, `COMPLETE`, `DEFERRED`.

## Roadmap overview

| Milestone | Outcome | Status |
| --- | --- | --- |
| 0.2 Trustworthy editor | A writer can trust the app not to lose work | COMPLETE |
| 0.3 Daily practice | The 200-words-a-day promise is real and encouraging | COMPLETE |
| 0.4 World projects | A folder becomes a portable, structured science-fiction world | ACTIVE |
| 0.5 Connected lore | Manuscript and world bible can reference each other fluidly | PLANNED |
| 0.6 Novel structure | Scenes and chapters can be planned, reordered, and exported | PLANNED |
| 0.7 Continuity tools | Time, travel, relationships, and canon can be reasoned about | PLANNED |
| 0.8 Release readiness | The app is accessible, documented, packaged, and recoverable | PLANNED |

## 0.2 — Trustworthy editor

Goal: make the existing editor safe enough for meaningful writing before expanding its scope.

- [x] Establish a testable application structure and baseline checks.
- [x] Add clear save-state handling and debounced autosave.
- [x] Protect unsaved work during file, folder, and window navigation.
- [x] Add local crash/interruption recovery.
- [x] Improve file-tree ordering, selection, refresh, and create-in-folder behavior.
- [x] Complete the custom window controls and native window behavior.
- [x] Review and narrow filesystem capabilities.
- [x] Exercise failure paths and complete milestone QA.

Specification: [`docs/milestones/0.2-trustworthy-editor.md`](docs/milestones/0.2-trustworthy-editor.md)

## 0.3 — Daily practice

Goal: fulfill the product's central promise with an accurate, humane daily writing loop.

- [x] Define and test word-token and daily-credit semantics.
- [x] Show live document and daily word counts.
- [x] Persist daily progress by local calendar date and project.
- [x] Add a 200-word progress treatment and accessible completion moment.
- [x] Allow the daily target to be changed while keeping 200 as the default.
- [x] Add writing history and gentle streak information.
- [x] Make corrections, time-zone changes, and recovery behavior understandable.

Specification: [`docs/milestones/0.3-daily-practice.md`](docs/milestones/0.3-daily-practice.md)

## 0.4 — World projects

Goal: turn an arbitrary folder into an optional, portable project for a manuscript and its world.

- [x] Create and reopen a named world project.
- [x] Provide a useful default structure for manuscript and worldbuilding material.
- [x] Preserve compatibility with ordinary existing folders.
- [x] Use Markdown for creative text and documented, human-readable project metadata.
- [ ] Add templates for characters, locations, factions, species, technology, spacecraft, events, scenes, and chapters.
- [ ] Create notes in the selected folder and remember meaningful navigation state.
- [ ] Add project settings, backup guidance, and format-version handling.

Specification: [`docs/milestones/0.4-world-projects.md`](docs/milestones/0.4-world-projects.md)

## 0.5 — Connected lore

Goal: let a writer consult and connect world knowledge without leaving the manuscript flow.

- [ ] Index project Markdown files safely and incrementally.
- [ ] Support `[[Wiki Links]]` with keyboard-friendly completion.
- [ ] Show outgoing links, backlinks, and useful unlinked mentions.
- [ ] Add fast project-wide search and a quick opener.
- [ ] Open a lore reference beside the active manuscript.
- [ ] Handle renamed notes and broken links without silent data loss.
- [ ] Keep indexing responsive on realistically large projects.

Specification: [`docs/milestones/0.5-connected-lore.md`](docs/milestones/0.5-connected-lore.md)

## 0.6 — Novel structure

Goal: support a long manuscript as scenes and chapters while retaining ordinary files.

- [ ] Represent manuscript order without making prose proprietary.
- [ ] Add chapter and scene metadata: synopsis, point of view, location, story date, status, and notes.
- [ ] Add an outline and reorderable corkboard.
- [ ] Show scene, chapter, and manuscript word counts and targets.
- [ ] Add manuscript/reference split views and focus mode.
- [ ] Support safe scene splitting, merging, and reordering.
- [ ] Compile/export to Markdown and plain text, then add DOCX and PDF after format review.

Specification: [`docs/milestones/0.6-novel-structure.md`](docs/milestones/0.6-novel-structure.md)

## 0.7 — Continuity tools

Goal: provide science-fiction-specific tools that help a complex world remain internally coherent.

- [ ] Add structured canon status and typed worldbuilding properties.
- [ ] Build story and world timelines with eras and parallel tracks.
- [ ] Calculate character ages and flag impossible appearances.
- [ ] Model locations, travel durations, and arrival windows without pretending fictional physics is universal.
- [ ] Visualize character and faction relationships.
- [ ] Attach project-owned maps and link lore to map locations.
- [ ] Add deterministic continuity checks and source-linked findings.
- [ ] Explore optional, privacy-explicit AI assistance only behind a separate decision gate.

Specification: [`docs/milestones/0.7-continuity-tools.md`](docs/milestones/0.7-continuity-tools.md)

## 0.8 — Release readiness

Goal: turn the evolving application into a dependable product someone else can install and understand.

- [ ] Complete keyboard, screen-reader, contrast, motion, and zoom review.
- [ ] Test recovery, migration, and backup/restore using representative projects.
- [ ] Establish performance budgets for launch, search, typing, save, and indexing.
- [ ] Add onboarding, in-app help, sample world, and truthful user documentation.
- [ ] Create application identity, icons, signing plan, and platform packaging.
- [ ] Add a privacy statement and explicit data-location documentation.
- [ ] Define beta feedback, crash-reporting policy, and release checklist without enabling telemetry by default.

Specification: [`docs/milestones/0.8-release-readiness.md`](docs/milestones/0.8-release-readiness.md)

## Ideas parking lot

These ideas are intentionally outside the committed sequence. They should not interrupt the active milestone without an explicit priority change.

- Mobile companion or capture app
- Optional sync between the writer's own devices
- Collaboration and editorial comments
- Version comparison and manuscript branching
- Writing sprints or ambient focus tools
- Publication and submission workflows
- Plugin or extension system
- Importers from other writing tools

## Roadmap change policy

The roadmap may evolve as the product teaches us what it should be. When it changes:

1. Preserve the north-star experience in `docs/PRODUCT.md` or explicitly revise it.
2. Record consequential decisions in `docs/DECISIONS.md`.
3. Keep only one milestone active unless parallel work is clearly independent.
4. Keep `docs/CURRENT.md` specific enough that a new task can resume without chat history.
