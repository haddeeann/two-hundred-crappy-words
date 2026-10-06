# Deterministic continuity review proposal

Status: **awaiting approval**

Last updated: 2026-10-05

## Purpose

This proposal defines the smallest project-wide continuity review that can help
a writer find evidence-backed problems without treating incomplete planning,
freeform prose, or ordinary science-fiction ambiguity as falsehood. It unifies
the deterministic checks already present in 200 Crappy Words, adds two narrow
structured-fact rules, and resolves the previously deferred portable-exception
boundary.

No implementation, project-format change, source write, or network behavior is
authorized by this document. The decisions at the end require explicit user
approval first.

## Existing product boundary

The app already has trustworthy pieces that should be reused rather than
reimplemented:

- stable project, note, fact, manuscript, and outline-item UUIDs;
- exact source ranges, current fingerprints, guarded source navigation, and
  compare-before-write authoring;
- optional `idea`, `draft`, `canon`, and `retired` status plus `exact`,
  `approximate`, and `uncertain` certainty;
- typed, open-vocabulary continuity facts whose built-in properties declare
  subject types, value kinds, applicability bounds, and simultaneous-value
  expectations;
- source diagnostics for malformed metadata, copied identities, unresolved or
  type-incompatible references, broken or ambiguous wiki links, unusable
  timeline evidence, and unusable travel evidence;
- versioned relationship findings for parent cycles, exact duplicate
  assertions, and potentially simultaneous single-applicability claims;
- versioned travel-presence findings with `information` and `review` severity;
- calculated character appearances that distinguish hard impossibility from
  qualified or indeterminate evidence;
- travel arrival comparison that distinguishes compatible, review, and hard
  contradiction results;
- deterministic ordering, 64-link traversal bounds where relevant, 100-result
  caps, omission counts, exact evidence, and no automatic repairs; and
- an intentionally deferred exception format. No app-local finding dismissal
  currently exists.

The manuscript structure also has stable scene and chapter identities and
source bindings. Its `pov`, `location`, and `storyDate` strings are deliberately
display-only in version one. They are not typed lore references or time facts
and must not become continuity claims merely because their text resembles a
name or date.

## Research findings

### Validation results need a rule, focus, severity, evidence, and explanation

The W3C [SHACL 1.2 Core](https://www.w3.org/TR/shacl12-core/) validation report
keeps results separate from the data being checked. A result identifies its
severity, focus node, property path or value where relevant, source constraint,
source shape, and human-readable message. The older stable
[SHACL Recommendation](https://www.w3.org/TR/shacl/) likewise treats validation
as a report rather than a mutation of the input graph.

200 Crappy Words should borrow that result shape, not RDF or SHACL syntax: every
finding needs a stable versioned rule, an explicit subject, exact contributing
sources, severity, and a plain-language explanation. Source diagnostics and
cross-source findings remain visibly different categories.

### Stable identity should follow semantic evidence, not line numbers

The OASIS [SARIF 2.1 standard](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html)
uses stable rule identifiers and fingerprints to correlate logically identical
results across runs. Its fingerprint guidance warns against absolute line
numbers because unrelated edits move them. SARIF suppressions may carry a
writer-supplied justification, and rule or fingerprint versions let changed
analysis semantics invalidate an old match instead of silently reusing it.

For this project, a finding fingerprint should therefore derive from its rule
ID, rule version, and sorted stable evidence identities such as fact IDs and
manuscript item IDs. Current paths and source ranges still power navigation,
but do not define durable identity.

### Provenance is useful only when it reaches the writer's source

The W3C [PROV-O Recommendation](https://www.w3.org/TR/prov-o/) models results as
derived from identifiable entities and activities. 200 Crappy Words does not
need a provenance ontology, but it should retain the practical lesson: a
finding is useful only if the writer can see which project sources and which
deterministic rule produced it.

### Writing tools support explicit planning context, not silent truth mining

Official [Plottr features](https://plottr.com/features/) and
[timeline filtering guidance](https://docs.plottr.com/article/61-timeline-filtering)
center explicit scene cards, characters, places, attributes, and filters.
[Campfire's product description](https://www.campfirewriting.com/apps) likewise
separates manuscript writing from explicit worldbuilding modules. These tools
support a focused manuscript/world view, but do not justify treating arbitrary
prose or freeform scene labels as typed canon.

The proposed review therefore consumes documented structured facts and stable
manuscript membership only. Prose inference remains outside deterministic
version one and outside the privacy-preserving core workflow.

## Proposed result model

One memory-only project review derives three visibly separate collections:

1. **Source problems** — malformed or unusable writer-owned sources. These are
   not exceptions or contradictions. They say what could not be safely read or
   resolved and link to the exact source where possible.
2. **Continuity findings** — deterministic comparisons across usable sources.
   Each carries a stable ID, rule ID/version, severity, summary, explanation,
   exact evidence, scope memberships, and any limit or ambiguity that weakened
   the conclusion.
3. **Intentional exceptions** — still-visible findings that the writer has
   explicitly accepted with a portable explanation. An exception never edits
   or proves the underlying sources true.

Planning prompts for absent facts remain a fourth conceptual category but stay
empty until a writer-selected completeness policy is separately designed and
approved. Missing data is not falsity.

### Severity

The shared presentation uses exactly three finding severities:

- **Information** — a useful compatible or indeterminate calculation that is
  worth inspecting but does not suggest a problem;
- **Review** — the evidence may conflict, overlap, duplicate, or require a
  writer decision, but the app cannot prove impossibility; and
- **Contradiction** — uniquely identified, computable, same-axis evidence makes
  the claims mutually impossible under the documented rule.

`Error` is reserved for application or source-loading failure and is not a
creative-truth label. A contradiction never blocks writing, compiling, or
export, and it may be marked intentional.

### Canon and certainty gate

Canon status and certainty affect strength but never choose a winning fact:

- source problems remain visible for every status;
- facts whose effective canon is `retired` do not drive ordinary findings, but
  remain available behind an **Include retired evidence** filter;
- `idea`, `draft`, or unspecified canon evidence can produce Information or
  Review, but cannot produce Contradiction;
- Contradiction requires every contributing claim to have effective canon
  `canon`, explicit certainty `exact`, unique usable identity, and all
  rule-specific computability requirements; and
- a mixture of canon states or certainty states is explained and capped at
  Review rather than silently discarded.

This tightens the current hard-contradiction boundary, which checks exactness
but does not yet consistently require effective canon.

## Initial rule set

Version one should aggregate the already implemented results rather than
renaming them or changing their stable IDs:

| Existing family | Project-review treatment |
| --- | --- |
| Relationship parent cycle, exact duplicate, and single-applicability reviews | Reuse the existing rule IDs, versions, evidence, 64-link bound, and Review severity. |
| Travel endpoint presence | Reuse compatible/indeterminate Information and unconnected-location Review results; never promote them to Contradiction because the format has no disjoint-location assertion. |
| Character appearance before birth or after death | Promote an existing hard impossibility to Contradiction only through the shared canon-and-certainty gate; otherwise show Review or Information with the existing reason. |
| Authored versus calculated travel arrival | Promote an existing hard disjoint result to Contradiction only through the shared gate; otherwise show Review or Information. |
| Timeline and travel subject issues | Present as Source problems with their current source evidence, not as exceptions. |
| Frontmatter, identity, reference, and wiki-link diagnostics | Present as Source problems; never guess a repair or allow an exception to hide unreadable evidence. |

Two new rule families complete the first general review without inventing an
ontology:

| New rule | Trigger | Severity boundary |
| --- | --- | --- |
| `continuity.single-applicability` v1 | One uniquely identified source note has two or more usable facts for a built-in property declared `one-to-review`, and the facts are not definitely separated by valid applicability bounds. Properties already covered by the relationship rule keep their existing rule and are excluded to prevent duplicate findings. | Review only. Multiple values, missing bounds, or broad intervals may be intentional. Every candidate fact is evidence. |
| `timeline.lifespan.order` v1 | One unique usable `born` fact and one unique usable `died` fact for a character share a computable axis and the complete death range is before the complete birth range. | Contradiction only through the shared canon-and-certainty gate; otherwise Review. Time loops, resurrection conventions, clones, or deliberately disputed records can be intentional exceptions. |

The first release deliberately adds no minimum-fact checks, prose claims,
reciprocity requirements, inferred scene participants, automatic location
assumptions, custom-property semantics, physics, or AI analysis.

## Selected-manuscript scope

The review workspace offers two explicit scopes:

- **Whole world** shows every eligible project finding.
- **Selected manuscript** shows findings anchored by at least one scene or
  chapter source bound into that manuscript, together with every supporting
  fact needed to understand the result.

Manuscript order and stable item membership provide context only. A selected
scope must not reinterpret freeform `pov`, `location`, `storyDate`, synopsis,
labels, notes, or prose. A scene or chapter can participate deterministically
only through its structured note facts such as `occurs-at`, `ends-at`,
`participant`, `located-at`, or `uses-route`.

If no valid manuscript structure is present, Whole world remains available.
Changing the selected manuscript is session-only and does not write project
state.

## Portable intentional exceptions

The proposed optional root file is
`200-crappy-words.continuity-review.json`. It is project-owned because an
intentional contradiction or accepted review is a creative decision that must
survive backup, another Mac, and collaboration by file copy.

Version one would contain:

```json
{
  "format": "200-crappy-words/continuity-review",
  "formatVersion": 1,
  "projectId": "7848b5c8-4b08-4bc2-912e-c74c7ec8b001",
  "exceptions": [
    {
      "id": "6d2434f0-39df-4d76-bb0e-a69b4f939a6e",
      "ruleId": "timeline.lifespan.order",
      "ruleVersion": 1,
      "evidenceIds": [
        "fact:1c91608d-e09a-4538-aae0-92fe2a28f0a4",
        "fact:86e1392b-79ef-4a61-9553-52699b7eeaa8"
      ],
      "explanation": "The character is reborn backward through the local timeline."
    }
  ]
}
```

The exact exception match is the tuple of rule ID, rule version, and sorted
stable evidence IDs. Paths, titles, source ranges, summaries, and severity are
not stored as identity. A rule-version change or changed evidence tuple makes
the exception **stale** and visible for repair or removal; it never silently
matches a new result. An exception whose evidence disappeared is also shown as
stale rather than deleted automatically.

Only Review or Contradiction findings may receive an exception. Source problems
cannot be hidden because they make downstream analysis incomplete, and
Information needs no dismissal. Exception creation, explanation editing, and
removal use exact JSON preview, compare-before-write atomic replacement, and
one guarded Undo. Opening or running review never creates this file.

The interface says **Mark intentional…**, not Dismiss or Ignore. Active
exceptions remain available in a collapsed section with the writer's full
explanation and evidence links. No timestamp, user identity, machine path,
prose copy, or app-local mirror is required.

## Limits, ordering, and privacy

- Each rule retains its own documented traversal or analysis bound.
- The unified review returns at most 200 active findings after stable ordering:
  Contradiction, Review, then Information; rule order; primary source path;
  source range; stable finding ID.
- Source problems have their existing independent caps and omission counts so
  malformed input cannot crowd out all cross-source findings.
- Intentional and stale exceptions are capped at 1,000 file entries and report
  omissions explicitly.
- Derivation yields cooperatively during project-scale work and must receive a
  measured performance budget before release.
- Review, exception matching, filtering, and navigation remain local. No prose,
  facts, findings, exception explanations, paths, or telemetry leave the
  computer.
- Reviewing, navigating, or mechanically editing an exception awards no daily
  word credit.

## Proposed experience

A closed-by-default **Continuity review** entry in Writing tools opens a main
workspace while preserving the project file tree. Its header exposes Whole
world or one manuscript scope, severity/category filters, active and intentional
counts, refresh state, and the bounded omission summary.

Each result shows:

- severity and category;
- plain-language summary and **Why this appeared** explanation;
- rule ID and version;
- canon/certainty qualification;
- every contributing source with role, title, path, property, and location;
- stale-safe **Open source** or existing guarded edit actions; and
- **Mark intentional…** only for eligible active findings.

Source problems, active findings, intentional exceptions, and stale exceptions
remain separate sections. The app does not claim the project “passes” merely
because active results are empty: optional facts, untracked prose, and bounded
rules mean absence of a finding is not proof of continuity.

## Approval gates

Implementation should begin only after explicit answers to these permanent
choices:

1. **Initial scope:** approve aggregation of the existing source diagnostics
   and four implemented finding families plus only the two new structured-data
   rules above.
2. **Severity:** approve Information, Review, and Contradiction, with
   Contradiction reserved for mechanically impossible evidence and never used
   to block writing or export.
3. **Canon gate:** exclude retired evidence from ordinary findings; cap idea,
   draft, or unspecified evidence at Review; require all-canon, all-exact
   evidence for Contradiction.
4. **Manuscript scope:** use manuscript membership only as a filter/context;
   interpret structured scene/chapter facts but not freeform metadata or prose.
5. **Exceptions:** approve one optional portable
   `200-crappy-words.continuity-review.json` file and the exact stable-evidence
   matching rule.
6. **Exception experience:** keep intentional findings visible with a required
   explanation; never add a hidden app-local Dismiss action and never allow a
   source problem to be excepted.
7. **Completeness and custom semantics:** add no missing-fact prompts or custom
   property rules until a writer-selected policy receives separate approval.
8. **Privacy and limits:** keep all review local, award no daily credit, cap the
   unified active set at 200, cap exception entries at 1,000, and expose every
   omission or stale exception.

## Proposed implementation sequence after approval

1. Define one normalized memory-only result/evidence model and adapters for the
   existing relationship, travel, timeline, and source-diagnostic outputs.
2. Implement and fixture the two new rules, shared canon/severity gate, stable
   evidence fingerprints, ordering, caps, and selected-manuscript filter.
3. Add the accessible read-only project review workspace with exact source
   navigation and no persistence.
4. Publish the optional exception schema/parser/loader without writes, then add
   guarded creation, exception editing/removal, stale matching, and Undo.
5. Measure a representative large fixture and complete packaged macOS QA for
   keyboard, visual, exact-source, stale-source, exception, project restore,
   zero-credit, zero-network, and source-integrity behavior.
