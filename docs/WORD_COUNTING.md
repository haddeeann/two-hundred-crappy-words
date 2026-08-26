# Word counting and daily credit

This document defines the first deterministic counting rules for milestone 0.3. They are intentionally understandable, local, and independent of save timing.

## Document words

A word begins with a Unicode letter or number. Further letters, numbers, and combining marks remain part of that word.

- Whitespace and ordinary punctuation separate words.
- Straight (`'`) and curly (`’`) apostrophes remain inside a word when followed by another letter or number, so `don't`, `writer’s`, and `l’esprit` each count as one.
- A period or comma between digits remains inside a number, so `3.14` and `1,000` each count as one.
- Hyphens and dashes separate words, so `star-crossed` and `past—future` each count as two.
- Emoji and symbols do not count unless they accompany a letter or number token.
- Letters with combining marks and letters outside ASCII count normally.

The rule does not attempt dictionary-based language segmentation. A contiguous run in a script that ordinarily omits spaces currently counts as one token. That limitation is explicit and subject to usability testing; an operating-system dictionary is not used because its result can change by OS, locale, and runtime version.

## Daily credit

Document word count and today's credited words are separate values.

Opening or switching to a document establishes its current count as a baseline and earns no credit for text already present. Each active text-edit event compares the new document count with the previous count:

```text
credit earned = max(0, new document words - previous document words)
```

Positive changes are added to today's credit. Deletion, replacement with the same number of words, and other zero-or-negative changes do not remove credit already earned. If a writer deletes and then writes new words, the later positive change earns credit; revision is writing work. Paste follows the same net-positive rule because this is a private practice aid rather than a competitive score.

Save and autosave events never affect credit. Reopening a file, accepting a recovery draft, or deliberately reloading an externally changed file establishes a new baseline and does not credit existing text. This avoids credit being created merely by navigating, restarting, recovering, or resolving a conflict.

The app-local daily ledger stores the local date, project identity, counters, and monotonic revisions needed for restart persistence. It does not store manuscript text merely to calculate progress; its schema and clock behavior are documented in [`DAILY_PROGRESS.md`](DAILY_PROGRESS.md).

## Structural manuscript counts

The optional portable manuscript structure derives planning counts from the same stable, fingerprint-verified source reads used by its outline and corkboard. It applies the document tokenizer above to Markdown prose after a valid leading structured-note metadata block; metadata fields are not manuscript words. Chapter overview notes are planning material and never contribute prose words.

A `ready` scene or one-file chapter can show its verified count and optional structural target. A chapter container rolls up its child scenes, and the manuscript rolls up its top-level items. `includeInCompile: false` on a chapter excludes its complete subtree; the same value on a scene excludes that scene. Included and excluded verified words remain distinguishable. Any moved, missing, ambiguous, conflicting, identity-mismatched, unsafe, unreadable, unstable, oversized, or read-limit-blocked binding remains visibly unavailable and makes the affected rollup explicitly partial; the app never guesses its size.

These planning counts are memory-derived. Opening, refreshing, or externally changing a structural source can update them, but it never creates daily credit and never writes prose, the portable structure, or an app-local count cache.
