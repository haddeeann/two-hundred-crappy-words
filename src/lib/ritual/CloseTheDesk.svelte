<script lang="ts">
  import { MAX_NEXT_SESSION_NOTE_LENGTH } from "$lib/project/workspace";

  interface Props {
    projectName: string;
    progressLabel: string;
    documentLabel: string | null;
    note: string;
    busy?: boolean;
    error?: string;
    onNote: (note: string) => void;
    onFinish: () => void;
    onReturn: () => void;
  }

  let {
    projectName,
    progressLabel,
    documentLabel,
    note,
    busy = false,
    error = "",
    onNote,
    onFinish,
    onReturn,
  }: Props = $props();
</script>

<section class="close-desk" aria-labelledby="close-desk-title">
  <form
    onsubmit={(event) => {
      event.preventDefault();
      onFinish();
    }}
  >
    <p class="eyebrow">Close the desk</p>
    <h2 id="close-desk-title">The words are safe.</h2>
    <p class="lede">Leave {projectName} ready for the next time you return.</p>

    <dl>
      <div><dt>Today</dt><dd>{progressLabel}</dd></div>
      <div><dt>Last open</dt><dd>{documentLabel ?? "No document"}</dd></div>
      <div><dt>Files</dt><dd>Saved before this page opened</dd></div>
    </dl>

    <label for="next-session-note">A note for next time <span>Optional</span></label>
    <textarea
      id="next-session-note"
      maxlength={MAX_NEXT_SESSION_NOTE_LENGTH}
      rows="4"
      placeholder="Where should I begin?"
      value={note}
      oninput={(event) => onNote((event.currentTarget as HTMLTextAreaElement).value)}
      disabled={busy}
    ></textarea>
    <p class="privacy">This reminder stays private to ME on this Mac. It does not change a project file.</p>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="actions">
      <button type="submit" class="primary" disabled={busy}>{busy ? "Finishing…" : "Finish for today"}</button>
      <button type="button" disabled={busy} onclick={onReturn}>Return to writing</button>
    </div>
  </form>
</section>

<style>
  .close-desk {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: clamp(1.5rem, 6vw, 5rem);
    background:
      radial-gradient(circle at 50% 110%, rgba(86, 123, 91, 0.18), transparent 28rem),
      #1e1e1e;
    color: #d4d4d4;
  }

  form {
    width: min(36rem, 100%);
    margin: 0 auto;
  }

  p,
  h2,
  dl {
    margin: 0;
  }

  .eyebrow {
    color: #9fcba4;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h2 {
    margin-top: 0.35rem;
    color: #fff;
    font-size: clamp(1.7rem, 4vw, 2.65rem);
  }

  .lede {
    margin-top: 0.55rem;
    color: #b8b8b8;
  }

  dl {
    margin: 1.75rem 0;
    border-top: 1px solid #3d3d3d;
    border-bottom: 1px solid #3d3d3d;
  }

  dl div {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr);
    gap: 1rem;
    padding: 0.65rem 0;
  }

  dl div + div {
    border-top: 1px solid #333;
  }

  dt {
    color: #9a9a9a;
  }

  dd {
    margin: 0;
    color: #e0e0e0;
  }

  label,
  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
  }

  label {
    margin-bottom: 0.45rem;
    color: #e8e8e8;
    font-weight: 650;
  }

  label span {
    margin-left: 0.35rem;
    color: #929292;
    font-size: 0.78rem;
    font-weight: 400;
  }

  textarea {
    resize: vertical;
    padding: 0.75rem;
    border: 1px solid #505050;
    border-radius: 6px;
    outline: 0;
    background: #252525;
    color: #e8e8e8;
    font: inherit;
    line-height: 1.5;
  }

  textarea:focus {
    border-color: #75beff;
    box-shadow: 0 0 0 1px #75beff;
  }

  .privacy {
    margin-top: 0.45rem;
    color: #929292;
    font-size: 0.78rem;
  }

  .error {
    margin-top: 0.8rem;
    color: #f48771;
  }

  .actions {
    display: flex;
    gap: 0.65rem;
    margin-top: 1.4rem;
  }

  button {
    padding: 0.58rem 0.85rem;
    border: 1px solid #4b4b4b;
    border-radius: 5px;
    background: #292929;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  button.primary {
    border-color: #557b5b;
    background: #29322b;
    color: #d4ead7;
  }

  button:hover:not(:disabled) {
    background: #353535;
  }

  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
</style>
