# Timeline and project-calendar format

Status: **PROPOSED — permanent-format approval required before implementation**

Last updated: 2026-09-22

This proposal defines the smallest portable timeline boundary for 200 Crappy Words. It is deliberately narrower than a general calendar engine: writer-authored facts remain beside their explanatory Markdown, one optional project file supplies shared calendar mathematics and track membership, and every derived position remains traceable to exact source facts.

No parser, project file, note, or interface should change until the decisions at the end of this document are approved.

## Goals

The first timeline should:

- show world events, scenes, and chapters in chronological order without confusing that order with manuscript order;
- retain reduced precision, intervals, approximation, uncertainty, and intentional unknowns instead of inventing exact dates;
- work immediately for approved Gregorian `time` facts without requiring a new project file;
- support bounded fictional calendars, named eras, and relative day-count calendars through explicit project-owned definitions;
- let one event appear on several parallel tracks without copying the event;
- keep incomplete or contradictory material visible and actionable;
- make ordering, overlap, and later age calculations deterministic only when their inputs justify them; and
- preserve ordinary folders, unknown fields, unsupported future versions, and writer-authored source bytes.

It should not:

- parse free-form manuscript `storyDate` text as structured time;
- infer chronology from filenames, folder order, prose, or array order;
- require every event to have a date or track;
- silently select one of several competing time claims;
- move events or rewrite dates to resolve a warning;
- turn calendar definitions into a universal astronomy simulator; or
- place caches, layout coordinates, zoom, filters, or other machine-local view state in the project.

## Existing sources and compatibility boundary

The project already has four distinct time-bearing concepts. They must remain distinct.

| Existing source | Current meaning | Timeline use |
| --- | --- | --- |
| `time` continuity value | A typed `calendar` plus an `expression`; Gregorian values already validate year, year-month, full date, and closed intervals | Authoritative portable input when attached to a documented time property |
| `occurs-at` / `ends-at` | Time properties on event, scene, or chapter notes | Start or complete occurrence, plus optional explicit end |
| `born` / `died` | Time properties on character notes | Later lifespan and age evidence; not copied into an event note |
| manuscript `storyDate` | Optional bounded display string such as `Orbit 41, ash season` | Planning label only; shown as context but never parsed, ordered, or migrated silently |

Continuity `validFrom` and `validTo` describe when another fact applies. They do not describe the duration of the subject event and therefore do not place an event on the timeline.

The existing `certainty` field remains the epistemic qualifier for a fact: `exact`, `approximate`, or `uncertain`. Reduced date precision is different. `2160` exactly identifies a calendar year, not an approximate day within it.

Ordinary folders remain usable. A world project without the proposed timeline file can still derive a Gregorian timeline from valid structured notes. Opening or indexing a project never creates the file and never inserts facts into notes.

## Research basis

The proposal borrows narrow semantics rather than another product's storage format:

- The Library of Congress [Extended Date/Time Format](https://www.loc.gov/standards/datetime/) distinguishes year, year-month, full date, closed interval, uncertainty, approximation, and unspecified values. Version one retains the already approved reduced-precision and closed-interval subset, while keeping certainty in the existing explicit fact field.
- [W3C OWL-Time](https://www.w3.org/TR/owl-time/) treats intervals as the general temporal case, defines instants through interval boundaries, and permits temporal positions in non-Gregorian reference systems. The app needs only closed range normalization and a small subset of before/after/overlap conclusions, not RDF or an ontology.
- [Unicode LDML calendar data](https://unicode.org/reports/tr35/tr35-dates.html) keeps stable calendar and era identifiers separate from localized names, and recognizes that eras, month structure, and year numbering vary by calendar. Project definitions follow that identity/display separation without attempting locale inheritance.
- The [Wikibase time value model](https://www.mediawiki.org/wiki/Wikibase/DataModel#Dates_and_times) records calendar and precision rather than treating a padded timestamp as fully known. The app likewise preserves authored precision and never treats missing month or day components as January 1 for conclusions.
- Aeon Timeline's official guidance separates [chronological and narrative order](https://help.timeline.app/article/149-chronological-vs-narrative-order), permits [undated items within a flexible chronology](https://www.aeontimeline.com/guides/add-and-customize-dates), and models [story arcs as relationships that can become parallel tracks](https://www.aeontimeline.com/guides/story/track-story-arcs-or-plotlines). The proposed timeline derives narrative order from the existing manuscript structure and lets track membership refer to the same stable note.
- Aeon also prevents structural calendar changes after dated content could be reinterpreted. This app should not make a definition immutable, but any material calendar edit must preview which existing expressions change meaning and refuse an unsafe or stale write.

These sources inform behavior; none is imported, contacted, or required at runtime.

## Source model

### Timeline subjects

A structured note with type `event`, `scene`, or `chapter` is one timeline subject. Its stable note UUID is the subject identity, its title and Markdown explain it, and its time facts provide candidate positions.

A subject is computable only when it has one unambiguous usable time shape:

1. one `occurs-at` fact containing a single date or one closed interval, with no `ends-at`; or
2. one `occurs-at` fact containing a single date and one `ends-at` fact containing a single date in the same computable calendar.

An `occurs-at` closed interval already describes the complete span. Combining it with `ends-at` is ambiguous and remains visible for review. An `ends-at` without `occurs-at`, multiple simultaneous `occurs-at` claims, multiple `ends-at` claims, reversed endpoints, unknown values, unknown calendars, invalid subject types, duplicate fact IDs, or unsupported expressions also remain visible but non-computable. The app does not choose a winner based on source order or canon status.

Every valid claim remains visible with its effective canon and certainty. Filters may help a writer focus on `canon`, `draft`, `idea`, or `retired` material, but no status silently deletes a card or changes the underlying calculation.

### Chronological order and narrative order

Chronological order comes only from computable time facts plus a documented stable tie-break. Narrative order comes only from the selected manuscript's existing item order. A scene may therefore appear:

- in both orders, when a manuscript binding and a timeline note identity refer to it;
- only chronologically, for backstory or world history outside the novel; or
- only narratively, for an undated scene, dream, framing device, or planning placeholder.

The first implementation does not copy narrative order into the timeline file. A manuscript `storyDate` may appear on a scene card as writer-owned context, especially while no structured time exists, but it never becomes a hidden second date.

## Optional project file

### File name and discriminator

The proposed root file is:

`200-crappy-words.timeline.json`

Its discriminator is `200-crappy-words/timeline`, and version one is a single human-readable JSON object:

```json
{
  "format": "200-crappy-words/timeline",
  "formatVersion": 1,
  "projectId": "7848b5c8-4b08-4bc2-912e-c74c7ec8b001",
  "calendars": [],
  "tracks": []
}
```

The `projectId` must match the world-project manifest. A mismatch disables calendar and track behavior without blocking ordinary editing or the Gregorian timeline. The file is optional even for a world project.

Version-one parsing should cap the file at 1 MiB, 32 custom calendars, 128 tracks, 10,000 total track memberships, 64 months, 64 weekdays, 128 eras per calendar, and bounded strings consistent with the existing project formats. IDs are unique within their scope. Unknown fields in a supported version are retained by guarded edits; an unsupported version is explained and never rewritten.

### Calendars

The identifier `gregorian` is reserved for the built-in proleptic Gregorian subset already accepted in continuity facts. It is never redefined in the project file.

Version one proposes two bounded custom calendar kinds:

- `fixed`: numbered years composed of writer-defined months with fixed common/leap lengths and an optional repeating leap-year cycle;
- `ordinal`: a signed count of calendar days from a named origin, suitable for `Day 1`, mission-day, or sol-count timelines when months are not useful.

A fixed-calendar definition is explicit and mechanical:

```json
{
  "id": "red-reckoning",
  "title": "Red Reckoning",
  "kind": "fixed",
  "months": [
    {
      "id": "dawn",
      "name": "Dawn",
      "shortName": "Dwn",
      "commonDays": 30,
      "leapDays": 31
    },
    {
      "id": "ember",
      "name": "Ember",
      "shortName": "Emb",
      "commonDays": 30,
      "leapDays": 30
    }
  ],
  "weekdays": [
    { "id": "firstday", "name": "Firstday", "shortName": "First" },
    { "id": "secondday", "name": "Secondday", "shortName": "Second" }
  ],
  "leapCycle": {
    "years": 4,
    "leapYears": [0]
  },
  "eras": [
    {
      "id": "af",
      "name": "After the Fall",
      "abbreviation": "AF",
      "yearOne": "0",
      "direction": "forward"
    },
    {
      "id": "bf",
      "name": "Before the Fall",
      "abbreviation": "BF",
      "yearOne": "-1",
      "direction": "backward"
    }
  ],
  "anchor": {
    "expression": "af:1-01-01",
    "gregorian": "2160-01-01",
    "weekday": "firstday"
  }
}
```

Calendar, month, weekday, and era IDs use stable lowercase kebab-case keys. Display names may change without changing references. `yearOne` is a canonical signed integer identifying the calendar's internal astronomical year represented by year 1 of that era. `forward` adds later era years; `backward` subtracts them. Era years begin at 1 and have no year zero.

The leap cycle uses the internal astronomical year modulo `years`, with a non-negative Euclidean remainder. `leapYears` contains unique zero-based remainders. A month uses `leapDays` in a leap year and `commonDays` otherwise. Omitting `leapCycle` means every year has common lengths. This bounded model intentionally does not claim to represent lunar observation, variable astronomical seasons, reform gaps, timezone politics, or arbitrary scripts.

The optional full-date `anchor` equates one custom date with one Gregorian date and supplies the weekday at that custom date. With an anchor, the app can compare that calendar with Gregorian and other anchored calendars. Without one, the calendar remains fully orderable internally but cross-calendar relationships are non-computable. Changing month lengths, leap behavior, era mapping, or an anchor after facts use the calendar requires a full affected-expression preview; labels alone do not reinterpret dates.

An ordinal definition provides an identity, display label, singular/plural day labels, and optional Gregorian anchor for coordinate zero. One increment is exactly one calendar day; version one does not pretend an arbitrary orbit, watch, or fictional duration is interchangeable with a day. It has no month, weekday, or leap semantics.

### Custom expressions

The app continues to preserve the exact string in every fact. A calendar definition opts its facts into these version-one machine-readable shapes:

- fixed year: `41`
- fixed year and month: `41-03`
- fixed full date: `41-03-12`
- era-qualified equivalents: `af:41`, `af:41-03`, `af:41-03-12`
- a closed interval between two expressions of the same calendar: `af:41-03-12/af:41-03-20`
- ordinal point or closed interval: `41` or `41/48`

Month and day components are positive numeric positions in the definition, not display-name keys. The app may display `12 Dawn 41 AF`, but it preserves and previews the portable numeric expression. Signed internal years are allowed only without an era. Era-qualified years are positive. Approximation and uncertainty remain in the fact's existing `certainty` field rather than punctuation in the expression.

An expression that does not fit a known definition is not destroyed. It remains visible as an authored, non-computable time value.

### Parallel tracks

Tracks are optional writer-owned groupings, analogous to story arcs or concurrent viewpoints. They classify timeline subjects; they do not own dates or duplicate events.

```json
{
  "id": "7b93f84a-59ff-43e8-8a70-2cc4e6c7fc10",
  "title": "Mara",
  "color": "#8a5cf5",
  "noteIds": [
    "c6d5ba63-e70e-4618-9da8-6da077839f22",
    "a88a089f-ac73-4e9a-8c2f-84c83710529a"
  ]
}
```

Track UUIDs are locally generated and remain stable when a title or color changes. Track array order is the writer's display order. A note may belong to several tracks, which creates one card shown in several lanes rather than several events. Unassigned notes remain available in an explicit **Unassigned** lane. Missing or duplicated note IDs are shown as unresolved membership; the app never guesses by title or path. Removing a track removes only that grouping and never removes a note or fact.

## Deterministic temporal semantics

### Closed ranges preserve precision

Every computable position normalizes to an inclusive earliest and latest coordinate in its calendar:

| Authored shape | Normalized meaning |
| --- | --- |
| full date | that one calendar day |
| year-month | first through last day of that month |
| year | first through last day of that year |
| closed expression interval | earliest day admitted by the start through latest day admitted by the end |
| ordinal point | that one coordinate |
| ordinal interval | both stated endpoints, inclusive |

The app never pads a partial date with January 1 and then calls it exact. A reversed normalized interval is non-computable and receives a source-linked explanation.

For separate `occurs-at` and `ends-at` facts, the earliest possible start comes from `occurs-at` and the latest possible end comes from `ends-at`. If the earliest possible start is after the latest possible end, the span is impossible. If partial endpoints overlap, the span is possible but not exact enough for a stronger conclusion.

### Ordering

Cards in one computable calendar coordinate system sort by:

1. normalized earliest coordinate;
2. normalized latest coordinate;
3. normalized note title;
4. project-relative path; and
5. stable note UUID and fact UUID as final byte-stable ties.

Approximate and uncertain claims may use their stated range for a stable visual anchor, but they carry a visible qualifier and cannot support a hard contradiction outside that stated range. The app does not invent an approximation tolerance.

Cards that cannot share a coordinate system do not receive a false global order. They appear in separately labelled calendar groups or in **Needs time**, with a stable lexical order by calendar, expression, path, note ID, and fact ID. Undated narrative items retain manuscript order only in narrative mode.

### Relationship conclusions

For two exact normalized closed ranges in one coordinate system:

- **before**: A's latest coordinate is earlier than B's earliest;
- **after**: A's earliest coordinate is later than B's latest;
- **adjacent**: A's latest coordinate is the coordinate immediately before B's earliest, when the calendar has a defined successor;
- **overlaps**: the ranges share at least one coordinate; and
- **same range**: both boundaries are equal.

Reduced precision may therefore produce an overlap rather than an invented sequence. Approximate, uncertain, unanchored cross-calendar, ambiguous, or intentionally unknown inputs yield **indeterminate**, with the limiting assumption explained. Version one does not need the full Allen interval algebra in the interface.

### Age boundary for the next slice

An age calculation may consume exactly one usable `born` fact and one usable event/scene/chapter occurrence in a shared coordinate system. Exact full dates can produce a completed-calendar-year age. Partial dates produce an honest minimum/maximum age range when both bounds are finite. Approximate or uncertain inputs produce a qualified estimate or remain indeterminate; they never produce a single authoritative number. A `died` fact can bound presence but does not silently remove the character from an event.

The detailed age rule and its fixtures remain a separate implementation slice, but this timeline contract supplies all required identity, precision, and coordinate semantics.

## Source-linked experience

The left sidebar remains only the project file tree. Timeline is a deliberate workspace view, not another folder hierarchy.

The first useful view should provide:

- **Chronological** and **Narrative** modes with a plain explanation of their different sources;
- calendar and canon filters that never mutate sources;
- parallel track lanes in writer-defined order plus **Unassigned**;
- a visible **Needs time** section for undated, ambiguous, invalid, or non-computable subjects;
- a compact card showing title, written date, precision/certainty/canon badges, track membership, and optional manuscript `storyDate` context;
- details that name every fact used, the normalized range, and any assumption or refusal;
- **Open source** actions that revalidate the current fingerprint and select the exact fact range;
- verified links to related note sources through the existing reference/editor boundaries; and
- no daily-word credit for calendar, track, or fact metadata changes.

Calendar and track editing must use the same safety model as manuscript and continuity metadata: bounded validation, exact preview, fresh reread, regenerated equivalent plan, compare-before-write, atomic replacement, post-write reread, and one guarded in-session Undo. A material calendar edit must additionally list every referenced expression whose interpretation or computability would change.

Timeline layout, filters, selected mode, scroll, zoom, and collapsed tracks are app-local convenience state. Calendar definitions, stable track identity/order/membership, and writer-authored facts travel with the project.

## Failure and portability behavior

| State | Required behavior |
| --- | --- |
| Timeline file absent | Derive supported Gregorian facts; offer explicit creation only when shared calendars or tracks are requested. |
| Malformed or invalid file | Keep ordinary editing and Gregorian derivation available; explain issues; write nothing. |
| Newer format version | Preserve it untouched; disable only behavior that depends on understanding it. |
| Project ID mismatch | Ignore calendar/track semantics, explain the mismatch, and do not repair automatically. |
| Unknown supported-version field | Preserve it through guarded known-field edits. |
| Unknown calendar in a fact | Show the authored expression as non-computable and link to its source. |
| Missing/duplicated track note ID | Show unresolved membership; never fall back to title or path. |
| Calendar definition changes meaning | Require an affected-expression preview or refuse the write. |
| External change after preview | Invalidate confirmation and regenerate from freshly read sources. |

The file contains no prose copy, absolute path, account identifier, machine name, usage history, recovery text, cache, or network reference. All calculation remains local.

## Approval gates

Implementation must wait for explicit approval of these permanent choices:

1. Use one optional root `200-crappy-words.timeline.json` file for project-owned calendar definitions and parallel-track membership, while facts remain in Markdown.
2. Keep manuscript `storyDate` as unparsed planning text and derive narrative order only from the existing manuscript structure.
3. Treat one stable event/scene/chapter note as one timeline subject, with competing time facts visible but non-computable until the writer resolves them.
4. Reserve `gregorian`; support bounded `fixed` and `ordinal` custom calendars with stable IDs, named eras, optional repeating leap cycles, and optional Gregorian anchors.
5. Store track membership by stable note UUID, allow several tracks per note, and keep missing/unassigned material visible.
6. Use inclusive range normalization, stable range-based ordering, and conservative `indeterminate` results whenever certainty or calendar conversion cannot justify a stronger conclusion.
7. Keep the file tree unchanged and open Timeline as a source-linked workspace view whose view state remains app-local.

After approval, the smallest implementation sequence is:

1. publish a matching JSON Schema and pure bounded parser with preservation/refusal tests;
2. implement calendar expression normalization and deterministic range comparisons independently of UI;
3. derive a read-only timeline from the memory index and optional validated file;
4. add guarded calendar and track authoring with affected-expression previews;
5. complete packaged QA before beginning age calculations or continuity warnings.
