# Performance budgets

These are release-readiness budgets, not promises that every filesystem or Mac will behave identically. They define the point where the app should investigate and explain a regression instead of normalizing it. Measurements use local project data only and are never uploaded.

## Reference environment

The first baseline was recorded on 2026-10-08 on macOS 26.6.2, an Apple A18 Pro Mac with 8 GB memory, using the packaged production app and the production Node/Vitest build. Re-run the automated budget fixture with:

```sh
npm test -- --run src/lib/performance-budgets.test.ts --reporter=verbose
```

## Budgets and baseline

| Experience | Release budget | 2026-10-08 baseline | Method |
| --- | ---: | ---: | --- |
| Cold packaged launch through restored, usable editor | 5 seconds | 4.36 seconds | Quit packaged app, launch its exact `.app`, wait for the accessible editor and restored project tree. The automation transport is included, so this is conservative. |
| Index at supported combined boundary | 2.5 seconds | 603 ms | Build the memory-only index for 5,000 Markdown notes totaling about 47 MiB. |
| Search at supported combined boundary | 100 ms | 31 ms | Search the same 5,000-note/about-47-MiB index for a unique content marker. |
| Per-edit word derivation | 16 ms | 1.8 ms | Count the complete 10,000-word active scene after JavaScript warm-up. |
| Autosave begins after typing stops | 1 second | 750 ms configured debounce | Source reread and write remain separately guarded; slow or failed storage stays visible instead of pretending to meet the budget. |
| Production disk image | 10 MiB | 4,691,810 bytes | Build the unsigned arm64 DMG and inspect its exact byte size. |

File-open latency is currently covered by the cold-launch path and repeated packaged QA, but does not yet have trustworthy in-app timing. Adding manuscript telemetry to measure it is not acceptable. A future local diagnostics export may measure bounded timings only after explicit writer action and must not include paths or prose.

## Bundle attribution

The production build currently warns about two minified JavaScript chunks:

- about 712 KiB for the main local application route; and
- about 1.16 MiB for `print-pdf`, which contains `pdf-lib` and fontkit and is already dynamically loaded only when a PDF export is requested.

The warning remains enabled. Raising the warning limit would hide useful evidence, while eagerly reorganizing the PDF engine would add risk without improving launch. The next useful optimization target is the main route: large optional workspaces may be candidates for deliberate lazy loading after a regression test proves that keyboard focus, stale-source protection, and first-open errors still behave correctly.

## Supported hard limits

Performance budgets do not expand parser limits. Connected lore accepts at most 5,000 Markdown files, 2 MiB per file, and 50 MiB total. Optional portable formats, maps, images, manuscript sources, findings, and collections have their own documented bounds and explicit overflow states. A limit refusal is not a timing failure and must remain visible to the writer.
