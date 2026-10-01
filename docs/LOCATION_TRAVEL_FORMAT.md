# Location and travel model

Status: **APPROVED; implementation active**

Last updated: 2026-10-01

This document defines the approved portable location and travel boundary for 200 Crappy Words. The user approved all eight permanent choices on 2026-10-01. Implementation proceeds in independently verified slices; ordinary projects remain valid and are never migrated on open.

The central recommendation is deliberately modest: keep places, reusable route profiles, and specific journeys as separate structured Markdown notes. Reuse the approved continuity facts and timeline arithmetic instead of adding a central spatial database or a universal propulsion engine. A writer states the travel duration that is true for one route and model; the app may add that duration to a sufficiently computable departure and show an honest arrival window.

## Goals

The first location and travel layer should:

- identify where a character, craft, event, or scene is located, including a bounded period when useful;
- express direct place containment without inferring geography from folders or names;
- represent a reusable, directional route profile with an origin, destination, optional travel model, duration range, and optional distance;
- let a specific event or scene use one route profile and the existing timeline start/end facts;
- derive an arrival date window from explicit departure and duration evidence;
- retain approximation, uncertainty, competing claims, unknown units, and fictional calendar boundaries;
- trace every result or refusal to exact writer-owned fact ranges; and
- remain understandable as ordinary Markdown without an account, network, cache, or proprietary database.

It should not:

- infer speed, acceleration, orbital mechanics, relativistic effects, FTL behavior, currents, weather, transfer windows, or fuel rules from prose;
- calculate duration from distance unless a later project-owned physics contract explicitly defines that calculation;
- assume the reverse journey takes the same route or time;
- infer coordinates, distance, or containment from a map image, filename, folder, note title, or visual position;
- choose one of several routes, duration claims, origins, destinations, or calendars silently;
- treat manuscript `location` or `storyDate` display strings as structured facts;
- require every place to have a coordinate or every journey to have a precise date; or
- write a derived arrival back into a source note automatically.

## Existing sources and compatibility boundary

The project already has most of the required primitives. Their current meanings remain unchanged.

| Existing source                     | Current meaning                                                                                           | Travel use                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stable structured-note UUID         | Portable identity for a Markdown note                                                                     | Identifies locations, route profiles, models, and journey events without path or title guesses |
| `located-at`                        | A character, spacecraft, event, or scene is at one referenced place during an optional applicability span | Presence evidence; not a route, origin/destination pair, or duration                           |
| `validFrom` / `validTo`             | Inclusive applicability bounds for the fact that contains them                                            | Selects whether containment or a duration claim applies; never becomes a trip's start/end      |
| `occurs-at` / `ends-at`             | Start/occurrence and optional end of an event, scene, or chapter                                          | Departure and optional authored arrival of a specific journey                                  |
| `quantity` / `range`                | Canonical decimal amount or inclusive bounds plus unit system and unit                                    | Route distance and travel duration without floating-point rewriting                            |
| `certainty`                         | `exact`, `approximate`, `uncertain`, or unspecified                                                       | Qualifies each input and limits whether a hard contradiction is possible                       |
| Timeline normalized range           | Inclusive earliest/latest calendar-day coordinates with explicit axes                                     | Supplies departure/arrival date arithmetic when the duration unit can share that axis          |
| Manuscript `location` / `storyDate` | Free-form planning labels                                                                                 | Display context only; never parsed or migrated silently                                        |

Ordinary Markdown and ordinary folders remain valid. Unknown note types and custom properties already remain visible and preserved. Opening, indexing, inspecting, or calculating must never create a route note or insert a fact.

## Research conclusions

The proposal borrows small concepts rather than external storage formats:

- [OGC GeoSPARQL 1.1](https://docs.ogc.org/is/22-047r1/22-047r1.html) distinguishes topological relations such as within, contains, touches, crosses, and overlaps from quantitative geometry. The first app model needs only writer-asserted direct containment. It should not claim geometric `within` or calculate containment without geometry.
- [RFC 7946 GeoJSON](https://www.rfc-editor.org/rfc/rfc7946.html) fixes ordinary GeoJSON to WGS 84 longitude/latitude and warns that extra position elements are ambiguous. It is useful for real Earth data but is the wrong default for a fictional planet, ship, station, or hand-drawn map.
- OGC's [WKT representation of coordinate reference systems](https://www.ogc.org/standards/wkt-crs/) and [referencing-by-coordinates model](https://docs.ogc.org/as/18-005r4/18-005r4.html) show why coordinates require an explicit reference system, axes, units, and datum. The standards include local engineering systems attached to a site, image, vessel, aircraft, or spacecraft. A later map milestone may borrow that identity/axes/unit separation without implementing the complete geospatial standard.
- [GTFS](https://gtfs.org/getting-started/create/) separates a reusable route from a specific trip and gives a trip an ordered series of stops with arrival/departure times. This is a useful conceptual boundary even though fiction routes do not need GTFS files, agencies, schedules, or public-transit assumptions.
- The OGC [Routing Pilot route exchange model](https://docs.ogc.org/per/19-041r3.html) separates route overview, ordered segments, distance, and estimated duration. Version one should keep optional distance distinct from duration but decline segments and pathfinding until a concrete writer need justifies them.
- [OWL-Time](https://www.w3.org/TR/owl-time/) distinguishes a temporal duration from the interval whose extent it describes, supports non-Gregorian reference systems, and notes that calendar months do not have fixed length. Travel duration therefore remains separate evidence, and month/year duration arithmetic is not silently converted to seconds or days.
- [UCUM](https://ucum.org/ucum) supplies stable codes for real elapsed-time and distance units. The existing `unitSystem` boundary can reuse a small verified subset, while fictional units remain displayable but non-computable until a project-owned conversion exists.
- IEEE 1788 formalizes arithmetic over closed numeric intervals. The app does not need that implementation standard, but it should retain its basic enclosure principle: adding departure range `[a,b]` to duration range `[c,d]` yields an arrival enclosure `[a+c,b+d]`, with outward conversion to the timeline's displayed precision.
- [Aeon Timeline](https://help.timeline.app/article/165-dates-and-durations) keeps start, duration, and end distinct but synchronized, permits a duration before a date is known, preserves reduced precision, and represents uncertain starts/ends as earliest/latest bounds. The app should offer the same conceptual clarity without rewriting a writer's independent evidence to force synchronization.
- Aeon permits [locations nested inside locations](https://help.timeline.app/article/253-advanced-settings-item-types). Plottr links scenes to writer-defined [Places](https://plottr.com/features/). [World Anvil](https://www.worldanvil.com/learn/beginner-tutorials/get-started-maps) and [Campfire](https://campfirewriting.com/interactive-maps) connect articles to points, areas, layers, and journey lines on writer-supplied images. These conventions support stable place entities and optional visual attachments; they do not justify making map pixels or folders the canonical geography.

These sources inform local behavior. None is imported, contacted, or required at runtime.

## Recommended source model

### 1. Place presence remains `located-at`

The existing property remains the assertion that its subject is at the referenced place during the fact's optional applicability window:

```yaml
- id: "4d600744-c78d-40f9-a386-baf870506c1a"
  property: "located-at"
  value:
    kind: "note"
    id: "f06f18fa-2ae9-4946-93fc-5b1125ef65fd"
  validFrom:
    kind: "time"
    calendar: "gregorian"
    expression: "2161-04"
  certainty: "exact"
```

A deterministic location rule should accept only a uniquely resolved `location` or `spacecraft` target. A target of another type remains visible with a diagnostic. Multiple applicable locations remain competing claims unless containment proves that one is an ancestor of another; array order, note recency, canon, title, and path never choose a winner.

### 2. Direct containment uses `contained-by`

A location may assert one or more direct containers:

```yaml
- id: "a954e576-df6e-4670-856d-324564856d71"
  property: "contained-by"
  value:
    kind: "note"
    id: "01739c54-b396-4978-abd6-0ceaf57b2e6f"
  certainty: "exact"
```

`contained-by` is allowed on `location` notes and points to a uniquely identified `location` or `spacecraft`. It means writer-asserted semantic containment, not an OGC geometry test, legal jurisdiction, ownership, proximity, or route access. Applicability bounds may represent a changing boundary or a location aboard a craft.

Ancestor inference is conservative. A chain is definite only when every fact is uniquely identified, explicitly exact, and applicable for the entire queried occurrence. A self-reference, cycle, missing target, duplicate identity, overlapping competing parent, stale source, or partly applicable link produces an explained potential/indeterminate result. Traversal is bounded and never guesses a root.

### 3. A reusable route profile is a Markdown note

The proposal adds the structured note type `route`. One route note describes one directional origin-to-destination profile under one optional named travel model. Its prose explains assumptions, constraints, waypoints, hazards, or fictional physics. Facts expose only the pieces needed for deterministic review.

```markdown
---
id: "478139f5-bd24-4d2f-b7dd-97527c3cc7b5"
type: "route"
title: "Aster Vale to Nacre Station by courier drive"
canon: "draft"
facts:
  - id: "71696ab6-169f-4a57-8b4e-a3fd1795f457"
    property: "route-origin"
    value:
      kind: "note"
      id: "f06f18fa-2ae9-4946-93fc-5b1125ef65fd"
    certainty: "exact"
  - id: "53b6e30d-6f84-41ca-ab62-620d29a882c6"
    property: "route-destination"
    value:
      kind: "note"
      id: "d894440f-8991-48c2-b663-02a34422ec91"
    certainty: "exact"
  - id: "017e6940-85d5-4995-b273-954ae5464920"
    property: "travel-model"
    value:
      kind: "note"
      id: "8e505ccd-cb15-47ff-8493-4809b6072f73"
    certainty: "exact"
  - id: "d1720f60-9eef-484f-8f77-83b30e858e95"
    property: "travel-duration"
    value:
      kind: "range"
      minimum: "31"
      maximum: "38"
      unitSystem: "ucum"
      unit: "h"
    certainty: "approximate"
  - id: "722a388a-e132-480e-a1da-6e76717deaf4"
    property: "travel-distance"
    value:
      kind: "quantity"
      amount: "4.2"
      unitSystem: "ucum"
      unit: "AU"
    certainty: "approximate"
---
```

The origin and destination target `location` or `spacecraft` notes. The optional model targets a `technology` or `spacecraft` note; the app displays its prose but does not interpret its drive, speed, or capabilities. Distance is optional context and is never divided by duration automatically. A route is one-way. If the reverse direction differs—or has not been decided—the writer creates a separate route note. Version one has no ordered waypoint field; waypoints remain prose or separate leg profiles rather than relying on fact order, whose approved meaning is presentation only.

A route is usable for arrival arithmetic only with one unambiguous origin, one different unambiguous destination, and one applicable duration. Several duration facts are allowed as writer claims; validity bounds select a duration only when the complete departure range is definitely inside that fact's applicability window, matching the approved participation rule. An overlapping or non-computable boundary remains potential/indeterminate rather than winning. If zero or several claims apply, the route stays visible but non-computable. `travel-model` and `travel-distance` are optional and never rescue an absent duration.

### 4. A specific journey remains an event or scene

A specific journey uses the existing event/scene timeline identity and refers to one reusable route:

```yaml
- id: "51ba36bb-61a0-4c12-b94a-f74dd8d8394e"
  property: "occurs-at"
  value:
    kind: "time"
    calendar: "gregorian"
    expression: "2161-04-06"
  certainty: "exact"
- id: "cfe37c23-e42b-42ce-a620-b57168677eb6"
  property: "uses-route"
  value:
    kind: "note"
    id: "478139f5-bd24-4d2f-b7dd-97527c3cc7b5"
  certainty: "exact"
```

For a journey, `occurs-at` is the departure range. An optional existing `ends-at` fact is the writer's independent arrival evidence. The app never changes either fact to keep it synchronized with the route. Instead it derives an arrival window and compares that window with `ends-at`, if present.

`uses-route` is initially allowed on event and scene notes. Exactly one usable route is required for calculation. Several route claims remain visible and ambiguous. Existing `participant` facts identify travelers; the app does not duplicate participants into the route profile.

## Deterministic arithmetic

### Duration values

A travel duration is one `quantity` or inclusive `range` with a supported elapsed-time unit. Canonical decimal strings are converted through exact integer/rational arithmetic, never binary floating point.

The first verified UCUM subset should be `s`, `min`, `h`, `d`, and `wk`. Calendar-variable `mo` and `a` are visible but non-computable because their elapsed length depends on a starting calendar position and interpretation. Any other UCUM expression, project unit, fictional watch, sol, cycle, jump, or narrative phrase remains visible but non-computable until a later project-owned unit contract defines an exact conversion. The app never guesses that a fictional day is 24 Earth hours.

The approved timeline currently has calendar-day precision. For Gregorian and anchored calendar axes, a supported elapsed duration is added to the complete possible departure-day interval and then outward-rounded to an inclusive arrival-date range. A five-hour trip departing at an unspecified time on one date may therefore arrive on that date or the next; the UI must explain that the uncertainty comes from day-level departure precision. It must not invent a clock time. Unanchored custom calendars decline elapsed-unit addition until the project defines how a duration maps to that calendar's day coordinate.

### Arrival enclosure

For departure interval `[earliest departure, latest departure]` and duration interval `[minimum duration, maximum duration]`, the derived arrival encloses every possible sum:

`[earliest departure + minimum duration, latest departure + maximum duration]`

Reduced date precision and final conversion to calendar days can widen the displayed result but never narrow it. Approximate, uncertain, or unspecified certainty remains attached to the result. The app does not invent a tolerance around one approximate quantity.

If an authored `ends-at` exists:

- overlap means the two sources are compatible at their current precision;
- disjoint ranges produce a review finding;
- a hard contradiction requires uniquely identified inputs, a shared computable axis, and every contributing departure, duration, route, and arrival fact to be explicitly `exact`; and
- any other state is qualified or indeterminate with the limiting evidence named.

Distance is never part of this calculation. A later physics layer may define a project-owned rule such as a constant-speed leg, acceleration profile, transfer-window table, jump network, or narrative lookup, but it must be explicit, versioned, and separately approved.

## Refusal and ambiguity rules

Arrival calculation is unavailable when any of these is true:

- the journey note lacks a unique stable ID, has a copied relevant fact ID, or is not an event/scene;
- it has zero or several usable `uses-route` facts;
- the target is missing, duplicated, not a `route` note, unsafe, stale, or externally changed;
- the route has missing, duplicated, same, or wrong-type endpoints;
- zero or several duration claims apply to the departure;
- the duration has the wrong value kind, a reversed range, an unsupported unit/conversion, or a value outside existing parser limits;
- departure is absent, ambiguous, non-computable, or already a complete closed interval combined with `ends-at` under the existing timeline refusal rules;
- duration applicability and departure do not share a computable calendar axis;
- the calculation would require a project propulsion rule, coordinate conversion, path search, or an assumption about a fictional day; or
- any source fingerprint no longer matches the indexed evidence.

The route, journey, and every fact remain visible in all of these cases. Refusal disables only the unsupported conclusion; it never hides, repairs, normalizes, or rewrites writer material.

## Source-linked experience

The left sidebar remains the project file tree. Location and travel tools belong in the closed-by-default right dock and the existing Timeline workspace.

The first useful experience should provide:

- a route template that creates ordinary Markdown in the selected project folder, defaulting to the project's existing locations folder rather than adding a manifest role;
- compact location details showing direct container, definite ancestors, potential/ambiguous containment, and exact source actions;
- a route profile card naming origin, destination, model, written duration/distance, canon, certainty, and every refusal;
- journey details beside a timeline subject showing departure, derived arrival window, optional authored arrival, compatibility/review status, and the source of any day-level widening;
- verified **Open source** actions for the journey, route, endpoints, model, duration, departure, and authored arrival;
- no automatic route selection, pathfinding, prose generation, metadata insertion, or daily-word credit; and
- no persisted derived arrival, containment closure, route cache, or layout state inside the project.

A later optional route browser may filter profiles by origin, destination, model, canon, and computability. It should not imply that the shortest, fastest, newest, or most canonical route is the writer's intended route.

## Coordinates and maps are a separate layer

Version one travel deliberately uses a graph of stable notes and explicit durations, not coordinates. That allows a wormhole, train line, desert crossing, orbital transfer, hallway, dream passage, or political checkpoint to share one honest boundary without pretending Euclidean distance determines time.

The later maps milestone should decide its own portable file after inspecting actual image workflows. The recommended direction is:

- project-owned image assets remain ordinary files;
- a map definition identifies its image, stable map ID, coordinate space, axes, origin, units, and optional relationship to another map;
- markers link stable note IDs to points, regions, or lines in that map's coordinate space;
- image-local coordinates are not mislabeled GeoJSON, and real WGS 84 data uses an explicitly declared compatible form;
- map pins never replace `contained-by`, route, or `located-at` facts automatically; and
- moving a pin is a visual edit unless the writer explicitly previews a fact change.

No map filename, coordinate shape, or schema is approved by this travel proposal.

## Bounds, safety, and portability

The proposal adds no root file, database, dependency, network permission, filesystem capability, or app-local creative-data store. It reuses the approved 256 KiB frontmatter, 256 facts per note, 120-character decimal/time expression, 80-character unit/key, 1,000-character explanation, exact-range authoring, compare-before-write, and guarded Undo boundaries.

Derived work is bounded independently:

- inspect at most the already accepted 256 facts per note;
- follow at most 64 direct containment links for one explanation;
- report at most 100 containment/travel issues plus a bounded omission notice;
- calculate only the explicitly referenced route rather than search the project for paths;
- use exact bounded decimal-to-rational conversion and `bigint` timeline coordinates;
- abort a result if a source, index generation, calendar definition, or timeline fingerprint changes; and
- keep every derived result memory-only and recomputable.

No prose, route, coordinate, finding, or calculation leaves the selected project or the local process.

## Proposed registry additions

| Property            | Subject types | Value           | Simultaneous values      | Validity bounds | Target/meaning                                                     |
| ------------------- | ------------- | --------------- | ------------------------ | --------------- | ------------------------------------------------------------------ |
| `contained-by`      | location      | note            | many                     | yes             | Direct location or spacecraft container                            |
| `route-origin`      | route         | note            | one to review            | no              | Directional location/spacecraft origin                             |
| `route-destination` | route         | note            | one to review            | no              | Directional location/spacecraft destination                        |
| `travel-model`      | route         | note            | one to review            | no              | Optional technology/spacecraft model; never interpreted as physics |
| `travel-duration`   | route         | quantity, range | one applicable to review | yes             | Explicit elapsed duration or duration window                       |
| `travel-distance`   | route         | quantity, range | one to review            | no              | Optional context; never converted into time automatically          |
| `uses-route`        | event, scene  | note            | one to review            | no              | One specific journey's route profile                               |

As with the existing registry, a mismatch remains visible and preserved. Registry semantics guide deterministic rules; they do not make an unknown or conflicting source invalid Markdown.

## Approval gates

The user approved these permanent choices on 2026-10-01:

1. **Storage:** keep reusable route profiles as structured Markdown notes and facts, with no central travel JSON file or derived cache.
2. **Route identity:** add `route` as the tenth app-created structured note type, defaulting its template destination to the existing locations folder and adding no manifest role.
3. **Vocabulary:** add the seven registry properties and subject/value/target semantics in the table above while retaining `located-at`, `occurs-at`, `ends-at`, and `participant` unchanged.
4. **Direction and legs:** one route profile is directional and represents one leg; reverse travel and multi-leg travel use separate profiles/events rather than inferred symmetry or ordered fact position.
5. **Arithmetic:** calculate only departure plus an explicit duration range; never derive time from distance or model prose; support a small exact elapsed-unit subset and widen results honestly to the timeline's calendar-day precision.
6. **Evidence:** treat `ends-at` as independent authored arrival evidence, report compatibility or conflict, and create a hard contradiction only from unique, shared-axis, explicitly exact inputs.
7. **Containment:** use explicit source-linked `contained-by` chains with bounded, cycle-aware, applicability-aware inference; do not derive hierarchy from folders, names, or map placement.
8. **Map boundary:** defer coordinates, image attachments, regions, route lines, and coordinate reference systems to the later map decision gate; travel version one performs no pathfinding.

If approved, the recommended implementation sequence is:

1. add the route template and registry definitions with exact compatibility tests;
2. derive a pure, read-only location/route/journey evidence model with every ambiguity state;
3. implement exact duration normalization and conservative arrival-date enclosure independently of UI;
4. expose source-linked route and arrival details in Writing tools and Timeline;
5. add guarded authoring through the existing continuity editor; and
6. complete packaged macOS QA before adding continuity findings that compare presence and travel.
