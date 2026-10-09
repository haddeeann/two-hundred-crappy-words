<script lang="ts">
  type HelpTopic =
    | "start"
    | "daily"
    | "projects"
    | "links"
    | "structure"
    | "continuity"
    | "privacy"
    | "shortcuts";

  interface Props {
    hasProject: boolean;
    suspended?: boolean;
    onClose: () => void;
    onOpenFolder: () => void;
    onCreateProject: () => void;
    onCreateSample: () => void;
  }

  let { hasProject, suspended = false, onClose, onOpenFolder, onCreateProject, onCreateSample }: Props = $props();
  let topic = $state<HelpTopic>("start");

  const topics: ReadonlyArray<{ id: HelpTopic; label: string }> = [
    { id: "start", label: "Getting started" },
    { id: "daily", label: "Daily writing" },
    { id: "projects", label: "Projects & backups" },
    { id: "links", label: "Connected lore" },
    { id: "structure", label: "Manuscripts & export" },
    { id: "continuity", label: "Continuity tools" },
    { id: "privacy", label: "Privacy & recovery" },
    { id: "shortcuts", label: "Keyboard shortcuts" },
  ];

  function handleKeydown(event: KeyboardEvent): void {
    if (suspended || event.defaultPrevented || event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="getting-started" aria-labelledby="getting-started-title">
  <header>
    <div>
      <p class="eyebrow">Ministry of Elsewhere</p>
      <h2 id="getting-started-title">A calm place to begin</h2>
      <p>Open your science-fiction world, write today, and keep its facts close at hand.</p>
    </div>
    <button type="button" class="close" aria-label="Close Getting Started" title="Close Getting Started (Escape)" onclick={onClose}>×</button>
  </header>

  <div class="help-layout">
    <nav aria-label="Help topics">
      {#each topics as item}
        <button
          type="button"
          class:active={topic === item.id}
          aria-current={topic === item.id ? "page" : undefined}
          onclick={() => (topic = item.id)}
        >{item.label}</button>
      {/each}
    </nav>

    <article>
      {#if topic === "start"}
        <h3>Start with your files</h3>
        <p>Your writing stays in ordinary files on this Mac. No account or internet connection is required.</p>
        <div class="start-actions">
          <button type="button" class="primary" onclick={onOpenFolder}>Open a folder…</button>
          <button type="button" onclick={onCreateProject}>Create a world project…</button>
          <button type="button" onclick={onCreateSample}>Explore the sample world…</button>
        </div>
        {#if hasProject}
          <p class="note">A project is already open. These actions are optional; closing Help returns to it unchanged.</p>
        {:else}
          <ol>
            <li>Open an existing writing folder or create a world project.</li>
            <li>Choose <strong>Write today</strong> to begin or resume today’s Markdown draft.</li>
            <li>Let autosave finish; the status above the editor will say <strong>Saved</strong>.</li>
          </ol>
        {/if}
        <p class="note">You can close this now and reopen it at any time from <strong>Help → Getting Started</strong> or Writing tools.</p>
        <p class="note">The optional sample is created as a separate ordinary folder only after you choose its location and confirm every path.</p>
      {:else if topic === "daily"}
        <h3>Daily writing</h3>
        <p><strong>Write today</strong> opens <code>Daily/YYYY-MM-DD.md</code>. A missing dated file is created only after the first non-empty edit.</p>
        <p>Only words added during active editing earn today’s credit. Deleting or revising never removes credit already earned, and a missed day never erases an earlier rhythm.</p>
      {:else if topic === "projects"}
        <h3>Projects and backups</h3>
        <p>An ordinary folder works immediately. A world project adds a small visible identity file and optional folders for manuscript and lore.</p>
        <p>Back up the complete project folder. It includes Daily drafts, prose, lore, maps, and portable planning metadata. Goals, credited history, recent locations, permission scopes, and temporary recovery drafts remain private to this app on this Mac.</p>
      {:else if topic === "links"}
        <h3>Connected lore</h3>
        <p>Type <code>[[</code> in Markdown to link a character, place, technology, or other note. Completion, search, outgoing links, and backlinks are derived locally without creating a private lore database.</p>
        <p>Writing tools can create structured Markdown notes. Their frontmatter supplies stable identity while the prose remains ordinary Markdown.</p>
      {:else if topic === "structure"}
        <h3>Manuscripts and export</h3>
        <p>A manuscript structure records book, chapter, and scene order without moving prose out of its files. Chapters may be folders with an optional overview, while each scene can remain its own Markdown file.</p>
        <p>Export rechecks every source before creating Markdown, plain text, EPUB, or a print-interior PDF. Planning titles and notes stay out of the exported book.</p>
      {:else if topic === "continuity"}
        <h3>Continuity tools</h3>
        <p>Timeline, relationships, travel, maps, and Continuity review derive evidence from explicit project facts. Findings link back to their sources and never silently repair creative work.</p>
        <p>A contradiction can be marked intentional only with a writer explanation. Missing information remains visible as uncertainty rather than being guessed.</p>
      {:else if topic === "privacy"}
        <h3>Privacy and recovery</h3>
        <p>The core app is offline and sends no manuscript, analytics, or crash report anywhere. Recovery drafts are temporary app-local safety copies for unsaved work—not version history and not a replacement for backups.</p>
        <p>When a source changes outside the app, autosave refuses to overwrite it and asks the writer how to proceed.</p>
      {:else}
        <h3>Keyboard shortcuts</h3>
        <dl>
          <div><dt>Command/Ctrl+O</dt><dd>Open folder</dd></div>
          <div><dt>Command/Ctrl+N</dt><dd>New file in the selected project folder</dd></div>
          <div><dt>Command/Ctrl+S</dt><dd>Save now</dd></div>
          <div><dt>Command/Ctrl+P</dt><dd>Search project notes</dd></div>
          <div><dt>Command/Ctrl+[ / ]</dt><dd>Back or forward through connected lore</dd></div>
          <div><dt>F2</dt><dd>Rename the focused file</dd></div>
          <div><dt>Escape</dt><dd>Close the active panel, dialog, or Help</dd></div>
        </dl>
      {/if}
    </article>
  </div>
</section>

<style>
  .getting-started {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: clamp(1.25rem, 4vw, 3rem);
    background: #1e1e1e;
    color: #d4d4d4;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    max-width: 64rem;
    margin: 0 auto 2rem;
  }

  header h2,
  header p {
    margin: 0;
  }

  header h2 {
    margin-top: 0.25rem;
    color: #fff;
    font-size: clamp(1.6rem, 4vw, 2.5rem);
  }

  header > div > p:last-child {
    margin-top: 0.6rem;
    color: #b8b8b8;
  }

  .eyebrow {
    color: #9fcba4;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  button {
    border: 1px solid #4b4b4b;
    border-radius: 5px;
    background: #292929;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  button:hover {
    background: #353535;
  }

  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .close {
    flex: 0 0 auto;
    width: 2rem;
    height: 2rem;
    padding: 0;
    font-size: 1.35rem;
  }

  .help-layout {
    display: grid;
    grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr);
    gap: clamp(1.25rem, 4vw, 3rem);
    max-width: 64rem;
    margin: 0 auto;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  nav button {
    padding: 0.55rem 0.7rem;
    border-color: transparent;
    background: transparent;
    text-align: left;
  }

  nav button.active {
    border-color: #557b5b;
    background: #29322b;
    color: #d4ead7;
  }

  article {
    max-width: 42rem;
    line-height: 1.6;
  }

  article h3 {
    margin: 0 0 0.75rem;
    color: #fff;
    font-size: 1.25rem;
  }

  article p,
  article ol {
    margin: 0 0 1rem;
  }

  code {
    color: #d9efff;
  }

  .start-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin: 1.25rem 0;
  }

  .start-actions button {
    padding: 0.6rem 0.9rem;
  }

  .start-actions .primary {
    border-color: #4da3d9;
    background: #173247;
    color: #d9efff;
  }

  .note {
    color: #a8a8a8;
    font-size: 0.9rem;
  }

  dl {
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(9rem, 12rem) 1fr;
    gap: 1rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid #3c3c3c;
  }

  dt {
    color: #d9efff;
    font-weight: 600;
  }

  dd {
    margin: 0;
  }

  @media (max-width: 720px) {
    .help-layout {
      grid-template-columns: 1fr;
    }

    nav {
      flex-flow: row wrap;
    }

    nav button {
      border-color: #3c3c3c;
    }

    dl div {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
  }
</style>
