# Relationship review and completeness proposal

Status: **approved and implemented**

Last updated: 2026-10-02

The user approved all six permanent choices on 2026-10-02. The implemented
review follows this proposal without adding project persistence, inferred
missing relationships, reciprocal requirements, or app-local dismissals.

## Purpose

This proposal defines the smallest relationship-review layer that can help a writer notice suspicious evidence without turning unstated family, social, political, or organizational assumptions into supposed truth. It does not change the approved relationship storage or write a project file.

The proposal distinguishes three things that must not be merged:

1. **Source problems** are malformed, duplicate-ID, unresolved, or type-incompatible facts that already have an exact source.
2. **Relationship review** is a deterministic pattern across otherwise usable facts that may deserve the writer's attention.
3. **Planning prompts** say that something may be missing only because the writer explicitly chose a completeness expectation.

## Existing product boundary

The app already has most of the trustworthy machinery needed for review:

- stable note and fact UUIDs;
- exact source ranges and fingerprints;
- canon, certainty, validity bounds, and writer notes;
- a bounded relationship model with explicit source problems;
- a versioned travel finding with stable IDs, `information` and `review` severities, exact evidence, and a 100-result cap;
- guarded source editing with exact preview and Undo; and
- no network dependency, derived-state persistence, or daily-credit effect.

It does **not** have a portable continuity-rule file, durable finding exceptions, or a safe meaning for a local-only dismissal. Decision D-038 deliberately deferred exception persistence until concrete checks existed. Hiding a repeated result only on one Mac would conflict with the project's portability and backup expectations.

## Research findings

### Absence is not falsity

The [OWL 2 Primer](https://www.w3.org/TR/owl2-primer/) distinguishes a database's closed-world assumption from an open-world model in which an absent fact may simply be missing while still being true. That is the right default for a writer's world bible. A character with no recorded parent, partner, faction, or home port is incomplete only if the writer says that category should be complete.

The practical consequence is strict: version one should not infer that every character has two parents, one partner, a faction, or any relationship at all. It should not demand reciprocal source facts for a symmetric relationship because the approved model already derives the reverse reading from one writer-owned fact.

### Constraints need explicit scope, severity, evidence, and exceptions

The W3C [Shapes Constraint Language](https://www.w3.org/TR/shacl/) separates the data being checked from the shapes that declare expectations. It supports minimum and maximum counts, source shapes, result paths, human messages, `Info`/`Warning`/`Violation` severities, and deactivated shapes. Validation produces a report and must not mutate the input graphs.

Wikidata's [property-constraint model](https://www.wikidata.org/wiki/Help:Property_constraints_portal) similarly distinguishes mandatory from suggestion constraints, names known exceptions, scopes checks, and records clarifications and recommended actions. Its [symmetric constraint guidance](https://www.wikidata.org/wiki/Help:Property_constraints_portal/Symmetric) explicitly lists three resolutions: add the missing statement, remove the existing statement, or accept a legitimate exception.

These systems support the app's existing direction: a result should identify the rule and exact evidence, explain why it appeared, remain separate from source corruption, and never repair source automatically. A future completeness rule should be project-selected rather than silently built in.

### Formal family semantics are useful signals, not universal story law

The [OWL 2 Primer](https://www.w3.org/TR/owl2-primer/) uses `parentOf` as an irreflexive property and child direction as an asymmetric example, while explicitly acknowledging paradoxical time-travel scenarios. That makes parent cycles good **review** evidence for science fiction, but not grounds for a hard contradiction.

OWL also models symmetric properties semantically rather than requiring two stored assertions. That agrees with the approved `partner-of` design: one fact can be displayed from both endpoints, and a missing reciprocal source fact is not missing content.

### Writing tools favor explicit relationships and focused context

[Aeon Timeline's relationship view](https://help.timeline.app/article/164-relationship-view) uses an event/entity grid, and its [key concepts](https://help.timeline.app/article/154-key-concepts) define relationships as two items plus an explicit relationship type. [World Anvil's family-tree guide](https://www.worldanvil.com/learn/family-trees/family-trees-guide) asks writers to create the relevant character articles before connecting them and keeps extended relationships explicit. Neither pattern justifies guessing a universal minimum number of social or family links.

## Recommended version-one relationship reviews

All rules below are memory-only, capped, deterministic, versioned, and severity **review**. None marks a fact false, blocks writing, changes a file, awards words, or makes a network request.

| Rule | Trigger | Why it is useful | Why it is only review |
| --- | --- | --- | --- |
| `relationship.parent.cycle` v1 | Resolved `parent-of` facts form a bounded directed cycle, including self-parent and two-note reciprocal cycles. Each fact in the cycle is exact evidence. | Cycles often indicate a reversed edge, copied target, or mistaken identity. | Time loops, clones, recursive ancestry, uncertain histories, and deliberately nonordinary beings can make the pattern intentional. |
| `relationship.assertion.duplicate` v1 | Two different fact IDs have the same source, property, target, canon, certainty, validity bounds, and writer note. | The writer may have pasted the same assertion twice. | Distinct facts remain writer-owned evidence; the app has no provenance field proving redundancy. |
| `relationship.single.applicability` v1 | One source has several usable `operated-by` or `home-port` facts that are not definitely separated by their validity bounds. | These properties are already registry-defined as one applicable value to review; the result points to every candidate source. | Missing or imprecise bounds do not prove simultaneity, and science-fiction craft or systems may intentionally have several operators or homes. |

The parent-cycle traversal should stop after 64 links and report that bound rather than implying the graph was fully proven. The project result set should cap at 100 findings after deterministic ordering and expose an omission count. A stable finding ID should include rule ID, rule version, and sorted contributing fact IDs so the same evidence produces the same identity.

The first release should **not** add these plausible-looking rules:

- no "second parent missing" prompt;
- no partner, faction, operator, or home-port minimum;
- no missing reciprocal `partner-of` source fact;
- no grandparents, siblings, children, alliances, ownership, or command-chain inference;
- no parent/partner disjointness rule;
- no exclusivity rule for partners, factions, operators, or homes; and
- no custom-property rule beyond existing source validity.

## Completeness prompts require writer-owned expectations

A useful future prompt could say, for example, "This project expects every principal character to have a home faction; this character has none recorded." The important evidence is not merely the missing edge. It is the **project-owned expectation** plus the eligible subject and current fact set.

Therefore completeness prompts should wait for a separately approved portable policy rather than emerge from frequency or everyday social assumptions. That policy would need to define:

- a stable rule ID and version;
- eligible note types or explicit note IDs;
- the property being counted;
- minimum or maximum count;
- whether validity, canon, or certainty affects applicability;
- severity fixed to a non-error planning prompt;
- a human explanation; and
- how a writer disables the rule or records an intentional exception.

This project should not import SHACL or RDF. Their design lesson is the separation of data from declared expectations, not their serialization.

## Exception and dismissal boundary

Version one should not ship a **Dismiss** button that stores hidden app-local state. A finding that reappears on another Mac or after restoring the project would be misleading. It should instead say that the pattern may be intentional and keep exact source actions available.

Durable exceptions should be designed once for the wider continuity-review milestone, not separately for relationships. A future portable exception needs at least a stable rule ID/version, the relevant stable note/fact IDs, a writer explanation, and behavior when evidence changes or disappears. Whether that belongs in one optional project continuity file or in source facts is a separate format decision.

## Proposed experience

The focused Relationships disclosure should keep three visually separate sections:

1. **Source problems** — current malformed, duplicated-ID, missing-target, ambiguous-target, and wrong-type evidence, with **Edit source fact** where safe.
2. **Relationship review** — the three approved deterministic rules, each with a plain-language explanation, every contributing source, and no dismiss action.
3. **Planning prompts** — absent until a portable project-selected expectation format is approved and enabled.

The summary should count source problems and review findings separately from relationship assertions. Each result should expose **Why this appeared** in ordinary language and reuse verified exact-source navigation. Findings remain local derived output and must never create, remove, reciprocate, or edit a relationship automatically.

## Approval gates

Implementation should begin only after explicit answers to these permanent choices:

1. **Initial rules:** approve the bounded parent-cycle, exact-duplicate, and potentially simultaneous one-to-review checks as the complete first set.
2. **Severity:** label every result **review**, never contradiction or error, regardless of canon/certainty.
3. **Completeness:** add no built-in missing-family/social/organizational prompts; require an explicit future project-selected policy.
4. **Reciprocity:** never treat a missing reciprocal source fact as missing content, including for `partner-of`.
5. **Exceptions:** ship no app-local dismissal; defer portable exceptions to the general continuity-review format decision.
6. **Presentation:** keep Source problems, Relationship review, and future Planning prompts visibly separate, with exact evidence and guarded authoring actions.

## Proposed implementation sequence after approval

1. Add a pure bounded finding model and focused fixtures for all three rules, non-findings, ordering, IDs, caps, cycles, qualifications, and ambiguity refusal.
2. Present findings in the focused inspector with exact evidence and stale-source protection; do not add persistence.
3. Complete packaged regression QA across characters, factions, and spacecraft, then close relationship version one.
4. Revisit project-selected completeness policies and portable exceptions during the general continuity-review format gate.
