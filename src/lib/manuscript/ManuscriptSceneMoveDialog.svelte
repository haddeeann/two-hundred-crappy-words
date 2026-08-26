<script lang="ts">
  import { onMount } from "svelte";
  import type {
    ManuscriptSceneMoveDestination,
    ManuscriptSceneMovePlan,
  } from "./relocate";

  interface Props {
    destinations: ManuscriptSceneMoveDestination[];
    destinationKey: string;
    destinationIndex: number;
    plan: ManuscriptSceneMovePlan;
    busy: boolean;
    executionError: string;
    onDestination: (key: string) => void;
    onPosition: (index: number) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    destinations,
    destinationKey,
    destinationIndex,
    plan,
    busy,
    executionError,
    onDestination,
    onPosition,
    onCancel,
    onConfirm,
  }: Props = $props();
  let dialog = $state<HTMLDivElement>();
  let destinationSelect = $state<HTMLSelectElement>();
  const selectedDestination = $derived(
    destinations.find((candidate) => candidate.key === destinationKey) ?? null,
  );

  onMount(() => destinationSelect?.focus());

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current - 1 + focusable.length) % focusable.length
      : (current + 1) % focusable.length;
    event.preventDefault();
    focusable[next]?.focus();
  }
</script>

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="scene-move-heading"
    onkeydown={handleKeydown}
    bind:this={dialog}
  >
    <header>
      <div>
        <span class="eyebrow">Preview required</span>
        <h2 id="scene-move-heading">Move scene to another container</h2>
      </div>
      <button type="button" class="close" aria-label="Cancel scene move" disabled={busy} onclick={onCancel}>×</button>
    </header>

    <div class="controls">
      <label>
        Destination
        <select
          bind:this={destinationSelect}
          value={destinationKey}
          disabled={busy}
          onchange={(event) => onDestination(event.currentTarget.value)}
        >
          {#each destinations as destination (destination.key)}
            <option value={destination.key}>{destination.label}</option>
          {/each}
        </select>
      </label>
      <label>
        Position
        <select
          value={String(destinationIndex)}
          disabled={busy || !selectedDestination}
          onchange={(event) => onPosition(Number(event.currentTarget.value))}
        >
          {#each selectedDestination?.positions ?? [] as position (position.index)}
            <option value={String(position.index)}>{position.label}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if plan.kind === "unavailable"}
      <p class="problem" role="alert">{plan.reason}</p>
    {:else}
      <div class="identity">
        <span>{plan.target.manuscriptTitle}</span>
        <strong>{plan.target.sceneTitle}</strong>
        <small>The complete scene entry and its source binding move together.</small>
      </div>

      <section aria-labelledby="scene-move-change-heading">
        <span class="eyebrow">Exact container change</span>
        <h3 id="scene-move-change-heading">Portable outline arrays</h3>
        <div class="container-change">
          <div>
            <span>From · position {plan.target.oldPosition}</span>
            <strong>{plan.target.sourceContainerLabel}</strong>
            <code>{plan.target.sourceArrayJsonPath}</code>
          </div>
          <span class="arrow" aria-hidden="true">→</span>
          <div>
            <span>To · position {plan.target.newPosition}</span>
            <strong>{plan.target.destinationContainerLabel}</strong>
            <code>{plan.target.destinationArrayJsonPath}</code>
          </div>
        </div>
        <p class="placement">{plan.target.placementLabel}</p>
      </section>

      <p class="safety">
        Confirmation rereads and atomically replaces only
        <code>200-crappy-words.manuscripts.json</code>. It does not infer or move
        folders or Markdown files, and it does not count toward today’s writing.
      </p>
    {/if}

    {#if executionError}<p class="problem" role="alert">{executionError}</p>{/if}

    <footer>
      <button type="button" disabled={busy} onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="primary"
        disabled={busy || Boolean(executionError) || plan.kind !== "ready"}
        onclick={onConfirm}
      >{busy ? "Moving…" : "Confirm container move"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; z-index: 46; inset: 0; display: grid; place-items: center; padding: 1.25rem; background: rgb(0 0 0 / 66%); }
  .dialog { box-sizing: border-box; width: min(48rem, 100%); max-height: min(46rem, calc(100vh - 2.5rem)); overflow: auto; padding: 1rem; border: 1px solid #505050; border-radius: 8px; box-shadow: 0 18px 54px rgb(0 0 0 / 55%); background: #252525; color: #d4d4d4; }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  header { align-items: flex-start; margin-bottom: 0.85rem; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 1.08rem; }
  h3 { margin-top: 0.15rem; font-size: 0.86rem; }
  .eyebrow { color: #f6c177; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
  .controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; }
  label { display: flex; flex-direction: column; gap: 0.3rem; color: #bdbdbd; font-size: 0.75rem; }
  select { width: 100%; padding: 0.48rem; border: 1px solid #555555; border-radius: 4px; background: #1f1f1f; color: #e0e0e0; font: inherit; }
  .identity, .identity small { display: flex; flex-direction: column; gap: 0.15rem; }
  .identity { margin-top: 0.8rem; padding: 0.65rem; border-radius: 5px; background: #202a25; color: #bfd9c5; }
  .identity small, .safety { color: #a8a8a8; font-size: 0.73rem; line-height: 1.42; }
  section { margin-top: 0.8rem; padding: 0.7rem; border: 1px solid #444444; border-radius: 5px; background: #1f1f1f; }
  .container-change { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 0.5rem; align-items: center; margin-top: 0.65rem; }
  .container-change div { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; padding: 0.5rem; border-left: 2px solid #58728a; background: #24282c; }
  .container-change span { color: #9a9a9a; font-size: 0.7rem; }
  .container-change strong { color: #bfd9c5; }
  .arrow { color: #a9c7df; }
  .placement { margin-top: 0.65rem; color: #c7c7c7; }
  code { color: #dcd7ba; overflow-wrap: anywhere; }
  .safety { margin-top: 0.8rem; }
  .problem { margin-top: 0.65rem; padding: 0.6rem; border: 1px solid #765a39; border-radius: 4px; background: #352c22; color: #f6c177; font-size: 0.74rem; line-height: 1.4; }
  footer { justify-content: flex-end; margin-top: 1rem; }
  button { padding: 0.45rem 0.7rem; border: 1px solid #555555; border-radius: 4px; background: #303030; color: #d4d4d4; font: inherit; cursor: pointer; }
  button:hover:not(:disabled) { background: #3a3a3a; }
  button.primary { border-color: #4f7f60; background: #365c43; }
  button.close { padding: 0.1rem 0.35rem; border: 0; background: transparent; font-size: 1.2rem; }
  button:disabled { opacity: 0.55; cursor: default; }
  button:focus-visible, select:focus-visible { outline: 2px solid #75beff; outline-offset: 2px; }
  @media (max-width: 38rem) { .controls, .container-change { grid-template-columns: 1fr; } .arrow { transform: rotate(90deg); justify-self: center; } }
</style>
