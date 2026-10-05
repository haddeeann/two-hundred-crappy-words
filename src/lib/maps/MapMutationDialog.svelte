<script lang="ts">
  import { planMapsMutation, type MapsMutationPlan, type MapsMutationRequest } from "./mutation";
  import type { MapAnchorNoteOption } from "./model";

  interface Props {
    request: MapsMutationRequest;
    originalText: string | null;
    projectId: string;
    noteOptions: MapAnchorNoteOption[];
    busy: boolean;
    error: string;
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
    onChange,
    onConfirm,
    onCancel,
  }: Props = $props();

  const plan = $derived(planMapsMutation(originalText, projectId, request));
  const title = $derived(dialogTitle(request));
  const destructive = $derived(request.kind === "remove-map" || request.kind === "remove-anchor");
  let cancelButton: HTMLButtonElement;

  $effect(() => {
    cancelButton?.focus();
  });

  function dialogTitle(value: MapsMutationRequest): string {
    if (value.kind === "add-map") return "Add map";
    if (value.kind === "add-point") return "Add point anchor";
    if (value.kind === "update-point") return "Edit point anchor";
    if (value.kind === "remove-anchor") return "Remove anchor";
    return "Remove map";
  }

  function updateTitle(value: string): void {
    if (request.kind === "add-map") onChange({ ...request, title: value });
  }

  function updateNote(value: string): void {
    if (request.kind === "add-point" || request.kind === "update-point") {
      onChange({ ...request, noteId: value });
    }
  }

  function updateCoordinate(axis: "x" | "y", value: string): void {
    if (request.kind !== "add-point" && request.kind !== "update-point") return;
    const parsed = Number(value);
    onChange({ ...request, [axis]: Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN });
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
    {:else if request.kind === "add-point" || request.kind === "update-point"}
      <label>
        Linked lore note
        <select value={request.noteId} onchange={(event) => updateNote(event.currentTarget.value)}>
          <option value="">Choose a uniquely identified structured note</option>
          {#each noteOptions as option (option.id)}
            <option value={option.id}>{option.title} · {option.noteType} · {option.path}</option>
          {/each}
        </select>
      </label>
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
      <p class="source">Coordinates use the image’s logical pixel canvas.</p>
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
  button { border: 1px solid #cfc5d1; border-radius: 0.45rem; background: #fff; color: inherit; padding: 0.45rem 0.75rem; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { border-color: #4f3f59; background: #4f3f59; color: #fff; }
  button.danger { border-color: #a63d40; background: #a63d40; color: #fff; }
  .source { margin-bottom: 0.35rem; color: #6d646c; overflow-wrap: anywhere; }
  .summary { border: 1px solid #b8d8c2; border-radius: 0.5rem; background: #f3faf5; padding: 0.65rem; }
  .problem { color: #7b2f31; }
  details { border: 1px solid #d9d0dc; border-radius: 0.5rem; background: #fff; padding: 0.65rem; }
  summary { cursor: pointer; font-weight: 700; }
  pre { max-height: 16rem; overflow: auto; margin-bottom: 0; padding: 0.6rem; background: #242127; color: #f8f5f8; font-size: 0.75rem; white-space: pre; }
  code { overflow-wrap: anywhere; }
</style>
