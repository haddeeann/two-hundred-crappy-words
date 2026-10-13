<script lang="ts">
  import { onMount } from "svelte";

  interface ContinuityFactSourceChoice {
    path: string;
    title: string;
    noteType: string | null;
  }

  let {
    sources,
    canCreateWorldDetail,
    canMakeWorldProject,
    onChoose,
    onCreate,
    onMakeWorldProject,
    onCancel,
  }: {
    sources: readonly ContinuityFactSourceChoice[];
    canCreateWorldDetail: boolean;
    canMakeWorldProject: boolean;
    onChoose: (path: string) => void;
    onCreate: () => void;
    onMakeWorldProject: () => void;
    onCancel: () => void;
  } = $props();

  let selectedPath = $state("");
  let dialog = $state<HTMLDivElement>();
  let sourceSelect = $state<HTMLSelectElement>();

  onMount(() => {
    selectedPath = sources[0]?.path ?? "";
    if (sources.length > 0) sourceSelect?.focus();
    else dialog?.focus();
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current - 1 + focusable.length) % focusable.length
      : (current + 1) % focusable.length;
    event.preventDefault();
    focusable[next]?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="fact-source-title" tabindex="-1" bind:this={dialog}>
    <header>
      <p class="eyebrow">ADD TO CONTINUITY</p>
      <h2 id="fact-source-title">What is this fact about?</h2>
      <p>Facts belong to the relevant lore note. The Continuity workspace later compares those source-linked facts; it is not a separate knowledge database.</p>
    </header>

    {#if sources.length > 0}
      <label for="fact-source-note">Lore note</label>
      <select id="fact-source-note" bind:this={sourceSelect} bind:value={selectedPath}>
        {#each sources as source (source.path)}
          <option value={source.path}>{source.title}{source.noteType ? ` · ${source.noteType}` : ""}</option>
        {/each}
      </select>
      <p class="path">{selectedPath}</p>
    {:else}
      <p class="empty">This project does not have a structured lore note that can own a fact yet.</p>
    {/if}

    <footer>
      <button type="button" onclick={onCancel}>Cancel</button>
      {#if canMakeWorldProject}<button type="button" onclick={onMakeWorldProject}>Make this a world project…</button>{/if}
      {#if canCreateWorldDetail}<button type="button" onclick={onCreate}>Create world detail…</button>{/if}
      {#if sources.length > 0}<button type="button" class="primary" onclick={() => onChoose(selectedPath)}>Continue</button>{/if}
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 72; display: grid; place-items: center; padding: 1rem; background: rgba(0,0,0,.72); }
  .dialog { box-sizing: border-box; width: min(34rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; padding: 1.25rem; border: 1px solid #555; border-radius: 8px; background: #252525; color: #d4d4d4; box-shadow: 0 1rem 3rem rgba(0,0,0,.45); }
  h2, p { margin: 0; }
  h2 { margin-top: .2rem; color: #fff; }
  header > p:last-child { margin-top: .55rem; color: #aaa; line-height: 1.5; }
  .eyebrow { color: #9fcba4; font-size: .72rem; font-weight: 700; letter-spacing: .08em; }
  label { display: block; margin-top: 1.1rem; font-weight: 650; color: #eee; }
  select { box-sizing: border-box; width: 100%; margin-top: .4rem; padding: .55rem; border: 1px solid #555; border-radius: 5px; background: #191919; color: #eee; font: inherit; }
  .path { margin-top: .4rem; color: #8f8f8f; font: .76rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .empty { margin-top: 1rem; padding: .75rem; border-left: 3px solid #687b6c; background: #202420; color: #bbb; line-height: 1.45; }
  footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .55rem; margin-top: 1.2rem; }
  button { padding: .5rem .72rem; border: 1px solid #555; border-radius: 5px; background: #303030; color: #ddd; font: inherit; cursor: pointer; }
  button.primary { border-color: #719078; background: #314236; color: #eef8f0; }
  button:focus-visible, select:focus-visible, .dialog:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
</style>
