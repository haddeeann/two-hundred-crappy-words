<script lang="ts">
  import {
    planContinuityExceptionMutation,
    type ContinuityExceptionMutationPlan,
    type ContinuityExceptionMutationRequest,
  } from "./mutation";

  interface Props {
    request: ContinuityExceptionMutationRequest;
    originalText: string | null;
    projectId: string;
    busy: boolean;
    error: string;
    onChange: (request: ContinuityExceptionMutationRequest) => void;
    onConfirm: (
      plan: Extract<ContinuityExceptionMutationPlan, { kind: "ready" }>,
      request: ContinuityExceptionMutationRequest,
    ) => void;
    onCancel: () => void;
  }

  let {
    request,
    originalText,
    projectId,
    busy,
    error,
    onChange,
    onConfirm,
    onCancel,
  }: Props = $props();

  const plan = $derived(planContinuityExceptionMutation(originalText, projectId, request));
  const removing = $derived(request.kind === "remove-exception");
  const title = $derived(
    request.kind === "add-exception"
      ? "Mark finding intentional"
      : request.kind === "update-explanation"
        ? "Edit writer explanation"
        : "Remove intentional exception",
  );
  let cancelButton: HTMLButtonElement;
  let dialogElement: HTMLDivElement;

  $effect(() => {
    cancelButton?.focus();
  });

  function updateExplanation(explanation: string): void {
    if (request.kind === "remove-exception") return;
    onChange({ ...request, explanation });
  }

  function submit(): void {
    if (plan.kind === "ready" && !busy) onConfirm(plan, request);
  }

  function dialogKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialogElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), summary',
    )].filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div class="backdrop" role="presentation">
  <div
    bind:this={dialogElement}
    class="dialog"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="continuity-exception-heading"
    onkeydown={dialogKeydown}
  >
    <header>
      <div>
        <p class="eyebrow">Guarded project change</p>
        <h2 id="continuity-exception-heading">{title}</h2>
      </div>
      <button bind:this={cancelButton} type="button" onclick={onCancel} disabled={busy}>Cancel</button>
    </header>

    {#if request.kind === "add-exception"}
      <p>This exception applies only to the exact <strong>{request.severity}</strong> finding from <code>{request.ruleId}</code>, rule version {request.ruleVersion}, with its current evidence identities.</p>
      <p class="safety">If that rule or evidence changes, the exception becomes visibly stale instead of silently moving to another finding.</p>
    {:else if request.kind === "update-explanation"}
      <p>Only the writer explanation for this stable exception will change.</p>
    {:else}
      <p>This removes only the selected intentional exception. It does not change the underlying lore, timeline, relationship, travel, or manuscript sources.</p>
    {/if}

    {#if request.kind !== "remove-exception"}
      <label>
        Writer explanation
        <textarea
          rows="6"
          maxlength="10000"
          value={request.explanation}
          placeholder="Explain why this exact finding is intentional."
          oninput={(event) => updateExplanation(event.currentTarget.value)}
          onchange={(event) => updateExplanation(event.currentTarget.value)}
        ></textarea>
      </label>
      <p class="hint">This explanation travels with the project and remains visible in Continuity review.</p>
    {/if}

    {#if plan.kind === "ready"}
      <p class="summary" role="status">{plan.summary}</p>
      {#if plan.originalText === null}
        <p class="safety">This will create the optional project-root exception file. An existing file will never be overwritten.</p>
      {:else}
        <details>
          <summary>Review exact JSON before this change</summary>
          <pre>{plan.originalText}</pre>
        </details>
      {/if}
      <details>
        <summary>Review exact JSON after this change</summary>
        <pre>{plan.updatedText}</pre>
      </details>
    {:else if plan.kind === "blocked"}
      <div class="problem" role="alert">
        <p>The proposed intentional-exception file is not valid:</p>
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
        class:danger={removing}
        class:primary={!removing}
        disabled={busy || plan.kind !== "ready"}
        onclick={submit}
      >{busy ? "Applying…" : removing ? "Confirm removal" : "Apply change"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 1rem; background: rgb(28 24 30 / 0.5); }
  .dialog { width: min(44rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border: 1px solid #cfc5d1; border-radius: 0.75rem; background: #fbfaf7; color: #292529; box-shadow: 0 1.2rem 4rem rgb(25 20 28 / 0.28); padding: 1rem; }
  header, footer { display: flex; gap: 0.75rem; }
  header { justify-content: space-between; align-items: flex-start; }
  footer { justify-content: flex-end; margin-top: 1rem; }
  h2, p { margin-top: 0; }
  .eyebrow { margin-bottom: 0.2rem; color: #745a80; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  label { display: grid; gap: 0.3rem; margin: 0.8rem 0 0.25rem; font-weight: 700; }
  textarea, button { font: inherit; }
  textarea { box-sizing: border-box; width: 100%; resize: vertical; border: 1px solid #bfb5c2; border-radius: 0.45rem; background: #fff; color: inherit; padding: 0.52rem; line-height: 1.45; }
  button { border: 1px solid #cfc5d1; border-radius: 0.45rem; background: #fff; color: inherit; padding: 0.45rem 0.75rem; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { border-color: #4f3f59; background: #4f3f59; color: #fff; }
  button.danger { border-color: #a63d40; background: #a63d40; color: #fff; }
  button:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid #6b4d78; outline-offset: 2px; }
  .hint, .safety { color: #655e66; font-size: 0.8rem; line-height: 1.45; }
  .summary { margin: 0.9rem 0; border: 1px solid #a9c3ad; border-radius: 0.45rem; background: #edf5ee; padding: 0.65rem; color: #2d5534; }
  .problem { margin: 0.9rem 0; border: 1px solid #cf8989; border-radius: 0.45rem; background: #fff1f1; padding: 0.65rem; color: #7c2020; }
  details { margin-top: 0.7rem; }
  summary { color: #4f3f59; cursor: pointer; font-weight: 700; }
  pre { max-height: 18rem; overflow: auto; border: 1px solid #ddd3df; border-radius: 0.4rem; background: #f4f1f4; padding: 0.65rem; font-size: 0.72rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  code { overflow-wrap: anywhere; }
</style>
