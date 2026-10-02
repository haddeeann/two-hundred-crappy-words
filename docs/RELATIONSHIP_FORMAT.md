# Relationship views research and proposed contract

Status: **approved for incremental implementation on 2026-10-01**

Last updated: 2026-10-01

## Purpose

This proposal defines the smallest useful relationship model for a local-first science-fiction writing tool. It is intended to help a writer answer focused questions such as:

- Who is connected to this character, faction, or spacecraft?
- What kind of connection did the writer actually record?
- Was that connection applicable at a particular time?
- Which exact fact is the evidence, and where can it be edited?

It deliberately does not define a universal social ontology, infer relationships from prose, or make a global network diagram the primary experience. Writers may invent relationships that do not fit ordinary family, political, or organizational categories. The app should preserve those claims without pretending to understand more than their sources say.

## Implementation status

Slice 0.7.7a is complete. The built-in registry now carries the approved target types and inverse display labels, and a pure bounded model derives source-linked outgoing, incoming, symmetric, and custom relationship evidence plus explicit refusal states. No relationship interface or project-file behavior shipped in that slice. The focused read-only inspector is next.

## Existing project boundary

No new storage layer is required for a first relationship view. The approved continuity fact envelope already provides:

- a stable UUID for every fact;
- a stable UUID reference to another note through a `note` value;
- an open, lowercase kebab-case property key;
- note-level and fact-level canon status;
- optional certainty and prose explanation;
- optional `validFrom` and `validTo` values;
- exact source ranges and project-relative paths;
- visible missing, duplicated, malformed, and wrong-type states;
- guarded editing that previews exact Markdown changes and never rewrites a note merely because it was opened or indexed.

The current built-in registry already contains these relationship-capable properties:

| Property | Source types | Current meaning | Direction | Multiplicity | Bounds |
| --- | --- | --- | --- | --- | --- |
| `member-of` | character, faction, spacecraft | membership in a faction, organization, or crew | source to target | many | yes |
| `parent-of` | character | parent to child | source to target | many | yes |
| `partner-of` | character | partnership | symmetric | many | yes |
| `operated-by` | spacecraft, technology | operator of a craft or technology | source to target | one applicable value to review | yes |
| `home-port` | spacecraft | customary base | source to target | one applicable value to review | yes |

Other note-valued facts are meaningful links but already have more specific homes: `located-at`, `participant`, `species`, `contained-by`, route properties, and `uses-route` belong in the location, timeline, travel, or classification experiences. `instance-of` is classification, not a social relationship. Unknown property keys are preserved as custom facts and currently receive no inferred direction, inverse, multiplicity, or target-type semantics.

The existing **Connections** disclosure is separate. It describes prose-level wiki links and backlinks. A relationship view describes explicit typed continuity facts. Neither one should silently promote the other.

## Research findings

### A relationship assertion is a labeled edge

The W3C RDF model describes a graph as subject-predicate-object triples and visualizes each predicate as a directed, labeled arc. That is a useful conceptual fit for an existing continuity fact: the note containing the fact is the subject, the property is the label, and the referenced note is the object. RDF also makes an important restraint clear: inference and inconsistency depend on an explicitly selected semantic regime. The app should not import RDF or OWL serialization, but it should keep direction explicit and avoid undeclared inference.

OWL distinguishes directional, inverse, symmetric, and asymmetric properties. Those distinctions support a small registry-owned rule: `partner-of` can be displayed from either endpoint using one source assertion, while `parent-of` must retain parent-to-child direction. An inverse is a derived reading of one fact, not permission to write a second fact into another note.

Schema.org similarly keeps distinct relationships distinct: `knows`, `memberOf`, `parent`, `spouse`, and affiliation-like links are not collapsed into one generic edge. This supports a modest built-in vocabulary while leaving writer-specific properties open.

### Multiple claims and time context are normal

Wikidata statements can have several values and attach qualifiers and references to an individual assertion. Start and end qualifiers constrain when a statement applies; value order is not semantic. The existing fact envelope already has the relevant local equivalents: a fact ID, source, certainty, canon, note, `validFrom`, and `validTo`. It does not need Wikidata ranks or another nested relationship format.

Several facts between the same two notes can be legitimate. Two people may be siblings, rivals, and crewmates; one connection can also end while another continues. The view must not merge different properties or time spans into a supposed single truth.

### Writing tools benefit from focused views

Aeon Timeline models a relationship as two items plus a relationship type, permits multiple relationships between the same pair, and provides a grid with events as rows and entities as columns. World Anvil attaches family and extended-relationship management to character articles and distinguishes family trees from broader relationships such as friends, rivals, students, and teachers. It separately presents organization-to-organization diplomacy webs.

The common useful pattern is context first: begin with a selected character, organization, event, or pair, then show the connections relevant to that context. Family trees, event/entity matrices, and diplomacy webs are specialized views rather than one default graph of every link in a world.

## Proposed durable semantics

### 1. A relationship remains a fact, not a new entity

Each eligible note-valued continuity fact is one relationship assertion. Its existing fact UUID is the assertion identity. The source note owns the assertion and remains the only file changed when the writer edits it.

Version one adds no central relationship file, relationship sidecar, hidden database, generated reciprocal fact, or persisted graph layout. A future relationship that needs its own long prose, participants, or history can already be represented as an event or another ordinary structured note; it should not force every simple edge to become a document.

### 2. Registry semantics are explicit and narrow

The initial focused view gives full semantics only to registry-defined relationship properties. Implementation should add the missing target-type declarations:

| Property | Proposed permitted target types | Display from source | Display from target |
| --- | --- | --- | --- |
| `member-of` | faction, spacecraft | Member of | Has member |
| `parent-of` | character | Parent of | Child of |
| `partner-of` | character | Partner of | Partner of |
| `operated-by` | character, faction | Operated by | Operates |
| `home-port` | location, spacecraft | Home port | Home to |

The inverse labels above are presentation vocabulary, not new property keys. They do not authorize writes or inference.

Unknown note-valued properties that resolve between character, faction, spacecraft, or location notes may appear in a collapsed **Other typed links** group. They keep their literal property label and source direction and are explicitly marked custom. The app does not guess whether a custom property is symmetric, exclusive, familial, hostile, or equivalent to another property. This keeps an open vocabulary useful without letting a spelling accidentally acquire permanent semantics.

Adding built-in friendship, rivalry, alliance, command, marriage, mentorship, or other story-specific properties is deferred until actual authoring use shows which definitions deserve shared semantics. A custom `rival-of` fact remains possible immediately.

### 3. Direction and inverse display never duplicate source

An outgoing relationship reads from the fact's source note to its target. The target's focused view may show the same assertion as an incoming relationship with the registry's inverse display label. A symmetric relationship may appear from either endpoint with the same label.

Both presentations retain one fact ID, one source path, and one exact source range. Opening or editing the relationship always returns to the source assertion. The app never writes a reciprocal fact automatically.

If a writer independently records reciprocal assertions, both remain visible evidence. The view may group visually identical assertions together only if it keeps every source separately inspectable; it must not delete, combine, or choose one as authoritative.

### 4. Time, canon, and certainty qualify rather than erase

`validFrom` and `validTo` apply exactly as they do elsewhere: they bound when that particular assertion is claimed to hold. Unbounded means the writer supplied no bound, not that the relationship is eternal. Each assertion retains effective canon and certainty.

The general focused view includes current, historical, future, uncertain, draft, contradictory, and retired assertions with visible qualification. A time filter may narrow display only when both the selected time and relationship bounds share a computable timeline axis. Cross-axis, reduced-precision, or partly overlapping evidence is shown as potentially applicable instead of silently included or excluded.

The first implementation should ship without a time filter. It should display written validity and reuse existing normalized timeline evidence later, as a separate slice, after the basic view is proven.

### 5. Multiple relationships are not a conflict by themselves

Several properties between the same notes, several targets for a `many` property, and non-overlapping historical claims are normal. For a `one-to-review` property, several potentially simultaneous applicable values remain a review condition under the existing continuity registry; the relationship view does not invent a winner.

Version one performs no transitive or familial inference. In particular, it does not derive grandparents, siblings, descendants, faction membership through another faction, inherited alliances, enemies-of-enemies, command chains, or ownership. It does not assume two locations, partners, factions, or operators are mutually exclusive.

Self-reference, reciprocal `parent-of`, ancestry cycles, overlapping operators, and duplicate-looking assertions can later become source-linked review findings. They should not block or disappear from the basic view. Science-fiction settings can intentionally contain clones, loops, distributed minds, uncertain histories, or institutions that defeat everyday assumptions; a strong finding requires a separately documented rule and evidence threshold.

### 6. Ambiguity stays visible and non-navigable

A relationship is resolvable only when:

- its source note has one unique stable ID;
- its fact ID is not duplicated anywhere in the project;
- its value is a valid `note` reference;
- that target ID resolves to exactly one indexed note; and
- a built-in property's source and target types meet its documented registry contract.

Malformed, missing, duplicated, and wrong-type references remain visible as relationship issues with their exact source. They are not drawn as edges to a guessed note. A custom note-valued fact can be displayed as a custom link only when both endpoints resolve uniquely; otherwise it remains an issue in the ordinary continuity inspector.

### 7. Maps remain a different model

A relationship edge connects two identified notes. A map links a note or event to a project-owned image plus a point or region in that image's coordinate space. Relationship views must not introduce coordinates, map files, image metadata, spatial containment, or persisted node positions. The later map slice remains independently researched and approved.

## Proposed experience

### Focused relationship inspector

The first interface should be a closed-by-default **Relationships** disclosure in Writing tools for an active character, faction, spacecraft, technology, or location note. It should show:

1. a compact count in the summary;
2. outgoing and derived incoming assertions grouped by relationship type;
3. the other note's title and type;
4. direction in plain language;
5. validity, canon, certainty, and any writer note;
6. a control to open the other note in the verified reference pane; and
7. a control to select the assertion's exact Markdown source.

Built-in relationships appear first in stable registry order. Custom links follow in a collapsed group. Within a group, entries sort by other-note title, project-relative path, source path, and fact ID—not filesystem enumeration or insertion accident.

The active note is always the anchor. Version one shows only its first-degree neighborhood and uses a readable list, not a force-directed canvas. It should cap visible assertions at 100, explain any omitted count, and perform no network request, project write, daily-credit change, or app-local relationship persistence.

### Later focused views

After the inspector is proven, useful bounded views can be added independently:

- a pair view that gathers every direct assertion between two selected notes;
- a character family view limited to explicit `parent-of` and `partner-of` evidence;
- a faction membership view centered on one faction;
- an organization diplomacy view only after a small set of faction-to-faction semantics is approved; and
- a time-filtered view that reuses the approved timeline axes and honestly exposes indeterminate applicability.

A global all-notes graph is not planned for version one. It could become an optional exploration surface only after performance, accessibility, layout ownership, filtering, and usefulness are demonstrated. It must never be the only way to read or edit relationships.

### Later completeness suggestions

The absence of a relationship can be useful planning information without being a continuity error. A later review surface may therefore offer **completeness suggestions** separately from contradictions and source problems. Examples could include a character with one explicitly recorded parent but no other family planning, a relationship type the writer has chosen to treat as paired but recorded on only one side, or a faction whose otherwise-used membership structure has an obvious unfilled role.

These prompts must remain conservative and easy to understand:

- each suggestion states the explicit source pattern that caused it;
- it says **possibly missing**, never that an unstated relationship is false or broken;
- ordinary sparse, secret, unknown, asymmetric, unconventional, or intentionally unfinished relationships remain valid;
- dismissal or an intentional-unknown explanation is available when durable exception semantics are approved;
- an accepted suggestion opens the existing guarded fact authoring flow with the proposed property and target preselected, but still requires exact Markdown preview and confirmation; and
- the app never writes a reciprocal, family, social, or organizational claim merely to make a graph look complete.

The first candidate rules, their false-positive risks, whether expectations are built-in or project-selected, and how dismissals persist require a separate research and approval gate. The initial evidence model and inspector do not imply that missing edges are errors.

## Refusal and safety boundary

The relationship experience must:

- derive entirely from the bounded in-memory lore index;
- stop at first-degree edges in the initial view;
- cap displayed results and diagnostics;
- reuse fingerprint checks before exact source selection;
- refuse stale, missing, ambiguous, duplicated, symbolic, outside-project, or wrong-type navigation;
- keep authoring behind the existing exact preview, compare-before-write, and guarded Undo boundary;
- never rewrite an opposite endpoint merely to maintain symmetry;
- never scan prose to invent typed relationships;
- never hide an assertion because its canon or certainty looks weak; and
- never require a network service or send project content away from the machine.

## Proposed implementation slices

1. **0.7.7a — Relationship evidence model.** Add target-type and inverse-display metadata to the registry, derive bounded outgoing/incoming/custom assertions and issues in a pure module, and exhaustively test resolution, direction, source identity, ordering, and refusal.
2. **0.7.7b — Focused relationship inspector.** Add the closed-by-default active-note disclosure, exact source selection, verified reference opening, stale-overlay behavior, accessibility, omission messaging, and no-credit/no-write guarantees.
3. **0.7.7c — Relationship authoring refinements.** Reuse the existing continuity editor with relationship-filtered property and target choices; verify that symmetric and incoming displays always edit the sole source fact and never auto-write another note.
4. **0.7.7d — Relationship review and completeness suggestions.** Research and approve each proposed deterministic rule before shipping it. Keep source problems, contradictions, and possibly missing planning coverage visibly distinct; begin only with evidence-safe conditions rather than broad social assumptions.
5. **0.7.7e — Packaged QA and documentation.** Exercise active character, faction, and spacecraft views; outgoing/incoming/symmetric/custom claims; time bounds; missing and copied identities; stale source protection; keyboard behavior; source hashes; daily credit; restart; and project restoration.

Pair, family, diplomacy, time-filtered, and graph views are later optional slices, not requirements hidden inside the first inspector.

## Approved decisions

The user approved these permanent choices on 2026-10-01:

1. **Storage:** reuse existing per-note continuity facts; add no central relationship file, relationship entity, reciprocal source write, or persisted graph layout.
2. **Vocabulary:** give semantics to the five existing relationship-capable built-ins; show uniquely resolved custom note-valued entity links only as literal, directed, clearly custom links; defer new universal social property names.
3. **Direction:** source facts own direction; incoming and symmetric views are derived display with one exact source; independent reciprocal facts remain separate evidence.
4. **Qualification:** preserve and display every assertion's validity, canon, certainty, and note; do not interpret missing bounds as eternal or weak canon as absent.
5. **Multiplicity and inference:** allow multiple direct relationships; reuse existing one-to-review behavior; infer no transitive, familial, organizational, spatial, or social relationship.
6. **Ambiguity:** never connect a guessed endpoint; surface unresolved and incompatible evidence without blocking ordinary writing.
7. **Initial UX:** ship an anchor-first, closed-by-default, first-degree list capped at 100; defer a global graph and specialized family/diplomacy views.
8. **Maps:** keep map images, coordinates, points, regions, and spatial UX out of this format and behind their own research and approval gate.

## Primary references

- W3C, [RDF 1.1 Concepts and Abstract Syntax](https://www.w3.org/TR/rdf11-concepts/)
- W3C, [OWL 2 Web Ontology Language Primer](https://www.w3.org/TR/owl2-primer/)
- Schema.org, [Person properties](https://schema.org/Person)
- Wikidata, [Data model](https://www.wikidata.org/wiki/Wikidata:Data_model)
- Wikidata, [Statements](https://www.wikidata.org/wiki/Help:Statements)
- Wikidata, [Qualifiers](https://www.wikidata.org/wiki/Help:Qualifiers)
- Aeon Timeline, [Key Concepts](https://help.timeline.app/article/154-key-concepts)
- Aeon Timeline, [Relationship View](https://help.timeline.app/article/164-relationship-view)
- World Anvil, [Feature Guide to Family Trees](https://www.worldanvil.com/learn/family-trees/family-trees-guide)
- World Anvil, [Guide to Article Templates](https://www.worldanvil.com/learn/article-guides/article-templates)
