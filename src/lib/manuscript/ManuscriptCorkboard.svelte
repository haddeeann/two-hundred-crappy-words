<script lang="ts">
  import { onMount, tick } from "svelte";
  import type {
    ManuscriptSourceState,
    ReconciledManuscript,
    ReconciledManuscriptChapter,
    ReconciledManuscriptScene,
  } from "./source-reconciliation";
  import type { ManuscriptReorderDirection } from "./reorder";
  import type { ManuscriptOutlineMetadata } from "./structure";

  interface Props {
    manuscript: ReconciledManuscript;
    busy: boolean;
    focusItemId: string;
    focusRevision: number;
    onClose: () => void;
    onOpenSource: (path: string, fingerprint: string) => void;
    onEditMetadata: (itemId: string) => void;
    onReorder: (itemId: string, direction: ManuscriptReorderDirection) => void;
  }

  interface PositionedScene {
    scene: ReconciledManuscriptScene;
    topLevelIndex: number;
  }

  type CorkboardBlock =
    | { kind: "chapter"; chapter: ReconciledManuscriptChapter; topLevelIndex: number }
    | { kind: "loose-scenes"; key: string; scenes: PositionedScene[] };

  let {
    manuscript,
    busy,
    focusItemId,
    focusRevision,
    onClose,
    onOpenSource,
    onEditMetadata,
    onReorder,
  }: Props = $props();
  let board = $state<HTMLElement>();
  const blocks = $derived.by(() => corkboardBlocks(manuscript));

  onMount(() => board?.focus());

  $effect(() => {
    const itemId = focusItemId;
    const revision = focusRevision;
    if (!itemId || revision < 1) return;
    void tick().then(() => {
      document.getElementById(`corkboard-item-${itemId}`)?.focus();
    });
  });

  function corkboardBlocks(value: ReconciledManuscript): CorkboardBlock[] {
    const result: CorkboardBlock[] = [];
    for (let topLevelIndex = 0; topLevelIndex < value.items.length; topLevelIndex += 1) {
      const item = value.items[topLevelIndex]!;
      if ("children" in item) {
        result.push({ kind: "chapter", chapter: item, topLevelIndex });
        continue;
      }
      const previous = result.at(-1);
      if (previous?.kind === "loose-scenes") {
        previous.scenes.push({ scene: item, topLevelIndex });
      } else {
        result.push({
          kind: "loose-scenes",
          key: item.item.id,
          scenes: [{ scene: item, topLevelIndex }],
        });
      }
    }
    return result;
  }

  function sourceMessage(state: ManuscriptSourceState): string {
    if (state.kind === "ready") return state.resolvedPath;
    if (state.kind === "moved") {
      return `Moved candidate: ${state.suggestedPath}; structure not changed.`;
    }
    if (state.kind === "ambiguous-id") {
      return `Ambiguous stable ID: ${state.candidatePaths.join(", ")}`;
    }
    if (state.kind === "identity-mismatch") {
      return `Identity changed at ${state.resolvedPath}.`;
    }
    if (state.kind === "path-conflict") {
      return `Source conflict at ${state.resolvedPath}.`;
    }
    return state.message;
  }
</script>

{#snippet metadata(item: ManuscriptOutlineMetadata)}
  {#if item.status || item.pov || item.location || item.storyDate || item.targetWords || item.labels?.length || !item.includeInCompile}
    <div class="metadata" aria-label="Planning details">
      {#if item.status}<span>{item.status}</span>{/if}
      {#if item.pov}<span>POV · {item.pov}</span>{/if}
      {#if item.location}<span>{item.location}</span>{/if}
      {#if item.storyDate}<span>{item.storyDate}</span>{/if}
      {#if item.targetWords}<span>{item.targetWords.toLocaleString()} words</span>{/if}
      {#each item.labels ?? [] as label (label)}<span>#{label}</span>{/each}
      {#if !item.includeInCompile}<span class="excluded">Excluded from compile</span>{/if}
    </div>
  {/if}
  {#if item.notes}
    <details class="notes">
      <summary>Planning notes</summary>
      <p>{item.notes}</p>
    </details>
  {/if}
{/snippet}

{#snippet itemActions(
  itemId: string,
  itemTitle: string,
  canMoveEarlier: boolean,
  canMoveLater: boolean,
)}
  <div class="item-actions" aria-label={`Plan ${itemTitle}`}>
    <button type="button" disabled={busy} onclick={() => onEditMetadata(itemId)}>Edit details…</button>
    {#if canMoveEarlier}
      <button
        type="button"
        disabled={busy}
        aria-label={`Move ${itemTitle} earlier`}
        onclick={() => onReorder(itemId, "earlier")}
      >↑ Earlier</button>
    {/if}
    {#if canMoveLater}
      <button
        type="button"
        disabled={busy}
        aria-label={`Move ${itemTitle} later`}
        onclick={() => onReorder(itemId, "later")}
      >↓ Later</button>
    {/if}
  </div>
{/snippet}

{#snippet sourceAction(label: string, state: ManuscriptSourceState)}
  {#if state.kind === "ready"}
    <button
      type="button"
      class="open-source"
      title={`Open ${state.resolvedPath}`}
      onclick={() => onOpenSource(state.resolvedPath, state.fingerprint)}
    >{label}</button>
    <small>{state.resolvedPath}</small>
  {:else}
    <p class="source-warning" role="status">{sourceMessage(state)}</p>
  {/if}
{/snippet}

{#snippet sceneCard(
  scene: ReconciledManuscriptScene,
  canMoveEarlier: boolean,
  canMoveLater: boolean,
)}
  <article
    class="scene-card"
    id={`corkboard-item-${scene.item.id}`}
    tabindex="-1"
    aria-labelledby={`corkboard-scene-${scene.item.id}`}
  >
    <div class="card-number" aria-hidden="true">Scene</div>
    <h3 id={`corkboard-scene-${scene.item.id}`}>{scene.item.title}</h3>
    {#if scene.item.synopsis}
      <p class="synopsis">{scene.item.synopsis}</p>
    {:else}
      <p class="empty-synopsis">No synopsis yet.</p>
    {/if}
    {@render metadata(scene.item)}
    <div class="card-source">
      {@render sourceAction("Open scene", scene.source)}
    </div>
    {@render itemActions(scene.item.id, scene.item.title, canMoveEarlier, canMoveLater)}
  </article>
{/snippet}

{#snippet chapterSection(chapter: ReconciledManuscriptChapter, topLevelIndex: number)}
  <section
    class="chapter"
    id={`corkboard-item-${chapter.item.id}`}
    tabindex="-1"
    aria-labelledby={`corkboard-chapter-${chapter.item.id}`}
  >
    <header class="chapter-header">
      <div>
        <span class="section-label">Chapter</span>
        <h2 id={`corkboard-chapter-${chapter.item.id}`}>{chapter.item.title}</h2>
        {#if chapter.item.synopsis}<p class="chapter-synopsis">{chapter.item.synopsis}</p>{/if}
        {@render metadata(chapter.item)}
      </div>
      <div class="chapter-sources">
        {#if chapter.overview}{@render sourceAction("Open chapter overview", chapter.overview)}{/if}
        {#if chapter.source}{@render sourceAction("Open chapter prose", chapter.source)}{/if}
        {@render itemActions(
          chapter.item.id,
          chapter.item.title,
          topLevelIndex > 0,
          topLevelIndex < manuscript.items.length - 1,
        )}
      </div>
    </header>

    {#if chapter.folder && chapter.folder.kind !== "ready"}
      <p class="source-warning" role="status">{chapter.folder.message}</p>
    {/if}
    {#if chapter.children.length > 0}
      <div class="cards">
        {#each chapter.children as scene, childIndex (scene.item.id)}
          {@render sceneCard(
            scene,
            childIndex > 0,
            childIndex < chapter.children.length - 1,
          )}
        {/each}
      </div>
    {:else if !chapter.source}
      <p class="empty-section">No scene cards yet.</p>
    {/if}
  </section>
{/snippet}

<section class="corkboard" aria-labelledby="corkboard-heading" tabindex="-1" bind:this={board}>
  <header class="board-header">
    <div>
      <span class="eyebrow">Corkboard</span>
      <h1 id="corkboard-heading">{manuscript.manuscript.title}</h1>
      <p>Chapters and scenes follow the portable manuscript order. Scene prose remains in Markdown.</p>
    </div>
    <button type="button" class="close-board" onclick={onClose}>Return to editor</button>
  </header>

  {#if blocks.length === 0}
    <div class="empty-board">
      <h2>No chapters or scenes yet</h2>
      <p>The corkboard will reflect items added to the manuscript structure.</p>
    </div>
  {:else}
    <div class="board-sections">
      {#each blocks as block (block.kind === "chapter" ? block.chapter.item.id : block.key)}
        {#if block.kind === "chapter"}
          {@render chapterSection(block.chapter, block.topLevelIndex)}
        {:else}
          <section class="chapter loose" aria-labelledby={`loose-scenes-${block.key}`}>
            <header class="chapter-header">
              <div>
                <span class="section-label">Outside chapters</span>
                <h2 id={`loose-scenes-${block.key}`}>Loose scenes</h2>
              </div>
            </header>
            <div class="cards">
              {#each block.scenes as positioned (positioned.scene.item.id)}
                {@render sceneCard(
                  positioned.scene,
                  positioned.topLevelIndex > 0,
                  positioned.topLevelIndex < manuscript.items.length - 1,
                )}
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    </div>
  {/if}
</section>

<style>
  .corkboard { box-sizing: border-box; width: 100%; height: 100%; flex: 1 1 auto; overflow: auto; padding: 1.4rem; outline: none; background: #191919; color: #d4d4d4; }
  .corkboard:focus-visible { box-shadow: inset 0 0 0 2px #75beff; }
  .board-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; max-width: 78rem; margin: 0 auto 1.25rem; }
  .board-header h1, .chapter h2, .scene-card h3, p { margin: 0; }
  .board-header h1 { margin-top: 0.1rem; color: #eeeeee; font-size: 1.45rem; }
  .board-header p { max-width: 42rem; margin-top: 0.25rem; color: #9f9f9f; line-height: 1.45; }
  .eyebrow, .section-label, .card-number { color: #f6c177; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  button { border: 1px solid #505050; border-radius: 4px; background: #2c2c2c; color: #d5d5d5; font: inherit; cursor: pointer; }
  button:hover { background: #363636; }
  button:focus-visible, summary:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  .close-board { flex: 0 0 auto; padding: 0.5rem 0.7rem; }
  .board-sections { display: grid; gap: 1.15rem; max-width: 78rem; margin: 0 auto; }
  .chapter { padding: 1rem; border: 1px solid #3f3f3f; border-radius: 7px; background: #222222; box-shadow: 0 5px 18px rgb(0 0 0 / 18%); }
  .chapter.loose { border-style: dashed; }
  .chapter-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.8rem; }
  .chapter h2 { margin-top: 0.12rem; color: #e4e4e4; font-size: 1.05rem; }
  .chapter-synopsis { max-width: 52rem; margin-top: 0.3rem; color: #b7b7b7; line-height: 1.42; white-space: pre-wrap; }
  .chapter-sources { display: flex; flex: 0 0 auto; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
  .chapter-sources small { max-width: 20rem; text-align: right; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr)); gap: 0.75rem; }
  .scene-card { display: flex; min-height: 10rem; flex-direction: column; padding: 0.85rem; border: 1px solid #49443b; border-radius: 5px; background: #2a2824; box-shadow: 0 3px 12px rgb(0 0 0 / 20%); }
  .scene-card:focus-visible, .chapter:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  .scene-card h3 { margin-top: 0.1rem; color: #f0eee8; font-size: 0.96rem; }
  .synopsis, .empty-synopsis { margin-top: 0.45rem; line-height: 1.45; white-space: pre-wrap; }
  .synopsis { color: #c6c1b8; }
  .empty-synopsis { color: #7f7b74; font-style: italic; }
  .metadata { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.55rem; }
  .metadata span { padding: 0.13rem 0.35rem; border-radius: 999px; background: #353b3f; color: #b7c8d3; font-size: 0.68rem; }
  .metadata span.excluded { background: #413630; color: #d9b6a5; }
  .notes { margin-top: 0.55rem; color: #aaa49b; font-size: 0.75rem; }
  .notes summary { width: fit-content; cursor: pointer; }
  .notes p { margin-top: 0.35rem; line-height: 1.4; white-space: pre-wrap; }
  .card-source { display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; margin-top: auto; padding-top: 0.75rem; }
  .open-source { padding: 0.38rem 0.55rem; border-color: #4d6980; background: #27343f; color: #b9d9f1; }
  small { overflow-wrap: anywhere; color: #858585; font-size: 0.68rem; }
  .source-warning { margin-top: 0.55rem; color: #efb0a6; font-size: 0.75rem; line-height: 1.4; }
  .item-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.65rem; padding-top: 0.55rem; border-top: 1px solid #45413a; }
  .item-actions button { padding: 0.3rem 0.45rem; border-color: #4d5357; background: #2b3033; color: #becbd3; font-size: 0.73rem; }
  .item-actions button:disabled { opacity: 0.55; cursor: default; }
  .empty-section, .empty-board { color: #8f8f8f; }
  .empty-board { max-width: 78rem; margin: 3rem auto; text-align: center; }
  .empty-board h2 { color: #cfcfcf; }
  .empty-board p { margin-top: 0.35rem; }
  @media (max-width: 44rem) {
    .corkboard { padding: 1rem; }
    .board-header, .chapter-header { flex-direction: column; }
    .chapter-sources { align-items: flex-start; }
    .chapter-sources small { text-align: left; }
  }
</style>
