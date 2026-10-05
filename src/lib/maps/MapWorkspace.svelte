<script lang="ts">
  import type { MapImageLoadResult } from "./image";
  import type { MapsProjectLoadResult } from "./load";
  import type { MapAnchorModel, MapsWorkspaceModel, ProjectMapModel } from "./model";

  interface Props {
    result: MapsProjectLoadResult;
    model: MapsWorkspaceModel | null;
    selectedMapId: string;
    imageResult: MapImageLoadResult | null;
    loading: boolean;
    imageLoading: boolean;
    onClose: () => void;
    onRefresh: () => void;
    onSelectMap: (mapId: string) => void;
    onOpenNote: (path: string) => void;
    onAddMap: () => void;
    onAddPoint: (mapId: string, x: number, y: number) => void;
    onEditPoint: (mapId: string, anchor: MapAnchorModel) => void;
    onRemoveAnchor: (mapId: string, anchor: MapAnchorModel) => void;
    onRemoveMap: (mapId: string) => void;
    undoLabel: string;
    undoBusy: boolean;
    onUndo: () => void;
  }

  let {
    result,
    model,
    selectedMapId,
    imageResult,
    loading,
    imageLoading,
    onClose,
    onRefresh,
    onSelectMap,
    onOpenNote,
    onAddMap,
    onAddPoint,
    onEditPoint,
    onRemoveAnchor,
    onRemoveMap,
    undoLabel,
    undoBusy,
    onUndo,
  }: Props = $props();

  let imageUrl = $state("");
  let zoom = $state(1);
  let selectedAnchorId = $state("");
  const selectedMap = $derived(
    model?.maps.find(({ map }) => map.id === selectedMapId) ?? model?.maps[0] ?? null,
  );
  const loadMessage = $derived(projectMessage(result));
  const imageMessage = $derived(imageResultMessage(imageResult));

  $effect(() => {
    selectedMapId;
    zoom = 1;
    selectedAnchorId = "";
  });

  $effect(() => {
    const current = imageResult;
    imageUrl = "";
    if (current?.kind !== "ready") return;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(current.bytes)], {
      type: current.inspection.mediaType,
    }));
    imageUrl = url;
    return () => {
      URL.revokeObjectURL(url);
      if (imageUrl === url) imageUrl = "";
    };
  });

  function projectMessage(value: MapsProjectLoadResult): string | null {
    if (value.kind === "ready") return null;
    if (value.kind === "absent") {
      return "No portable maps file is configured for this world. Nothing was created or changed.";
    }
    if (value.kind === "invalid") {
      return `The maps file is invalid: ${value.issues.map(({ path, message }) => `${path}: ${message}`).join(" ")} Nothing was changed.`;
    }
    if (value.kind === "malformed") {
      return `The maps file is not valid JSON: ${value.message} Nothing was changed.`;
    }
    if (value.kind === "unsupported-version") {
      return `The maps file uses newer version ${value.version}. It was preserved untouched.`;
    }
    return value.message;
  }

  function imageResultMessage(value: MapImageLoadResult | null): string | null {
    if (!value || value.kind === "ready") return null;
    if (value.kind === "changed") return value.message;
    if (value.kind === "unsupported" || value.kind === "animated" || value.kind === "invalid") {
      return `${value.message} No map image or anchors were displayed.`;
    }
    return value.message;
  }

  function anchorTitle(anchor: MapAnchorModel): string {
    if (anchor.target.kind === "resolved") return anchor.target.title;
    if (anchor.target.kind === "unstructured") return anchor.target.title;
    return `Unavailable note · ${anchor.anchor.noteId}`;
  }

  function geometryLabel(anchor: MapAnchorModel): string {
    const geometry = anchor.anchor.geometry;
    return geometry.kind === "point"
      ? `Point ${geometry.x}, ${geometry.y}`
      : `Region with ${geometry.points.length} vertices`;
  }

  function chooseAnchor(anchor: MapAnchorModel): void {
    selectedAnchorId = anchor.anchor.id;
  }

  function openAnchor(anchor: MapAnchorModel): void {
    if (anchor.target.kind === "resolved") onOpenNote(anchor.target.path);
  }

  function activateShape(event: KeyboardEvent, anchor: MapAnchorModel): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    chooseAnchor(anchor);
  }

  function polygonPoints(anchor: MapAnchorModel): string {
    return anchor.anchor.geometry.kind === "polygon"
      ? anchor.anchor.geometry.points.map(([x, y]) => `${x},${y}`).join(" ")
      : "";
  }

  function zoomBy(delta: number): void {
    zoom = Math.max(0.5, Math.min(3, Math.round((zoom + delta) * 100) / 100));
  }

  function addPointAtCenter(): void {
    if (!selectedMap) return;
    onAddPoint(
      selectedMap.map.id,
      Math.round(selectedMap.map.canvas.width / 2),
      Math.round(selectedMap.map.canvas.height / 2),
    );
  }

  function placePoint(event: PointerEvent): void {
    if (!selectedMap || imageResult?.kind !== "ready") return;
    const overlay = event.currentTarget as SVGSVGElement;
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = Math.max(0, Math.min(
      selectedMap.map.canvas.width - 1,
      Math.round(((event.clientX - bounds.left) / bounds.width) * selectedMap.map.canvas.width),
    ));
    const y = Math.max(0, Math.min(
      selectedMap.map.canvas.height - 1,
      Math.round(((event.clientY - bounds.top) / bounds.height) * selectedMap.map.canvas.height),
    ));
    onAddPoint(selectedMap.map.id, x, y);
  }
</script>

<section class="map-workspace" aria-labelledby="maps-heading">
  <header>
    <div>
      <p class="eyebrow">Project-owned visual references</p>
      <h1 id="maps-heading">Maps</h1>
      <p>Points and regions link to lore. They do not create geographic or continuity facts.</p>
    </div>
    <div class="workspace-actions">
      {#if undoLabel}<button type="button" onclick={onUndo} disabled={undoBusy || loading}>{undoBusy ? "Undoing…" : undoLabel}</button>{/if}
      <button type="button" onclick={onAddMap} disabled={loading}>Add map…</button>
      <button type="button" onclick={onRefresh} disabled={loading || imageLoading}>
        {loading || imageLoading ? "Refreshing…" : "Refresh"}
      </button>
      <button type="button" class="primary" onclick={onClose}>Return to draft</button>
    </div>
  </header>

  {#if loadMessage}
    <p class="load-message" class:problem={result.kind !== "absent"} role={result.kind === "absent" ? "status" : "alert"}>
      {loadMessage}
    </p>
  {:else if result.kind === "ready"}
    <p class="load-message good">
      Loaded {result.mapsProject.maps.length} verified map {result.mapsProject.maps.length === 1 ? "definition" : "definitions"} without changing project files.
    </p>
  {/if}

  {#if result.kind === "ready" && model}
    {#if model.maps.length === 0}
      <section class="empty-panel">
        <h2>No maps configured</h2>
        <p>The portable maps file is valid and currently contains no maps.</p>
        <button type="button" class="primary" onclick={onAddMap}>Add a map…</button>
      </section>
    {:else}
      <div class="map-controls" aria-label="Map view controls">
        <label for="map-choice">Map</label>
        <select
          id="map-choice"
          value={selectedMap?.map.id ?? ""}
          onchange={(event) => onSelectMap(event.currentTarget.value)}
        >
          {#each model.maps as entry (entry.map.id)}
            <option value={entry.map.id}>{entry.map.title}</option>
          {/each}
        </select>
        <button type="button" onclick={() => zoomBy(-0.25)} disabled={zoom <= 0.5 || imageResult?.kind !== "ready"} aria-label="Zoom map out">−</button>
        <button type="button" onclick={() => { zoom = 1; }} disabled={zoom === 1 || imageResult?.kind !== "ready"}>Fit</button>
        <button type="button" onclick={() => zoomBy(0.25)} disabled={zoom >= 3 || imageResult?.kind !== "ready"} aria-label="Zoom map in">+</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
      </div>

      {#if selectedMap}
        <div class="map-heading">
          <div>
            <h2>{selectedMap.map.title}</h2>
            <p>{selectedMap.map.image.path} · {selectedMap.map.canvas.width} × {selectedMap.map.canvas.height} logical canvas</p>
          </div>
          <div class="map-heading-actions">
            <span>{selectedMap.anchors.length} {selectedMap.anchors.length === 1 ? "anchor" : "anchors"}</span>
            <button type="button" onclick={addPointAtCenter} disabled={imageResult?.kind !== "ready"}>Add point…</button>
            <button type="button" class="danger-text" onclick={() => onRemoveMap(selectedMap.map.id)}>Remove map…</button>
          </div>
        </div>

        {#if imageLoading}
          <p class="load-message" role="status">Verifying local image bytes…</p>
        {:else if imageMessage}
          <p class="load-message problem" role="alert">{imageMessage}</p>
        {/if}

        <div class="map-layout">
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="map-viewport" role="region" tabindex="0" aria-label={`Scrollable map canvas for ${selectedMap.map.title}`}>
            {#if imageResult?.kind === "ready" && imageUrl}
              <div class="map-canvas" style={`width: ${zoom * 100}%`}>
                <img src={imageUrl} alt={`Writer-supplied map: ${selectedMap.map.title}`} draggable="false" />
                <svg
                  class="map-overlay"
                  viewBox={`0 0 ${selectedMap.map.canvas.width} ${selectedMap.map.canvas.height}`}
                  role="group"
                  aria-label={`Visual anchors for ${selectedMap.map.title}`}
                  onpointerdown={placePoint}
                >
                  {#each selectedMap.anchors as anchor (anchor.anchor.id)}
                    {#if anchor.anchor.geometry.kind === "point"}
                      <circle
                        class:selected={selectedAnchorId === anchor.anchor.id}
                        class:problem={anchor.target.kind !== "resolved"}
                        cx={anchor.anchor.geometry.x}
                        cy={anchor.anchor.geometry.y}
                        r={Math.max(8, Math.min(selectedMap.map.canvas.width, selectedMap.map.canvas.height) * 0.012)}
                        role="button"
                        tabindex="0"
                        aria-label={`${anchorTitle(anchor)}. ${geometryLabel(anchor)}`}
                        onclick={(event) => { event.stopPropagation(); chooseAnchor(anchor); }}
                        onpointerdown={(event) => event.stopPropagation()}
                        onkeydown={(event) => activateShape(event, anchor)}
                      />
                    {:else}
                      <polygon
                        class:selected={selectedAnchorId === anchor.anchor.id}
                        class:problem={anchor.target.kind !== "resolved"}
                        points={polygonPoints(anchor)}
                        role="button"
                        tabindex="0"
                        aria-label={`${anchorTitle(anchor)}. ${geometryLabel(anchor)}`}
                        onclick={(event) => { event.stopPropagation(); chooseAnchor(anchor); }}
                        onpointerdown={(event) => event.stopPropagation()}
                        onkeydown={(event) => activateShape(event, anchor)}
                      />
                    {/if}
                  {/each}
                </svg>
              </div>
            {:else if !imageLoading}
              <div class="image-placeholder">Verified image unavailable</div>
            {/if}
          </div>

          <section class="anchor-panel" aria-labelledby="map-anchors-heading">
            <div class="anchor-heading">
              <h3 id="map-anchors-heading">Linked lore</h3>
              {#if model.problemAnchorCount > 0}<span>{model.problemAnchorCount} need attention</span>{/if}
            </div>
            {#if selectedMap.anchors.length === 0}
              <p>No lore anchors on this map.</p>
            {:else}
              <ol>
                {#each selectedMap.anchors as anchor (anchor.anchor.id)}
                  <li class:selected={selectedAnchorId === anchor.anchor.id}>
                    <button type="button" class="anchor-select" onclick={() => chooseAnchor(anchor)}>
                      <strong>{anchorTitle(anchor)}</strong>
                      <span>{geometryLabel(anchor)}</span>
                    </button>
                    {#if anchor.target.kind === "resolved"}
                      <p>{anchor.target.noteType} · {anchor.target.path}</p>
                      <button type="button" onclick={() => openAnchor(anchor)}>Open note</button>
                    {:else}
                      <p class="anchor-problem">{anchor.target.message}</p>
                      {#if anchor.target.kind === "ambiguous"}<p>{anchor.target.paths.join(", ")}</p>{/if}
                    {/if}
                    <div class="anchor-actions">
                      {#if anchor.anchor.geometry.kind === "point"}
                        <button type="button" onclick={() => onEditPoint(selectedMap.map.id, anchor)}>Edit point…</button>
                      {/if}
                      <button type="button" class="danger-text" onclick={() => onRemoveAnchor(selectedMap.map.id, anchor)}>Remove…</button>
                    </div>
                  </li>
                {/each}
              </ol>
            {/if}
          </section>
        </div>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .map-workspace {
    height: 100%;
    overflow: auto;
    padding: clamp(1rem, 2.4vw, 2rem);
    background: #fbfaf7;
    color: #292529;
  }
  header, .map-heading, .anchor-heading, .map-controls, .workspace-actions, .map-heading-actions, .anchor-actions {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  header, .map-heading { justify-content: space-between; }
  header { align-items: flex-start; margin-bottom: 1rem; }
  h1, h2, h3, p { margin-top: 0; }
  header p, .map-heading p { margin-bottom: 0; color: #6d646c; }
  .eyebrow { margin-bottom: 0.25rem; color: #745a80; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  button, select { font: inherit; }
  button { border: 1px solid #cfc5d1; border-radius: 0.45rem; background: #fff; color: inherit; padding: 0.42rem 0.7rem; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { background: #4f3f59; border-color: #4f3f59; color: #fff; }
  button.danger-text { color: #8e2020; }
  .load-message { padding: 0.75rem 0.9rem; border: 1px solid #d9d0dc; border-radius: 0.55rem; background: #fff; }
  .load-message.good { border-color: #b8d8c2; background: #f3faf5; }
  .load-message.problem, .anchor-problem { color: #7b2f31; }
  .map-controls { flex-wrap: wrap; padding: 0.7rem; border-block: 1px solid #e3dde4; }
  .map-controls label { font-weight: 700; }
  .map-controls select { min-width: min(18rem, 50vw); padding: 0.42rem; }
  .map-heading { margin: 1.1rem 0 0.7rem; }
  .map-heading h2 { margin-bottom: 0.2rem; }
  .map-heading-actions { flex-wrap: wrap; justify-content: flex-end; }
  .map-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(15rem, 22rem); gap: 1rem; align-items: start; }
  .map-viewport { overflow: auto; min-height: 18rem; max-height: 68vh; border: 1px solid #cfc5d1; border-radius: 0.6rem; background: #211e22; }
  .map-viewport:focus-visible { outline: 3px solid #8a5cf5; outline-offset: 2px; }
  .map-canvas { position: relative; min-width: 100%; line-height: 0; }
  .map-canvas img { width: 100%; height: auto; display: block; image-orientation: from-image; user-select: none; }
  .map-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
  .map-overlay { cursor: crosshair; }
  .map-overlay circle, .map-overlay polygon { fill: rgb(255 229 92 / 0.42); stroke: #4b2f5b; stroke-width: max(2px, 0.25%); vector-effect: non-scaling-stroke; cursor: pointer; }
  .map-overlay .problem { fill: rgb(216 75 75 / 0.35); stroke: #8e2020; stroke-dasharray: 7 4; }
  .map-overlay .selected { fill: rgb(138 92 245 / 0.52); stroke: #fff; stroke-width: max(3px, 0.4%); }
  .map-overlay [role="button"]:focus-visible { outline: none; stroke: #fff; stroke-width: max(4px, 0.5%); }
  .image-placeholder { min-height: 18rem; display: grid; place-items: center; color: #d5cdd8; }
  .anchor-panel { border: 1px solid #d9d0dc; border-radius: 0.6rem; background: #fff; padding: 0.8rem; max-height: 68vh; overflow: auto; }
  .anchor-heading { justify-content: space-between; }
  .anchor-panel ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.55rem; }
  .anchor-panel li { border: 1px solid #e5dee6; border-radius: 0.5rem; padding: 0.55rem; }
  .anchor-panel li.selected { border-color: #8a5cf5; box-shadow: 0 0 0 2px rgb(138 92 245 / 0.15); }
  .anchor-panel li p { margin: 0.35rem 0; overflow-wrap: anywhere; font-size: 0.85rem; color: #6d646c; }
  .anchor-select { width: 100%; border: 0; padding: 0; text-align: left; display: grid; gap: 0.15rem; }
  .anchor-select span { color: #6d646c; font-size: 0.8rem; }
  .anchor-actions { flex-wrap: wrap; margin-top: 0.45rem; }
  .empty-panel { padding: 1.2rem; border: 1px dashed #cfc5d1; border-radius: 0.6rem; }
  @media (max-width: 850px) {
    header, .map-heading { align-items: stretch; flex-direction: column; }
    .map-layout { grid-template-columns: 1fr; }
    .anchor-panel { max-height: none; }
  }
</style>
