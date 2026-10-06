<script lang="ts">
  import { parseMapsProject } from "./format";
  import { planMapsMutation, type MapsMutationPlan, type MapsMutationRequest } from "./mutation";
  import type { MapAnchorNoteOption } from "./model";

  interface Props {
    request: MapsMutationRequest;
    originalText: string | null;
    projectId: string;
    noteOptions: MapAnchorNoteOption[];
    busy: boolean;
    error: string;
    importSource: string;
    importDestination: string;
    onChange: (request: MapsMutationRequest) => void;
    onConfirm: (plan: Extract<MapsMutationPlan, { kind: "ready" }>, request: MapsMutationRequest) => void;
    onCancel: () => void;
  }

  let {
    request,
    originalText,
    projectId,
    noteOptions,
    busy,
    error,
    importSource,
    importDestination,
    onChange,
    onConfirm,
    onCancel,
  }: Props = $props();

  const plan = $derived(planMapsMutation(originalText, projectId, request));
  const title = $derived(dialogTitle(request));
  const destructive = $derived(
    request.kind === "remove-map" || request.kind === "remove-anchor" ||
    (request.kind === "replace-image" && request.clearAnchors),
  );
  const replacementMap = $derived.by(() => {
    if (request.kind !== "replace-image" || originalText === null) return null;
    const parsed = parseMapsProject(originalText);
    return parsed.kind === "valid"
      ? parsed.mapsProject.maps.find(({ id }) => id === request.mapId) ?? null
      : null;
  });
  const replacementSameAspect = $derived(
    request.kind === "replace-image" && replacementMap
      ? request.image.width * replacementMap.canvas.height ===
        request.image.height * replacementMap.canvas.width
      : false,
  );
  let cancelButton: HTMLButtonElement;

  $effect(() => {
    cancelButton?.focus();
  });

  function dialogTitle(value: MapsMutationRequest): string {
    if (value.kind === "add-map") return "Add map";
    if (value.kind === "replace-image") return "Replace map image";
    if (value.kind === "add-point") return "Add point anchor";
    if (value.kind === "update-point") return "Edit point anchor";
    if (value.kind === "add-polygon") return "Add region anchor";
    if (value.kind === "update-polygon") return "Edit region anchor";
    if (value.kind === "remove-anchor") return "Remove anchor";
    return "Remove map";
  }

  function updateTitle(value: string): void {
    if (request.kind === "add-map") onChange({ ...request, title: value });
  }

  function updateClearAnchors(value: boolean): void {
    if (request.kind === "replace-image") onChange({ ...request, clearAnchors: value });
  }

  function updateNote(value: string): void {
    if (
      request.kind === "add-point" || request.kind === "update-point" ||
      request.kind === "add-polygon" || request.kind === "update-polygon"
    ) {
      onChange({ ...request, noteId: value });
    }
  }

  function updateCoordinate(axis: "x" | "y", value: string): void {
    if (request.kind !== "add-point" && request.kind !== "update-point") return;
    const parsed = Number(value);
    onChange({ ...request, [axis]: Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN });
  }

  function updatePolygonCoordinate(index: number, axis: 0 | 1, value: string): void {
    if (request.kind !== "add-polygon" && request.kind !== "update-polygon") return;
    const parsed = Number(value);
    const points = request.points.map((point) => [...point] as [number, number]);
    points[index]![axis] = Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
    onChange({ ...request, points });
  }

  function addPolygonVertex(): void {
    if (request.kind !== "add-polygon" && request.kind !== "update-polygon") return;
    const last = request.points.at(-1) ?? [0, 0];
    onChange({ ...request, points: [...request.points, [last[0], last[1]]] });
  }

  function removePolygonVertex(index: number): void {
    if (request.kind !== "add-polygon" && request.kind !== "update-polygon") return;
    onChange({ ...request, points: request.points.filter((_, pointIndex) => pointIndex !== index) });
  }

  function movePolygonVertex(index: number, delta: -1 | 1): void {
    if (request.kind !== "add-polygon" && request.kind !== "update-polygon") return;
    const destination = index + delta;
    if (destination < 0 || destination >= request.points.length) return;
    const points = request.points.map((point) => [...point] as [number, number]);
    [points[index], points[destination]] = [points[destination]!, points[index]!];
    onChange({ ...request, points });
  }

  function submit(): void {
    if (plan.kind === "ready" && !busy) onConfirm(plan, request);
  }
</script>

<div class="backdrop" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="map-mutation-heading">
    <header>
      <div>
        <p class="eyebrow">Guarded project change</p>
        <h2 id="map-mutation-heading">{title}</h2>
      </div>
      <button bind:this={cancelButton} type="button" onclick={onCancel} disabled={busy}>Cancel</button>
    </header>

    {#if request.kind === "add-map"}
      <label>
        Map title
        <input
          value={request.title}
          maxlength="120"
          oninput={(event) => updateTitle(event.currentTarget.value)}
          onchange={(event) => updateTitle(event.currentTarget.value)}
        />
      </label>
      <p class="source"><strong>Verified project image:</strong> {request.image.path}</p>
      <p class="source">{request.image.width} × {request.image.height} · {request.image.mediaType}</p>
      {#if importDestination}
        <p class="import"><strong>Selected external source:</strong> {importSource}</p>
        <p class="import"><strong>New project copy:</strong> {importDestination}</p>
        <p class="source">The external source will remain where it is. The new copy must not already exist.</p>
      {/if}
    {:else if request.kind === "replace-image"}
      {#if replacementMap}
        <p class="source"><strong>Current project image:</strong> {replacementMap.image.path}</p>
        <p class="source">{replacementMap.image.width} × {replacementMap.image.height} · <code>{replacementMap.image.sha256}</code></p>
      {/if}
      <p class="source"><strong>Selected project image:</strong> {request.image.path}</p>
      <p class="source">{request.image.width} × {request.image.height} · {request.image.mediaType} · <code>{request.image.sha256}</code></p>
      {#if importDestination}
        <p class="import"><strong>Selected external source:</strong> {importSource}</p>
        <p class="import"><strong>New project copy:</strong> {importDestination}</p>
        <p class="source">The external source will remain where it is. The new copy must not already exist.</p>
      {/if}
      {#if replacementMap}
        {#if replacementMap.image.sha256 === request.image.sha256}
          <p class="summary">These are the same verified bytes, so no maps update or image copy is needed.</p>
        {:else if replacementSameAspect}
          <p class="summary">The existing {replacementMap.canvas.width} × {replacementMap.canvas.height} logical canvas and all {replacementMap.anchors.length} anchors will stay exactly where they are.</p>
          {#if request.image.width !== replacementMap.image.width || request.image.height !== replacementMap.image.height}
            <p class="source">The new image has the same aspect ratio and will scale into that existing logical canvas.</p>
          {/if}
        {:else if replacementMap.anchors.length === 0}
          <p class="summary">This map has no anchors. Its logical canvas will reset to {request.image.width} × {request.image.height} for the new aspect ratio.</p>
        {:else}
          <p class="problem">The aspect ratio changed. Existing anchors cannot be retained without silently moving their meaning.</p>
          <label class="clear-anchors">
            <input
              type="checkbox"
              checked={request.clearAnchors}
              onchange={(event) => updateClearAnchors(event.currentTarget.checked)}
            />
            Clear all {replacementMap.anchors.length} anchors and reset the logical canvas to {request.image.width} × {request.image.height}
          </label>
          <p class="source">Linked lore notes and the old image file remain untouched. Leave this unchecked and cancel to create a separate map instead.</p>
        {/if}
      {/if}
    {:else if request.kind === "add-point" || request.kind === "update-point" || request.kind === "add-polygon" || request.kind === "update-polygon"}
      <label>
        Linked lore note
        <select value={request.noteId} onchange={(event) => updateNote(event.currentTarget.value)}>
          <option value="">Choose a uniquely identified structured note</option>
          {#each noteOptions as option (option.id)}
            <option value={option.id}>{option.title} · {option.noteType} · {option.path}</option>
          {/each}
        </select>
      </label>
      {#if request.kind === "add-point" || request.kind === "update-point"}
        <div class="coordinates">
          <label>
            X
            <input
              type="number"
              step="1"
              value={request.x}
              oninput={(event) => updateCoordinate("x", event.currentTarget.value)}
              onchange={(event) => updateCoordinate("x", event.currentTarget.value)}
            />
          </label>
          <label>
            Y
            <input
              type="number"
              step="1"
              value={request.y}
              oninput={(event) => updateCoordinate("y", event.currentTarget.value)}
              onchange={(event) => updateCoordinate("y", event.currentTarget.value)}
            />
          </label>
        </div>
      {:else}
        <fieldset>
          <legend>Ordered region vertices</legend>
          <ol class="vertices">
            {#each request.points as point, index}
              <li>
                <span>{index + 1}</span>
                <label>
                  X
                  <input
                    aria-label={`Vertex ${index + 1} X`}
                    type="number"
                    step="1"
                    value={point[0]}
                    oninput={(event) => updatePolygonCoordinate(index, 0, event.currentTarget.value)}
                    onchange={(event) => updatePolygonCoordinate(index, 0, event.currentTarget.value)}
                  />
                </label>
                <label>
                  Y
                  <input
                    aria-label={`Vertex ${index + 1} Y`}
                    type="number"
                    step="1"
                    value={point[1]}
                    oninput={(event) => updatePolygonCoordinate(index, 1, event.currentTarget.value)}
                    onchange={(event) => updatePolygonCoordinate(index, 1, event.currentTarget.value)}
                  />
                </label>
                <button type="button" aria-label={`Move vertex ${index + 1} earlier`} onclick={() => movePolygonVertex(index, -1)} disabled={index === 0}>↑</button>
                <button type="button" aria-label={`Move vertex ${index + 1} later`} onclick={() => movePolygonVertex(index, 1)} disabled={index === request.points.length - 1}>↓</button>
                <button type="button" class="danger-text" onclick={() => removePolygonVertex(index)}>Remove</button>
              </li>
            {/each}
          </ol>
          <button type="button" onclick={addPolygonVertex} disabled={request.points.length >= 256}>Add vertex</button>
        </fieldset>
      {/if}
      <p class="source">Coordinates use the image’s logical pixel canvas. The closing edge is automatic.</p>
    {:else if request.kind === "remove-map"}
      <p>Only this map’s metadata and anchors will be removed. Its image and all linked lore notes will remain untouched.</p>
    {:else}
      <p>Only this anchor will be removed. Its linked lore note and the map image will remain untouched.</p>
    {/if}

    {#if plan.kind === "ready"}
      <p class="summary" role="status">{plan.summary}</p>
      <details>
        <summary>Review exact JSON after this change</summary>
        <pre>{plan.updatedText}</pre>
      </details>
    {:else if plan.kind === "blocked"}
      <div class="problem" role="alert">
        <p>The proposed maps file is not valid:</p>
        <ul>{#each plan.issues as issue}<li><code>{issue.path}</code>: {issue.message}</li>{/each}</ul>
      </div>
    {:else}
      <p class="problem" role="alert">{plan.kind === "unavailable" ? plan.reason : plan.summary}</p>
    {/if}

    {#if error}<p class="problem" role="alert">{error}</p>{/if}

    <footer>
      <button type="button" onclick={onCancel} disabled={busy}>Cancel</button>
      <button
        type="button"
        class:danger={destructive}
        class:primary={!destructive}
        disabled={busy || plan.kind !== "ready"}
        onclick={submit}
      >{busy ? "Applying…" : destructive ? "Confirm removal" : "Apply change"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 1rem; background: rgb(28 24 30 / 0.5); }
  .dialog { width: min(44rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border: 1px solid #cfc5d1; border-radius: 0.75rem; background: #fbfaf7; color: #292529; box-shadow: 0 1.2rem 4rem rgb(25 20 28 / 0.28); padding: 1rem; }
  header, footer, .coordinates { display: flex; gap: 0.75rem; }
  header { justify-content: space-between; align-items: flex-start; }
  footer { justify-content: flex-end; margin-top: 1rem; }
  h2, p { margin-top: 0; }
  .eyebrow { margin-bottom: 0.2rem; color: #745a80; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  label { display: grid; gap: 0.3rem; margin: 0.8rem 0; font-weight: 700; }
  input, select, button { font: inherit; }
  input, select { box-sizing: border-box; width: 100%; border: 1px solid #bfb5c2; border-radius: 0.45rem; background: #fff; color: inherit; padding: 0.52rem; }
  .coordinates label { flex: 1; }
  .clear-anchors { grid-template-columns: auto 1fr; align-items: start; }
  .clear-anchors input { width: auto; margin-top: 0.2rem; }
  fieldset { margin: 0.8rem 0; border: 1px solid #d9d0dc; border-radius: 0.5rem; padding: 0.7rem; }
  legend { font-weight: 700; }
  .vertices { display: grid; gap: 0.45rem; margin: 0 0 0.65rem; padding: 0; list-style: none; }
  .vertices li { display: grid; grid-template-columns: auto minmax(5rem, 1fr) minmax(5rem, 1fr) auto auto auto; gap: 0.4rem; align-items: end; }
  .vertices li > span { align-self: center; min-width: 1.5rem; font-weight: 700; }
  .vertices label { margin: 0; font-size: 0.8rem; }
  button { border: 1px solid #cfc5d1; border-radius: 0.45rem; background: #fff; color: inherit; padding: 0.45rem 0.75rem; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { border-color: #4f3f59; background: #4f3f59; color: #fff; }
  button.danger { border-color: #a63d40; background: #a63d40; color: #fff; }
  button.danger-text { color: #8e2020; }
  .source { margin-bottom: 0.35rem; color: #6d646c; overflow-wrap: anywhere; }
  .import { margin: 0.75rem 0 0.25rem; border: 1px solid #d9d0dc; border-radius: 0.5rem; background: #fff; padding: 0.65rem; overflow-wrap: anywhere; }
  .summary { border: 1px solid #b8d8c2; border-radius: 0.5rem; background: #f3faf5; padding: 0.65rem; }
  .problem { color: #7b2f31; }
  details { border: 1px solid #d9d0dc; border-radius: 0.5rem; background: #fff; padding: 0.65rem; }
  summary { cursor: pointer; font-weight: 700; }
  pre { max-height: 16rem; overflow: auto; margin-bottom: 0; padding: 0.6rem; background: #242127; color: #f8f5f8; font-size: 0.75rem; white-space: pre; }
  code { overflow-wrap: anywhere; }
  @media (max-width: 650px) {
    .vertices li { grid-template-columns: auto 1fr 1fr; }
  }
</style>
