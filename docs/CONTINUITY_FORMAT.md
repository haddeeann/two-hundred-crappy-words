# Continuity fact format

Status: **approved; version-one parsing, indexing, inspection, and guarded authoring are implemented; the timeline contract is proposed and continuity checks remain pending**

Last updated: 2026-09-22

This proposal defines the smallest portable fact boundary that could support timelines, ages, travel, relationships, and deterministic continuity review. It deliberately does not define a universal science-fiction ontology. Writers keep prose in Markdown, opt into structured facts only where useful, and remain able to represent uncertainty, disagreement, and deliberate unknowns.

No existing project or note is migrated merely by opening it. The app recognizes optional `canon` and `facts` metadata in addition to `id`, `type`, `title`, and `aliases`. Only an explicit writer-reviewed authoring action writes those fields; opening, indexing, compiling, searching, or inspecting a note never inserts, normalizes, sorts, or rewrites continuity metadata.

The researched next-layer proposal for chronology, custom calendars, eras, parallel tracks, and ordering semantics lives in [`TIMELINE_FORMAT.md`](TIMELINE_FORMAT.md). It is not approved or implemented yet.

## Research conclusions

The proposal borrows concepts rather than external serialization formats:

- YAML 1.2.2 defines maps, sequences, and scalar values and describes a JSON-compatible schema. The app should extend its current parser only with a bounded JSON-compatible subset: quoted strings, explicitly validated decimal strings, booleans where specified, maps, and block sequences. Tags, anchors, aliases, merge keys, executable values, implicit dates, and arbitrary object construction remain forbidden.
- Wikibase models one factual statement as a property/value claim with optional qualifiers, references, and a coarse rank. That shape usefully preserves multiple values and contextual validity without pretending one value must silently win. This app should adopt the small statement envelope, not Wikibase IDs, RDF, ranks, query language, or network model.
- W3C PROV treats provenance as the entities and activities involved in producing a result. Here, the writer-owned note, fact ID, source range, and deterministic rule are enough provenance for a continuity finding; a full provenance ontology would be disproportionate.
- Library of Congress EDTF distinguishes exact, uncertain, approximate, unspecified, interval, and open dates. W3C OWL-Time also distinguishes instants, intervals, durations, ordinal time, and non-Gregorian reference systems. The first app vocabulary should preserve those distinctions explicitly instead of forcing every world into JavaScript dates or Earth time.
- RFC 3339 remains appropriate only for exact real-world timestamps with an offset. It should not be used for fictional calendar dates, approximate dates, year-only values, or floating story time.
- UCUM gives real scientific and engineering units stable codes and also acknowledges arbitrary units. The app may validate supported UCUM codes, but fictional units require project-owned definitions and must never be converted by guessed physics.
- JSON Schema 2020-12 is a useful way to publish machine-readable validation later. It does not replace the app's bounded parser, source ranges, unknown-field preservation, or writer-facing diagnostics.

Primary references are listed at the end of this document.

## Recommended model

### 1. Optional note-level canon status

A structured note may declare one default:

```yaml
canon: "draft"
```

Allowed values:

- `idea`: speculative material retained for exploration;
- `draft`: intended direction that is not yet settled;
- `canon`: currently accepted truth in this project;
- `retired`: preserved historical material that should not drive ordinary checks.

The field is optional. No status is inferred from folder name, note type, prose wording, manuscript inclusion, or recency. Notes without it remain usable and appear as **unspecified**, not secretly `draft` or `canon`. Retired material remains searchable and visible.

### 2. Optional statement list

Facts are an ordered block sequence under `facts`. Each fact is a bounded mapping:

```yaml
facts:
  - id: "2e3120e7-0e74-4e3c-99a1-f2f76469559d"
    property: "born"
    value:
      kind: "time"
      calendar: "gregorian"
      expression: "2134-04-06"
    certainty: "exact"
```

Required fields:

- `id`: canonical lowercase UUID v4 generated locally; stable identity for findings, later exceptions, and guarded edits;
- `property`: lowercase kebab-case key whose meaning comes from a documented property registry;
- `value`: exactly one discriminated value mapping from the supported kinds below.

Optional fields:

- `canon`: overrides the note-level canon value for only this fact;
- `certainty`: `exact`, `approximate`, or `uncertain`; absence means **unspecified**, not exact;
- `validFrom` and `validTo`: time values that bound when a relationship or changing property applies;
- `note`: a short quoted explanation, capped and treated as data rather than Markdown;
- unknown keys, retained exactly but ignored by features that do not understand them.

Order is presentation order only. It does not rank competing statements or make the last value authoritative. Duplicate properties and contradictory values are valid input; a property definition may turn them into a review finding, never an automatic rewrite.

### 3. Typed values

The first envelope should reserve these value kinds without requiring every kind in the first implementation.

#### Note reference

```yaml
value:
  kind: "note"
  id: "f8c20f24-4368-4c21-a1f7-a2ba31bd73a4"
```

The stable note UUID is authoritative. The UI resolves and displays the current title and path; it does not store a second title that can drift. A missing or duplicate target is an explicit unresolved value.

#### Text

```yaml
value:
  kind: "text"
  text: "O-negative"
```

Text is for genuinely literal properties, not a fallback for relationships, dates, or quantities that the app would later need to guess.

#### Quantity

```yaml
value:
  kind: "quantity"
  amount: "12.5"
  unitSystem: "ucum"
  unit: "km"
```

Amounts are canonical decimal strings so YAML number coercion and binary floating-point do not change writer data. `unitSystem: "ucum"` permits only a supported UCUM expression. A future `unitSystem: "project"` must reference a project-owned unit definition and conversion rule before arithmetic is allowed. An unknown unit remains displayable but non-computable.

#### Range

```yaml
value:
  kind: "range"
  minimum: "3.2"
  maximum: "4.1"
  unitSystem: "ucum"
  unit: "h"
```

Both bounds use the same unit and are inclusive unless a future version explicitly adds boundary semantics. A single estimated value uses `quantity` plus `certainty`; it should not invent a false range.

#### Time

```yaml
value:
  kind: "time"
  calendar: "gregorian"
  expression: "2134-04"
```

For `gregorian`, the initial expression subset should accept year, year-month, full date, and start/end intervals while preserving the written precision. Approximation and uncertainty live in the explicit `certainty` field instead of punctuation that many writers will not recognize. Exact real-world timestamps, if later needed, use a separate RFC 3339 form with an explicit offset.

Other calendars are not interpreted until the project contains an approved calendar definition. A value with an unknown calendar remains visible and non-computable. Named eras and ordinal story positions should be first-class later time systems, not coerced to Gregorian dates.

#### Intentional unknown

```yaml
value:
  kind: "unknown"
  reason: "The reveal is intentionally undecided."
```

This is different from a missing property. It lets a writer state that the question exists and is deliberately unresolved. Continuity tools may surface it as context but must not report it as an accidental omission.

### 4. Property registry, not a closed ontology

The fact envelope is the durable format. Property semantics are an extensible, versioned registry.

Each built-in property definition should state:

- the allowed subject note types;
- the allowed value kind;
- whether multiple simultaneous values are ordinary, suspicious, or forbidden for a deterministic calculation;
- whether `validFrom`/`validTo` apply;
- an optional inverse property used only for display or checks, never auto-written;
- the deterministic rules that consume it.

Unknown property keys remain preserved and visible as custom facts but do not participate in checks. This lets the registry grow without migrating every note and avoids claiming one vocabulary fits every fictional world.

The first registry should be selected only to unlock the next concrete tools. A recommended minimal seed is:

- time and age: `born`, `died`, `occurs-at`, `ends-at`;
- presence: `located-at`, `participant`;
- identity and classification: `instance-of`, `species`;
- relationships: `member-of`, `parent-of`, `partner-of`;
- spacecraft/faction context: `operated-by`, `home-port`.

These names are the approved version-one seed vocabulary. The parser also accepts lowercase kebab-case custom properties and records them without assigning semantics. Each deterministic checker must document the subject types, value kind, simultaneous-value behavior, validity bounds, direction or inverse behavior, and rule version it actually consumes before that checker ships.

The shipped registry currently defines:

| Property | Subject note types | Value | Simultaneous values | Validity bounds | Direction |
| --- | --- | --- | --- | --- | --- |
| `born` | character | time | one to review | no | attribute |
| `died` | character | time | one to review | no | attribute |
| `occurs-at` | event, scene, chapter | time | one to review | no | attribute |
| `ends-at` | event, scene, chapter | time | one to review | no | attribute |
| `located-at` | character, spacecraft, event, scene | note | one to review | yes | outgoing |
| `participant` | event, scene, chapter | note | many | yes | outgoing |
| `instance-of` | every built-in note type | note | many | yes | outgoing |
| `species` | character | note | one to review | yes | outgoing |
| `member-of` | character, faction, spacecraft | note | many | yes | outgoing |
| `parent-of` | character | note | many | yes | outgoing parent to child |
| `partner-of` | character | note | many | yes | symmetric; self-inverse |
| `operated-by` | spacecraft, technology | note | one to review | yes | outgoing |
| `home-port` | spacecraft | note | one to review | yes | outgoing |

“One to review” does not make a second fact invalid. It tells a later deterministic rule that overlapping values deserve explanation; both writer claims remain intact.

### 5. Findings are derived evidence, not new canon

A continuity finding stays memory-only and contains:

- a stable rule ID and rule version;
- severity such as information, review, or contradiction—not “truth”;
- the exact note IDs, fact IDs, current paths, and source ranges used;
- the calculation or comparison in plain language;
- any assumption that prevented a stronger conclusion;
- no prose copy outside the selected project and no network request.

If an input changes, the finding is recomputed. The app does not write a correction, choose a winning claim, or silently change canon status.

Persisting intentional exceptions is a later decision gate. The recommended direction is a portable, human-readable project file containing rule ID, referenced fact IDs, and the writer's explanation. It should not be app-local because exceptions are creative project decisions that belong in backups. Its filename, schema, and stale-reference behavior remain deliberately undecided here.

## Parsing and compatibility boundary

The version-one implementation:

1. leave ordinary Markdown and existing structured notes valid;
2. parse the existing four fields exactly as today;
3. recognize only `canon` plus the documented `facts` subset;
4. accept only quoted strings except fields explicitly defined as booleans;
5. cap fact count, nesting depth, scalar length, and total accepted frontmatter bytes;
6. forbid tags, anchors, YAML aliases, merge keys, duplicate mapping keys, implicit timestamps, non-finite numbers, and executable/custom values;
7. record exact source ranges for each fact and field;
8. preserve unknown top-level and fact-level keys through any explicit guarded metadata edit;
9. treat one malformed fact as unavailable without discarding other valid facts or the Markdown body;
10. never insert, normalize, sort, or migrate facts on open or index refresh.

The accepted frontmatter is capped at 256 KiB, 256 facts, one nested value-mapping level, 80 Unicode characters for keys, calendars, unit systems, and units, 120 characters for decimal and time expressions, and 1,000 Unicode characters for literal text, notes, and intentional-unknown reasons. Amounts are canonical decimal strings; Gregorian values receive calendar-aware date validation. Duplicate fact IDs inside one note make every local copy unavailable. IDs copied across different notes remain visible but produce a project-index issue and are unavailable to checks.

The matching [JSON Schema 2020-12 document](schemas/continuity-frontmatter-v1.schema.json) describes the portable data shape. The prose rules and tested parser remain authoritative where indentation, duplicate keys, calendar arithmetic, source locations, and unknown-source preservation go beyond JSON Schema.

## Source-linked inspection

Writing tools contains a closed-by-default **Continuity** disclosure for the active Markdown note. It shows the note-level canon state, valid facts, inherited or overridden canon, certainty, validity ranges, intentional unknowns, custom-property status, registry mismatches, and safe-parser diagnostics. Stable note-reference values resolve through the existing memory index; missing and duplicated identities remain explicit. A resolved target opens in the existing read-only reference pane. Each fact links to its exact frontmatter range only while the active buffer fingerprint matches the index, so a stale overlay cannot select stale coordinates.

This surface is derived locally and contributes no daily credit. Inspection never writes project files.

## Guarded authoring

The authoring layer produces immutable plans for setting or removing note canon, appending a complete new fact, editing the known fields of one uniquely identified fact, and removing one uniquely identified fact. A plan requires the expected stable note ID, valid current structured metadata, and exact source ranges. It edits only those ranges, preserves the detected line ending, retains unknown top-level/fact/value fields, and leaves the complete Markdown body byte-for-byte unchanged. A fact's UUID is not editable. A value-kind change removes only obsolete recognized value fields, adds the required recognized fields, and retains unfamiliar nested extensions exactly. Every proposed result is parsed again and must contain the intended semantic result before it can become ready.

Authoring is available only for a saved active note whose indexed fingerprint and unique stable note ID are current. Note-valued choices contain only uniquely identified indexed notes; a local UUID v4 is generated for each new fact. The contained form shows the exact changed Markdown lines plus unchanged-character boundaries before confirmation. Confirmation rereads the file, rebuilds the same semantic plan, requires it to match the frozen reviewed result exactly, and then uses the ordinary compare-before-write boundary. A successful mechanical edit refreshes the editor and index without daily credit and retains one exact in-session Undo, which refuses any changed or unavailable source. External changes invalidate the authoring surface and its stale source actions before a write can occur.

## Proposed example

```markdown
---
id: "c6d5ba63-e70e-4618-9da8-6da077839f22"
type: "character"
title: "Mara Venn"
aliases:
  - "Commander Venn"
canon: "canon"
facts:
  - id: "2e3120e7-0e74-4e3c-99a1-f2f76469559d"
    property: "born"
    value:
      kind: "time"
      calendar: "gregorian"
      expression: "2134-04-06"
    certainty: "exact"
  - id: "e826d938-162d-4d72-9a88-588d669599f7"
    property: "member-of"
    value:
      kind: "note"
      id: "f8c20f24-4368-4c21-a1f7-a2ba31bd73a4"
    validFrom:
      kind: "time"
      calendar: "gregorian"
      expression: "2161"
    certainty: "approximate"
  - id: "6543bf32-14ba-48d7-91ab-b36892990360"
    property: "birth-location"
    value:
      kind: "unknown"
      reason: "The reveal is intentionally undecided."
---

# Mara Venn

Writer-authored prose remains here.
```

## Approved decisions

The user approved these choices on 2026-09-22:

1. **Storage:** nested safe-subset YAML facts inside each structured Markdown note, rather than a central lore database or one sidecar per note.
2. **Identity:** stable locally generated UUIDs for individual facts, despite their visual cost in raw Markdown.
3. **Canon:** optional note-level default plus optional per-fact override using `idea`, `draft`, `canon`, and `retired`.
4. **Values:** the proposed `note`, `text`, `quantity`, `range`, `time`, and `unknown` discriminated mappings.
5. **Vocabulary:** an open property registry with unknown custom properties preserved but ignored by deterministic checks.
6. **First property names:** the minimal seed list above, especially relationship direction and naming.
7. **Exceptions:** defer the portable exception-file design until the first checks exist, rather than hiding dismissals in app-local state.

## Primary references

- YAML, [YAML 1.2.2 specification](https://yaml.org/spec/1.2.2/)
- MediaWiki, [Wikibase data model](https://www.mediawiki.org/wiki/Wikibase/DataModel)
- W3C, [PROV model primer](https://www.w3.org/TR/prov-primer/)
- Library of Congress, [Extended Date/Time Format](https://www.loc.gov/standards/datetime/edtf.html)
- W3C, [Time Ontology in OWL](https://www.w3.org/TR/owl-time/)
- RFC Editor, [RFC 3339 timestamps](https://www.rfc-editor.org/info/rfc3339/)
- UCUM, [Unified Code for Units of Measure specification](https://ucum.org/ucum)
- JSON Schema, [2020-12 specification](https://json-schema.org/specification)
