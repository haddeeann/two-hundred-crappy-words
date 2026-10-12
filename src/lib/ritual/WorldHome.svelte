<script lang="ts">
  interface Props {
    projectName: string;
    dateLabel: string;
    progressLabel: string;
    rhythmLabel: string;
    resumeLabel: string | null;
    nextSessionNote: string;
    canCreateLore: boolean;
    busy?: boolean;
    onWriteToday: () => void;
    onResume: () => void;
    onRemember: () => void;
    onPlan: () => void;
    onLearn: () => void;
  }

  let {
    projectName,
    dateLabel,
    progressLabel,
    rhythmLabel,
    resumeLabel,
    nextSessionNote,
    canCreateLore,
    busy = false,
    onWriteToday,
    onResume,
    onRemember,
    onPlan,
    onLearn,
  }: Props = $props();
</script>

<section class="world-home" aria-labelledby="world-home-title">
  <div class="home-shell">
    <header>
      <p class="eyebrow">{dateLabel}</p>
      <h2 id="world-home-title">Welcome back to {projectName}</h2>
      <p class="lede">Begin with the words. The world can grow around them.</p>
    </header>

    {#if nextSessionNote}
      <aside class="return-note" aria-labelledby="return-note-title">
        <p id="return-note-title">A note from your last session</p>
        <blockquote>{nextSessionNote}</blockquote>
      </aside>
    {/if}

    <div class="primary-actions">
      <button type="button" class="action-card primary" disabled={busy} onclick={onWriteToday}>
        <span class="action-title">Write today</span>
        <span class="action-copy">Open today’s ordinary Markdown draft.</span>
        <span class="arrow" aria-hidden="true">→</span>
      </button>

      {#if resumeLabel}
        <button type="button" class="action-card" disabled={busy} onclick={onResume}>
          <span class="action-title">Continue {resumeLabel}</span>
          <span class="action-copy">Return to the file you had open.</span>
          <span class="arrow" aria-hidden="true">→</span>
        </button>
      {/if}
    </div>

    <div class="progress" role="region" aria-label="Today’s writing progress">
      <div>
        <span>Today</span>
        <strong>{progressLabel}</strong>
      </div>
      <p>{rhythmLabel}</p>
    </div>

    <div class="secondary-actions" aria-label="Worldbuilding paths">
      <button type="button" disabled={busy || !canCreateLore} onclick={onRemember}>
        <strong>Remember something</strong>
        <span>{canCreateLore ? "Create a character, place, event, or other lore note." : "Available in a world project."}</span>
      </button>
      <button type="button" disabled={busy} onclick={onPlan}>
        <strong>Plan what happens</strong>
        <span>Open manuscript structure, scenes, and corkboards.</span>
      </button>
    </div>

    <footer>
      <button type="button" class="learn" onclick={onLearn}>New here? Open the learning guide</button>
      <p>Your files remain ordinary, local, and yours.</p>
    </footer>
  </div>
</section>

<style>
  .world-home {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: clamp(1.5rem, 5vw, 4.5rem);
    background:
      radial-gradient(circle at 78% 12%, rgba(72, 113, 124, 0.17), transparent 27rem),
      #1e1e1e;
    color: #d4d4d4;
  }

  .home-shell {
    width: min(52rem, 100%);
    margin: 0 auto;
  }

  header {
    margin-bottom: 1.75rem;
  }

  .eyebrow,
  h2,
  .lede,
  .return-note p,
  .return-note blockquote,
  .progress p,
  footer p {
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
    font-size: clamp(1.65rem, 4vw, 2.65rem);
    line-height: 1.15;
  }

  .lede {
    margin-top: 0.65rem;
    color: #b8b8b8;
    font-size: 1.02rem;
  }

  .return-note {
    margin-bottom: 1rem;
    padding: 0.85rem 1rem;
    border: 1px solid #4b604f;
    border-radius: 7px;
    background: #222b24;
  }

  .return-note p {
    color: #9fcba4;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .return-note blockquote {
    margin-top: 0.35rem;
    color: #e3e9e4;
    white-space: pre-wrap;
  }

  .primary-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  button {
    border: 1px solid #4b4b4b;
    border-radius: 7px;
    background: #292929;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: #687168;
    background: #323532;
  }

  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.48;
    cursor: default;
  }

  .action-card {
    position: relative;
    min-height: 7.5rem;
    padding: 1.1rem 2.5rem 1.1rem 1.1rem;
    text-align: left;
  }

  .action-card.primary {
    border-color: #557b5b;
    background: #29322b;
  }

  .action-title,
  .action-copy {
    display: block;
  }

  .action-title {
    color: #f2f2f2;
    font-size: 1.08rem;
    font-weight: 700;
  }

  .action-copy {
    margin-top: 0.4rem;
    color: #b8b8b8;
    line-height: 1.45;
  }

  .arrow {
    position: absolute;
    top: 1rem;
    right: 1rem;
    color: #9fcba4;
    font-size: 1.3rem;
  }

  .progress {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 0.75rem 0 1.5rem;
    padding: 0.65rem 0.8rem;
    border-top: 1px solid #383838;
    border-bottom: 1px solid #383838;
    color: #b8b8b8;
    font-size: 0.82rem;
  }

  .progress div {
    display: flex;
    gap: 0.45rem;
  }

  .progress strong {
    color: #d4ead7;
  }

  .secondary-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .secondary-actions button {
    padding: 0.9rem 1rem;
    text-align: left;
  }

  .secondary-actions strong,
  .secondary-actions span {
    display: block;
  }

  .secondary-actions strong {
    color: #e8e8e8;
  }

  .secondary-actions span {
    margin-top: 0.3rem;
    color: #aaa;
    font-size: 0.82rem;
    line-height: 1.4;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 2rem;
  }

  .learn {
    padding: 0;
    border: 0;
    background: transparent;
    color: #9ec8e6;
    text-decoration: underline;
    text-underline-offset: 0.18rem;
  }

  .learn:hover:not(:disabled) {
    border: 0;
    background: transparent;
    color: #c6e3f7;
  }

  footer p {
    color: #858585;
    font-size: 0.78rem;
  }

  @media (max-width: 720px) {
    .primary-actions,
    .secondary-actions {
      grid-template-columns: 1fr;
    }

    footer,
    .progress {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
