<script>
  import { open } from "@tauri-apps/plugin-dialog";
  import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
  import { join } from "@tauri-apps/api/path";

  let folderPath = $state("");
  let entries = $state([]);
  let content = $state("");
  let activeFile = $state("");
  let activeFilePath = $state("");
  let savedContent = $state("");
  let error = $state("");
  let creatingFile = $state(false);
  let newFileName = $state("");

  const dirty = $derived(activeFilePath !== "" && content !== savedContent);

  // Read the open folder and precompute each entry's full path.
  async function refreshEntries() {
    const dirEntries = await readDir(folderPath);
    entries = await Promise.all(
      dirEntries.map(async (entry) => ({
        ...entry,
        path: await join(folderPath, entry.name),
      })),
    );
  }

  async function openFolder() {
    error = "";
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    folderPath = selected;
    activeFile = "";
    activeFilePath = "";
    content = "";
    savedContent = "";
    creatingFile = false;
    newFileName = "";
    try {
      await refreshEntries();
    } catch (e) {
      error = `Could not read folder: ${e}`;
    }
  }

  function startNewFile() {
    // Only meaningful once a folder is open.
    if (!folderPath) return;
    error = "";
    newFileName = "";
    creatingFile = true;
  }

  function cancelNewFile() {
    creatingFile = false;
    newFileName = "";
  }

  async function confirmNewFile() {
    const trimmed = newFileName.trim();
    if (!folderPath || !trimmed) {
      cancelNewFile();
      return;
    }
    // Default to a .txt extension if the user didn't include one.
    const name = /\.[^./\\]+$/.test(trimmed) ? trimmed : `${trimmed}.txt`;
    // Don't clobber an existing file with empty content.
    if (entries.some((e) => e.name === name)) {
      error = `"${name}" already exists`;
      return;
    }
    try {
      const path = await join(folderPath, name);
      await writeTextFile(path, "");
      creatingFile = false;
      newFileName = "";
      await refreshEntries();
      // Select and open the newly created file.
      const created = entries.find((e) => e.path === path);
      if (created) await openFile(created);
    } catch (e) {
      error = `Could not create file: ${e}`;
    }
  }

  function newFileKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmNewFile();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelNewFile();
    }
  }

  async function openFile(entry) {
    error = "";
    // Don't rely on entry.isFile (not always reliable across platforms) —
    // just try to read it. Directories will throw and surface as an error.
    try {
      const text = await readTextFile(entry.path);
      content = text;
      savedContent = text;
      activeFile = entry.name;
      activeFilePath = entry.path;
    } catch (e) {
      error = `Could not open ${entry.name}: ${e}`;
    }
  }

  async function saveFile() {
    if (!activeFilePath) return;
    error = "";
    try {
      await writeTextFile(activeFilePath, content);
      savedContent = content;
    } catch (e) {
      error = `Could not save: ${e}`;
    }
  }

  function handleKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      saveFile();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app">
  <aside class="sidebar">
    <h1 class="app-title">200 Crappy Words</h1>

    <button class="open-btn" onclick={openFolder}>Open Folder</button>
    <button class="open-btn" onclick={startNewFile} disabled={!folderPath}>
      New File
    </button>

    {#if creatingFile}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="new-file-input"
        placeholder="filename.txt"
        bind:value={newFileName}
        onkeydown={newFileKeydown}
        onblur={confirmNewFile}
        autofocus
      />
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}

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
                {#if dirty && entry.name === activeFile}
                  <span class="dirty-dot">●</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </nav>
  </aside>

  <div class="divider"></div>

  <main class="editor">
    <div class="editor-header">
      {activeFile ? activeFile : "No file open"}
      {#if dirty}<span class="dirty-dot">●</span>{/if}
    </div>
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
    margin-bottom: 0.5rem;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background-color: #333333;
    color: #d4d4d4;
    font-family: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .open-btn:hover:not(:disabled) {
    background-color: #3c3c3c;
  }

  .open-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .new-file-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    border: 1px solid #007acc;
    border-radius: 4px;
    background-color: #1e1e1e;
    color: #d4d4d4;
    font-family: inherit;
    font-size: 0.85rem;
    outline: none;
  }

  .files .placeholder {
    font-size: 0.85rem;
    color: #808080;
    margin: 0;
  }

  .error {
    font-size: 0.8rem;
    color: #f48771;
    margin: 0 0 1rem;
    word-break: break-word;
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

  .dirty-dot {
    color: #d4d4d4;
    font-size: 0.7rem;
    vertical-align: middle;
  }

  .divider {
    flex: 0 0 1px;
    background-color: #3c3c3c;
  }

  .editor {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .editor-header {
    padding: 0.5rem 1.5rem;
    font-size: 0.8rem;
    color: #808080;
    border-bottom: 1px solid #3c3c3c;
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
