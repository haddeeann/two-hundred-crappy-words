<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { message, open } from "@tauri-apps/plugin-dialog";
  import {
    readDir,
    readTextFile,
    writeTextFile,
  } from "@tauri-apps/plugin-fs";
  import { join } from "@tauri-apps/api/path";
  import { load } from "@tauri-apps/plugin-store";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    createSaveState,
    createRecoveredSaveState,
    hasUnsavedChanges,
    markEdited,
    saveFailed,
    saveSucceeded,
    startSave,
  } from "$lib/editor/save-state";
  import {
    AutosaveController,
    type AutosaveRequest,
  } from "$lib/editor/autosave";
  import {
    resolvePendingChanges,
    type SaveFailureDecision,
  } from "$lib/editor/navigation-guard";
  import {
    assessRecovery,
    createRecoveryRecord,
    formatRecoveryPreview,
    RECOVERY_STORE_FILE,
    RecoveryRepository,
    type RecoveryRecord,
  } from "$lib/editor/recovery";
  import {
    findTreeEntry,
    reconcileTreeEntries,
    updateTreeEntry,
    validateFileName,
    type FileTreeEntry,
  } from "$lib/editor/file-tree";

  const STORE_FILE = "settings.json";
  const LAST_FOLDER_KEY = "lastFolder";
  const AUTOSAVE_DELAY_MS = 750;
  const RECOVERY_DELAY_MS = 100;

  let folderPath = $state("");
  let entries = $state<FileTreeEntry[]>([]);
  let selectedDirectoryPath = $state("");
  let content = $state("");
  let activeFile = $state("");
  let activeFilePath = $state("");
  let persistedContent = $state("");
  let saveState = $state(createSaveState());
  let error = $state("");
  let creatingFile = $state(false);
  let newFileName = $state("");
  let navigationPromise: Promise<void> | null = null;

  const dirty = $derived(
    activeFilePath !== "" && hasUnsavedChanges(saveState),
  );
  const saveStatus = $derived.by(() => {
    if (!activeFilePath) return "";
    if (saveState.phase === "saving") return "Saving…";
    if (saveState.phase === "error") return "Save failed";
    if (dirty) return "Unsaved";
    return "Saved";
  });
  const selectedDirectoryName = $derived.by(() => {
    if (!selectedDirectoryPath || selectedDirectoryPath === folderPath) {
      return "Project root";
    }
    return findTreeEntry(entries, selectedDirectoryPath)?.name ?? "Project root";
  });

  const autosave = new AutosaveController({
    delayMs: AUTOSAVE_DELAY_MS,
    save: ({ path, content }: AutosaveRequest) =>
      writeTextFile(path, content),
    onStart: (request) => {
      if (activeFilePath !== request.path) return;
      error = "";
      saveState = startSave(saveState, request.revision);
    },
    onSuccess: (request) => {
      if (activeFilePath === request.path) {
        persistedContent = request.content;
        saveState = saveSucceeded(saveState, request.revision);
      }
      void clearRecoveryAfterSave(request.path, request.revision);
    },
    onError: (request, cause) => {
      const message = `Could not save: ${formatError(cause)}`;
      if (activeFilePath === request.path) {
        saveState = saveFailed(saveState, request.revision, message);
      }
      error = message;
    },
  });

  let recoveryRepositoryPromise: Promise<RecoveryRepository> | null = null;
  const recoveryWriter = new AutosaveController<RecoveryRecord>({
    delayMs: RECOVERY_DELAY_MS,
    save: async (record) => {
      await (await getRecoveryRepository()).put(record);
    },
    onError: (_record, cause) => {
      error = `Could not update the recovery copy: ${formatError(cause)}`;
    },
  });

  onDestroy(() => {
    autosave.dispose();
    recoveryWriter.dispose();
  });

  onMount(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let closing = false;

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (closing) return;
        closing = true;

        try {
          if (navigationPromise) await navigationPromise;
          if (await prepareToLeave()) {
            await getCurrentWindow().destroy();
            return;
          }
        } catch (cause) {
          error = `Could not close safely: ${formatError(cause)}`;
        }

        if (closing) {
          closing = false;
        }
      })
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  });

  function formatError(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }

  async function minimizeWindow(): Promise<void> {
    try {
      await getCurrentWindow().minimize();
    } catch (cause) {
      error = `Could not minimize the window: ${formatError(cause)}`;
    }
  }

  async function closeWindow(): Promise<void> {
    try {
      // This emits the same close request handled above, preserving the
      // pending-save and failure-decision flow.
      await getCurrentWindow().close();
    } catch (cause) {
      error = `Could not close the window: ${formatError(cause)}`;
    }
  }

  function getRecoveryRepository(): Promise<RecoveryRepository> {
    recoveryRepositoryPromise ??= load(RECOVERY_STORE_FILE, {
      autoSave: false,
      defaults: {},
    }).then((store) => new RecoveryRepository(store));
    return recoveryRepositoryPromise;
  }

  async function clearRecoveryAfterSave(
    path: string,
    revision: number,
  ): Promise<void> {
    try {
      recoveryWriter.cancelPendingThrough(path, revision);
      await recoveryWriter.flush();
      await (await getRecoveryRepository()).remove(path, revision);
    } catch (cause) {
      // The source file is already safe. A leftover recovery record is cleaned
      // automatically if it exactly matches the file when next opened.
      error = `The file was saved, but its recovery copy could not be cleared: ${formatError(cause)}`;
    }
  }

  async function recoverContent(
    path: string,
    fileContent: string,
  ): Promise<{ content: string; revision: number } | null> {
    const repository = await getRecoveryRepository();
    const assessment = assessRecovery(await repository.get(path), fileContent);
    if (assessment.kind === "none") {
      return { content: fileContent, revision: 0 };
    }
    if (assessment.kind === "identical") {
      await repository.remove(path, assessment.record.revision);
      return { content: fileContent, revision: 0 };
    }

    const externalChangeWarning = assessment.fileChangedSinceRecoveryBegan
      ? " The file on disk also changed after this recovery draft began."
      : "";
    const result = await message(
      `A recovery draft from ${new Date(assessment.record.updatedAt).toLocaleString()} differs from this file.${externalChangeWarning}\n\n${formatRecoveryPreview(fileContent, assessment.record.content)}`,
      {
        title: "Recovery draft found",
        kind: "warning",
        buttons: {
          yes: "Recover draft",
          no: "Keep file",
          cancel: "Cancel",
        },
      },
    );

    if (result === "Recover draft") {
      return {
        content: assessment.record.content,
        revision: assessment.record.revision,
      };
    }
    if (result === "Keep file") {
      await repository.remove(path, assessment.record.revision);
      return { content: fileContent, revision: 0 };
    }
    return null;
  }

  function currentSaveRequest(): AutosaveRequest | null {
    if (!activeFilePath || !dirty) return null;
    return {
      path: activeFilePath,
      content,
      revision: saveState.currentRevision,
    };
  }

  async function chooseAfterSaveFailure(): Promise<SaveFailureDecision> {
    const result = await message(
      "Your latest changes could not be saved. You can retry, discard those changes, or keep the document open.",
      {
        title: "200 Crappy Words",
        kind: "warning",
        buttons: {
          yes: "Retry",
          no: "Discard changes",
          cancel: "Keep writing",
        },
      },
    );

    if (result === "Retry") return "retry";
    if (result === "Discard changes") return "discard";
    return "cancel";
  }

  function prepareToLeave(): Promise<boolean> {
    return resolvePendingChanges({
      hasUnsavedChanges: () => dirty,
      save: saveFile,
      chooseAfterFailure: chooseAfterSaveFailure,
    });
  }

  async function navigate(action: () => Promise<void>): Promise<void> {
    if (navigationPromise) return navigationPromise;

    navigationPromise = (async () => {
      if (await prepareToLeave()) await action();
    })().finally(() => {
      navigationPromise = null;
    });

    return navigationPromise;
  }

  // Read a directory into entry objects, precomputing each full path.
  // Folders start collapsed with unloaded (null) children.
  async function readEntries(
    dirPath: string,
    previous: readonly FileTreeEntry[] = [],
  ): Promise<FileTreeEntry[]> {
    const dirEntries = await readDir(dirPath);
    const discovered = await Promise.all(
      dirEntries.map(async (entry) => ({
        ...entry,
        path: await join(dirPath, entry.name),
        expanded: false,
        children: null,
      })),
    );
    return reconcileTreeEntries(discovered, previous);
  }

  async function refreshDirectory(path: string) {
    if (path === folderPath) {
      entries = await readEntries(folderPath, entries);
      return;
    }

    const directory = findTreeEntry(entries, path);
    if (!directory?.isDirectory) return;
    const children = await readEntries(path, directory.children ?? []);
    entries = updateTreeEntry(entries, path, (entry) => ({
      ...entry,
      expanded: true,
      children,
    }));
  }

  async function toggleFolder(entry: FileTreeEntry) {
    error = "";
    selectedDirectoryPath = entry.path;
    try {
      if (!entry.expanded && entry.children === null) {
        const children = await readEntries(entry.path);
        entries = updateTreeEntry(entries, entry.path, (current) => ({
          ...current,
          expanded: true,
          children,
        }));
        return;
      }
      entries = updateTreeEntry(entries, entry.path, (current) => ({
        ...current,
        expanded: !current.expanded,
      }));
    } catch (e) {
      error = `Could not read ${entry.name}: ${e}`;
    }
  }

  // Load a folder into the sidebar. Throws if the path can't be read,
  // leaving existing state untouched (entries are read before committing).
  async function loadFolder(path: string) {
    const newEntries = await readEntries(path);
    folderPath = path;
    selectedDirectoryPath = path;
    entries = newEntries;
    activeFile = "";
    activeFilePath = "";
    content = "";
    persistedContent = "";
    saveState = createSaveState();
    creatingFile = false;
    newFileName = "";
  }

  async function openFolder() {
    await navigate(async () => {
      error = "";
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;

      try {
        await loadFolder(selected);
        // Remember this folder so it reopens on next launch.
        const store = await load(STORE_FILE);
        await store.set(LAST_FOLDER_KEY, selected);
        await store.save();
      } catch (e) {
        error = `Could not read folder: ${e}`;
      }
    });
  }

  // On startup, reopen the last folder if it's still accessible.
  onMount(async () => {
    try {
      const store = await load(STORE_FILE);
      const last = await store.get<string>(LAST_FOLDER_KEY);
      if (last) await loadFolder(last);
    } catch {
      // No stored folder, or it can't be read anymore — show empty state.
    }
  });

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
    if (!folderPath) {
      cancelNewFile();
      return;
    }
    const inputError = validateFileName(trimmed);
    if (inputError) {
      error = inputError;
      return;
    }
    // Default to a .txt extension if the user didn't include one.
    const name = /\.[^./\\]+$/.test(trimmed) ? trimmed : `${trimmed}.txt`;
    const nameError = validateFileName(name);
    if (nameError) {
      error = nameError;
      return;
    }
    try {
      const targetDirectory = selectedDirectoryPath || folderPath;
      const path = await join(targetDirectory, name);
      const knownChildren =
        targetDirectory === folderPath
          ? entries
          : (findTreeEntry(entries, targetDirectory)?.children ?? []);
      if (knownChildren.some((entry) => entry.name === name)) {
        error = `"${name}" already exists in ${selectedDirectoryName}.`;
        return;
      }
      // createNew makes the final check atomic if the directory changed since
      // it was read, so an existing file is never truncated.
      await writeTextFile(path, "", { createNew: true });
      creatingFile = false;
      newFileName = "";
      await refreshDirectory(targetDirectory);
      // Select and open the newly created file.
      const created = findTreeEntry(entries, path);
      if (created) await openFile(created);
    } catch (e) {
      error = `Could not create file: ${e}`;
    }
  }

  function newFileKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmNewFile();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelNewFile();
    }
  }

  async function openFile(entry: FileTreeEntry) {
    if (entry.path === activeFilePath) return;

    await navigate(async () => {
      error = "";
      // Don't rely on entry.isFile (not always reliable across platforms) —
      // just try to read it. Directories will throw and surface as an error.
      try {
        const fileContent = await readTextFile(entry.path);
        const recovered = await recoverContent(entry.path, fileContent);
        if (!recovered) return;

        persistedContent = fileContent;
        content = recovered.content;
        saveState = recovered.revision
          ? createRecoveredSaveState(recovered.revision)
          : createSaveState();
        activeFile = entry.name;
        activeFilePath = entry.path;

        if (recovered.revision) {
          const request = currentSaveRequest();
          if (request) autosave.schedule(request);
        }
      } catch (e) {
        error = `Could not open ${entry.name}: ${e}`;
      }
    });
  }

  async function saveFile() {
    const request = currentSaveRequest();
    if (!request) return;
    autosave.schedule(request);
    await autosave.flush();
  }

  function handleContentInput(event: Event) {
    content = (event.currentTarget as HTMLTextAreaElement).value;
    saveState = markEdited(saveState);
    if (activeFilePath) {
      recoveryWriter.schedule(
        createRecoveryRecord({
          path: activeFilePath,
          content,
          persistedContent,
          revision: saveState.currentRevision,
        }),
      );
    }
    const request = currentSaveRequest();
    if (request) autosave.schedule(request);
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      saveFile();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet tree(items: FileTreeEntry[], depth: number)}
  <ul class="tree">
    {#each items as entry (entry.path)}
      <li>
        {#if entry.isDirectory}
          <button
            class="file-item"
            class:selected={entry.path === selectedDirectoryPath}
            style="padding-left: {0.5 + depth * 0.75}rem"
            onclick={() => toggleFolder(entry)}
            aria-expanded={entry.expanded}
            title={`Select and ${entry.expanded ? "collapse" : "expand"} ${entry.name}`}
          >
            <span class="arrow">{entry.expanded ? "▼" : "▶"}</span>
            {entry.name}
          </button>
          {#if entry.expanded && entry.children}
            {@render tree(entry.children, depth + 1)}
          {/if}
        {:else}
          <button
            class="file-item"
            class:active={entry.path === activeFilePath}
            style="padding-left: {0.5 + depth * 0.75}rem"
            onclick={() => openFile(entry)}
          >
            📄 {entry.name}
            {#if dirty && entry.path === activeFilePath}
              <span class="dirty-dot">●</span>
            {/if}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="titlebar" data-tauri-drag-region>
  <div class="window-controls">
    <button
      class="window-control close-control"
      aria-label="Close window"
      title="Close"
      onclick={closeWindow}
    >×</button>
    <button
      class="window-control minimize-control"
      aria-label="Minimize window"
      title="Minimize"
      onclick={minimizeWindow}
    >−</button>
  </div>
  <span class="window-title" data-tauri-drag-region>200 Crappy Words</span>
</div>

<div class="app">
  <aside class="sidebar">
    <h1 class="app-title">200 Crappy Words</h1>

    <button class="open-btn" onclick={openFolder}>Open Folder</button>
    <button class="open-btn" onclick={startNewFile} disabled={!folderPath}>
      New File in {selectedDirectoryName}
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
      {#if folderPath}
        <button
          class="file-item root-item"
          class:selected={selectedDirectoryPath === folderPath}
          onclick={() => (selectedDirectoryPath = folderPath)}
          title="Select the project root for new files"
        >
          ▾ Project root
        </button>
      {/if}
      {#if !folderPath}
        <p class="placeholder">Open a folder to begin</p>
      {:else if entries.length === 0}
        <p class="placeholder">No files yet</p>
      {:else}
        {@render tree(entries, 0)}
      {/if}
    </nav>
  </aside>

  <div class="divider"></div>

  <main class="editor">
    <div class="editor-header">
      <span>
        {activeFile ? activeFile : "No file open"}
        {#if dirty}<span class="dirty-dot">●</span>{/if}
      </span>
      {#if activeFile}
        <span
          class="save-status"
          class:save-error={saveState.phase === "error"}
          aria-live="polite"
        >{saveStatus}</span>
      {/if}
    </div>
    <textarea
      class="editor-input"
      placeholder="Start writing your 200 crappy words..."
      value={content}
      oninput={handleContentInput}
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

  .titlebar {
    position: relative;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #181818;
    color: #cccccc;
    font-size: 0.8rem;
    font-weight: 600;
    border-bottom: 1px solid #3c3c3c;
    user-select: none;
    -webkit-user-select: none;
  }

  .window-title {
    pointer-events: none;
  }

  .window-controls {
    position: absolute;
    left: 10px;
    top: 0;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .window-control {
    width: 13px;
    height: 13px;
    padding: 0;
    border: none;
    border-radius: 50%;
    color: transparent;
    font-family: inherit;
    font-size: 11px;
    line-height: 13px;
    cursor: default;
  }

  .window-control:hover,
  .window-control:focus-visible {
    color: rgba(0, 0, 0, 0.72);
  }

  .window-control:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .close-control {
    background-color: #ff5f57;
  }

  .minimize-control {
    background-color: #febc2e;
  }

  .app {
    display: flex;
    height: calc(100vh - 32px);
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

  .tree {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .arrow {
    display: inline-block;
    width: 1rem;
    font-size: 0.7rem;
    color: #808080;
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

  .file-item:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: -2px;
  }

  .file-item.active {
    background-color: #37373d;
  }

  .file-item.selected:not(.active) {
    background-color: #2f3336;
    color: #ffffff;
  }

  .root-item {
    margin-bottom: 0.2rem;
    font-weight: 600;
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .save-status {
    flex: 0 0 auto;
  }

  .save-status.save-error {
    color: #f48771;
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
