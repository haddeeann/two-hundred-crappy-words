<script>
  import { open } from "@tauri-apps/plugin-dialog";
  import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
  import { join } from "@tauri-apps/api/path";

  let folderPath = $state("");
  let entries = $state([]);
  let content = $state("");
  let activeFile = $state("");

  async function openFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    folderPath = selected;
    activeFile = "";
    content = "";
    entries = await readDir(selected);
  }

  async function openFile(entry) {
    if (!entry.isFile) return;
    const path = await join(folderPath, entry.name);
    content = await readTextFile(path);
    activeFile = entry.name;
  }
</script>

<div class="app">
  <aside class="sidebar">
    <h1 class="app-title">200 Crappy Words</h1>

    <button class="open-btn" onclick={openFolder}>Open Folder</button>

    <nav class="files">
      {#if entries.length === 0}
        <p class="placeholder">No files yet</p>
      {:else}
        <ul>
          {#each entries as entry (entry.name)}
            <li>
              <button
                class="file-item"
                class:active={entry.name === activeFile}
                onclick={() => openFile(entry)}
              >
                {entry.isDirectory ? "📁" : "📄"}
                {entry.name}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </nav>
  </aside>

  <div class="divider"></div>

  <main class="editor">
    <textarea
      class="editor-input"
      placeholder="Start writing your 200 crappy words..."
      bind:value={content}
    ></textarea>
  </main>
</div>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
  }

  :global(body) {
    background-color: #1e1e1e;
    color: #d4d4d4;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  }

  .app {
    display: flex;
    height: 100vh;
    width: 100vw;
  }

  .sidebar {
    width: 250px;
    flex: 0 0 250px;
    box-sizing: border-box;
    padding: 1rem;
    background-color: #252526;
    overflow-y: auto;
  }

  .app-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1rem;
    color: #ffffff;
  }

  .open-btn {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem;
    margin-bottom: 1rem;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background-color: #333333;
    color: #d4d4d4;
    font-family: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .open-btn:hover {
    background-color: #3c3c3c;
  }

  .files .placeholder {
    font-size: 0.85rem;
    color: #808080;
    margin: 0;
  }

  .files ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .file-item {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.5rem;
    border: none;
    border-radius: 4px;
    background: none;
    color: #d4d4d4;
    font-family: inherit;
    font-size: 0.85rem;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .file-item:hover {
    background-color: #2a2d2e;
  }

  .file-item.active {
    background-color: #37373d;
  }

  .divider {
    flex: 0 0 1px;
    background-color: #3c3c3c;
  }

  .editor {
    flex: 1 1 auto;
    display: flex;
    min-width: 0;
  }

  .editor-input {
    flex: 1 1 auto;
    box-sizing: border-box;
    padding: 1.5rem;
    border: none;
    outline: none;
    resize: none;
    background-color: #1e1e1e;
    color: #d4d4d4;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.6;
  }

  .editor-input::placeholder {
    color: #6a6a6a;
  }
</style>
