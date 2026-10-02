# Portable maps proposal

Status: **research complete; awaiting product approval**

Last updated: 2026-10-02

## Purpose

This proposal defines the smallest portable map boundary for 200 Crappy Words:
a writer supplies an ordinary image, the project records a stable logical
canvas over that image, and map-owned anchors link points or regions back to
stable lore notes. It deliberately does not turn the app into a map painter,
GIS, route solver, or second continuity database.

No map file, image copy, schema, parser, capability, dependency, or interface
change has been made. The permanent choices at the end require approval first.

## Existing product boundary

The app already has most of the safety and identity machinery a map needs:

- a valid world project has a portable UUID and guarded root metadata files;
- structured Markdown notes can have stable UUIDs across in-app renames;
- location containment, `located-at`, routes, travel, events, scenes, and time
  remain source facts beside writer-owned prose;
- the selected project scope already permits bounded binary reads and writes;
- file loading, metadata mutation, preview, compare-before-write, stale-source
  refusal, and one guarded in-session Undo have established patterns; and
- the file tree already displays ordinary image files without indexing them as
  lore or treating their bytes as text.

The current webview permits bundled and data images but not blob images. A map
viewer would need a narrow `blob:` image CSP allowance while retaining the
existing prohibition on remote image origins, frames, objects, and network
content. No broader filesystem or network permission is needed.

Maps need one shared project structure because image identity, canvas
dimensions, and geometry are not naturally owned by any single Markdown note.
Putting coordinates into every linked note would scatter one map edit across
many files, duplicate map identity, and make replacing an image unsafe.

## Research findings

### An image should be a stable canvas, not a geographic promise

The [IIIF Presentation 3 API](https://iiif.io/api/presentation/3.0/#53-canvas)
uses a rectangular Canvas as a stable spatial frame and associates resources
and annotations with parts of that frame. Renderers scale content into the
Canvas, so the annotation coordinate space does not have to be the current
display size of the image. That is the useful design lesson here; this project
should not import IIIF, JSON-LD, HTTP identities, or its publishing model.

The [W3C Media Fragments recommendation](https://www.w3.org/TR/media-frags/#naming-space)
defines image regions from a top-left origin and supports pixel or percentage
rectangles. The [Web Annotation Data Model](https://www.w3.org/TR/annotation-model/#fragment-selector)
separates a target resource from a selector for a particular segment, and also
supports more expressive SVG selectors. A small explicit point/polygon JSON
shape takes the same separation seriously without adopting RDF, URI fragments,
SVG parsing, or integer-percent precision.

[GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946.html#section-4)
fixes its coordinates to WGS 84 longitude and latitude. That is excellent for
Earth geography and wrong as the default for a starship deck, invented planet,
galaxy diagram, city sketch, or character board. Version one therefore uses
only a map-local two-dimensional canvas. A later explicitly georeferenced map
could add a separate coordinate-reference decision without changing what
ordinary image anchors mean.

### Common writing tools start with an image and explicit markers

World Anvil's official [map guide](https://www.worldanvil.com/learn/map-making/maps)
starts from a writer-supplied image, links markers to articles or other maps,
and offers points, labels, lines, circles, polygons, groups, and layers. Its
guide also warns that large browser-rendered images can be slow or crash and
that replacing a base image with different dimensions does not reposition
markers automatically. The useful version-one core is much smaller: one
project-owned base image, note-linked points and polygons, bounded loading, and
an explicit replacement decision. Lines, circles, labels, layers, map-to-map
links, custom pins, routes, and presentation/privacy groups can follow actual
writer demand.

### Static raster formats are the safest first interchange

The [PNG Third Edition recommendation](https://www.w3.org/TR/png-3/) defines a
portable, lossless raster format with integrity checks, transparency, color
metadata, and both static and animated forms. The JPEG committee documents
[JPEG 1 / JFIF](https://jpeg.org/jpeg/) as the dominant interoperable still
image family. Google's [WebP container specification](https://developers.google.com/speed/webp/docs/riff_container)
defines lossy/lossless still images, transparency, metadata, and animation.
World Anvil's current beginner guide likewise accepts PNG, JPEG, and WebP.

Version one should accept only **static** PNG, JPEG, and WebP after checking
magic bytes, container animation flags, decoded dimensions, and actual media
type. APNG and animated WebP make anchor meaning time-dependent and are
rejected. GIF, AVIF, TIFF, PDF, and other formats can be added later when their
tooling and test burden are justified.

SVG is also deferred. SVG 2 permits scripts, external resources, embedded
content, and multiple processing modes even though an HTML image subresource
is meant to run in a secure image mode. The app can avoid relying on webview-
specific enforcement by accepting no writer-supplied executable markup in the
first map viewer. This does not prevent a later sanitized/vector-specific
decision.

## Recommended version-one format

### One optional project file

The proposed root file is:

`200-crappy-words.maps.json`

Its discriminator is `200-crappy-words/maps`, and version one is a bounded,
human-readable JSON object:

```json
{
  "format": "200-crappy-words/maps",
  "formatVersion": 1,
  "projectId": "7848b5c8-4b08-4bc2-912e-c74c7ec8b001",
  "maps": [
    {
      "id": "26a31375-e38d-48bb-833d-6357f2dc086b",
      "title": "The Nacre System",
      "image": {
        "path": "Maps/nacre-system.png",
        "mediaType": "image/png",
        "sha256": "5bd45d0986e2f03ad9c989c87f101846c35f9b4b593c9a577acbc032a649d21a",
        "width": 4096,
        "height": 3072
      },
      "canvas": { "width": 4096, "height": 3072 },
      "anchors": [
        {
          "id": "6675a835-c599-4490-a2f3-8a7865a924f7",
          "noteId": "a46e0dbc-4304-449f-8292-c65dcc6529cf",
          "geometry": { "kind": "point", "x": 1712, "y": 930 }
        },
        {
          "id": "b5899528-7b36-48e9-98e6-b1ef80bc093b",
          "noteId": "93ddcd75-a74b-45f1-a029-8567ee333c3e",
          "geometry": {
            "kind": "polygon",
            "points": [[700, 1220], [1160, 980], [1510, 1440]]
          }
        }
      ]
    }
  ]
}
```

The file works only when `projectId` matches a valid world-project manifest.
Ordinary folders remain fully editable but do not interpret a maps file. An
absent file means only that the project has no configured maps.

Each map and anchor has a locally generated stable UUID. A map title is display
text, not identity. Unknown fields in a supported version remain writer-owned
and must survive guarded edits. Malformed, invalid, mismatched, symbolic,
oversized, unstable, or newer files disable only map behavior and are never
rewritten automatically.

### Project-owned image identity

An image path is a portable, forward-slash, project-relative path to one regular
non-symbolic file. Absolute paths, URLs, data URLs, aliases outside the project,
and network images are invalid. A writer may choose an existing in-project
image or import an external image through an explicit non-clobbering copy into
a suggested `Maps/` directory. Import never moves or deletes the original.

The app records the verified media type, SHA-256 digest, and **display-oriented**
width and height. File extensions are advisory; the actual bytes are
authoritative. The digest detects same-name content replacement, while the
dimensions define the initial canvas and bound decoded memory. EXIF orientation
is resolved before dimensions and coordinates are recorded; all other EXIF
metadata, including geolocation, is ignored.

Recommended limits are 64 maps, 50 MiB encoded bytes per image, 8,192 pixels on
either display-oriented axis, 40 million display-oriented pixels per image,
5 MiB for the JSON file, 10,000 total anchors, 256 polygon vertices per anchor,
and 100 reported problems. These are validation limits, not targets; the
interface should encourage substantially smaller images for responsive laptop
use.

### Logical canvas and geometry

The initial canvas width and height equal the verified display-oriented image
dimensions. Coordinates are finite non-negative integers with origin `(0, 0)`
at the top-left, `x` increasing right, and `y` increasing down. A point must
satisfy `0 <= x < width` and `0 <= y < height`. A polygon contains 3 through
256 points, all inside the same boundary, and must have at least three distinct
non-collinear vertices. The closing point is implicit and must not be duplicated.

The canvas remains stable when the image is zoomed or resized on screen. Pan,
zoom, selected map, open panels, and filters are app-local session state and do
not churn the project file.

Image replacement is always explicit:

- identical verified bytes require no update;
- a new static image with the same displayed dimensions may update the digest
  after preview while retaining anchors;
- a new image with a different size but the same aspect ratio may be scaled
  into the existing logical canvas after preview while retaining anchors; and
- a different aspect ratio cannot silently retain anchors. The writer must
  create a new map or explicitly clear the existing anchors before replacement.

These rules cannot prove that a redrawn coastline still matches old anchors,
but the changed digest makes that uncertainty visible and keeps the choice with
the writer.

### Anchors are visual links, not inferred continuity

An anchor belongs to one map and targets one uniquely resolved stable Markdown
note ID. Any structured note type may be linked: locations and events are the
obvious first cases, but spacecraft, routes, factions, characters, technology,
species, scenes, and chapters can also have honest visual meaning on a deck
plan, system diagram, or evidence board.

One note may have several anchors on one or several maps, and several notes may
share a point or region. Anchor array order affects only a deterministic
selection tie-break and does not express geography, containment, chronology,
canon priority, or rendering depth.

An anchor does **not** create or replace `located-at`, `contained-by`, route,
travel, timeline, or relationship facts. It cannot calculate distance,
direction, scale, pathfinding, arrival, or presence. It says only: “this note is
visually linked to this part of this writer-supplied canvas.” A future continuity
rule may use map evidence only after a separately approved semantic model.

### Viewer and guarded authoring

Maps should live in the closed-by-default Writing tools dock and open as a
dedicated main-pane workspace, preserving the existing left file tree. The
first viewer should provide keyboard-operable map selection, fit/reset zoom,
pan, an anchor list, and exact links back to lore notes. Pins and regions need
text alternatives and a list representation; color or pointer position must
never be the only way to identify an anchor.

Adding, moving, changing, or removing an anchor and replacing map metadata use
an exact JSON preview, current-file equivalence, one guarded write, and one
stale-sensitive in-session Undo. Removing a map or anchor removes only its JSON
entry; it never deletes the image or linked Markdown. Image import is a separate
previewed create-new copy and never overwrites an existing path. Mechanical map
work awards no daily words.

Missing images, changed digests, duplicate note IDs, missing note IDs, unsafe
paths, and unsupported image bytes remain visible. A changed or unverified
image withholds its anchor overlay until the writer resolves it. **Locate
image** may bind a new project-relative path only after verifying the expected
digest; **Use as a replacement** follows the explicit replacement rules above.
The app never scans the project and guesses among similar filenames or silently
retargets an anchor.

## Deliberate version-one exclusions

- no latitude/longitude, GeoJSON, projection, coordinate reference system, or
  real-world basemap provider;
- no network tiles, accounts, uploads, remote images, telemetry, or cloud
  publishing;
- no SVG, PDF, animated images, video, or executable/custom HTML markers;
- no layers, labels, circles, lines, route drawing, measurement, scale bars,
  pathfinding, fog-of-war, or draggable story-state tokens;
- no map-to-map portals, reader presentation mode, custom pin art, or spoiler
  groups; and
- no inference from prose, folder position, image pixels, EXIF geodata, or map
  geometry into continuity facts.

These are scope boundaries, not judgments that the features are undesirable.
The format keeps map and anchor UUIDs so later layers or richer presentation can
refer to existing identities without redefining version-one geometry.

## Approval gates

Implementation should begin only after explicit answers to these permanent
choices:

1. **Storage and identity:** approve one optional root
   `200-crappy-words.maps.json` file, scoped to a matching world-project UUID,
   with stable map and anchor UUIDs.
2. **Image ownership:** require a regular non-symbolic project-relative image;
   allow explicit create-new import into `Maps/`, never external or network
   references.
3. **Image formats and bounds:** accept only static PNG, JPEG, and WebP in
   version one, verified by bytes and bounded by encoded and decoded size.
4. **Canvas and replacement:** use a stable top-left logical canvas with
   display-oriented integer coordinates, a SHA-256 image identity, and no
   silent anchor retention across aspect-ratio changes.
5. **Anchor semantics:** support note-linked points and polygons for any unique
   structured-note ID, while keeping anchors explicitly non-geographic and
   non-continuity evidence.
6. **Initial experience:** use a main-pane map workspace launched from closed-
   by-default Writing tools, with accessible list equivalents and session-only
   view state.
7. **Mutation safety:** preview and compare every JSON change, provide one
   guarded Undo, never delete image/note files with metadata removal, and award
   no daily credit.
8. **Failure behavior:** surface missing, changed, ambiguous, unsafe, or
   unsupported sources; never guess a moved image or note target.
9. **Deferred scope:** keep geospatial coordinates, layers, routes, measurement,
   richer markers, network services, and map-derived continuity behind later
   explicit decisions.

## Proposed implementation sequence after approval

1. Publish the version-one JSON Schema and dependency-free bounded parser, then
   add stable project/image loading and refusal fixtures without creating files.
2. Add the read-only main-pane viewer, local blob image loading, accessible
   anchor list, note navigation, zoom/pan, stale-image handling, and packaged QA.
3. Add previewed map creation/import and point authoring with exact-source Undo.
4. Add polygon authoring and image replacement/relocation flows, then complete
   the map regression and milestone documentation gate.
