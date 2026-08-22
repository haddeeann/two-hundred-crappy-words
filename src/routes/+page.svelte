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
  import {
    ExternalFileChangeError,
    guardedWriteText,
    SourceFileUnavailableError,
  } from "$lib/editor/guarded-write";
  import { folderDialogOptions } from "$lib/editor/folder-access";
  import {
    applyDailyPracticeEdit,
    beginDailyPractice,
  } from "$lib/practice/word-count";
  import {
    DEFAULT_DAILY_TARGET,
    presentPractice,
  } from "$lib/practice/progress";
  import {
    assessGoalCompletion,
    DailyGoalRepository,
    MAX_DAILY_TARGET,
    MIN_DAILY_TARGET,
    parseDailyTarget,
  } from "$lib/practice/daily-goal";
  import {
    createDailyProgressRecord,
    DAILY_PROGRESS_STORE_FILE,
    DailyProgressRepository,
    localDateKey,
    resolveDailyProgress,
    type DailyProgressRecord,
    type DailyProgressRecords,
  } from "$lib/practice/daily-ledger";
  import PracticeHistory from "$lib/practice/PracticeHistory.svelte";
  import { correctDailyProgressRecord } from "$lib/practice/correction";
  import {
    inspectWorldProjectFolder,
    type WorldProjectFolderInspection,
  } from "$lib/project/folder-project";

  interface SaveFailure {
    path: string;
    revision: number;
    kind: "external-change" | "source-unavailable" | "write-failure";
    diskContent?: string;
  }

  const STORE_FILE = "settings.json";
  const LAST_FOLDER_KEY = "lastFolder";
  const AUTOSAVE_DELAY_MS = 750;
  const RECOVERY_DELAY_MS = 100;
  const DAILY_PROGRESS_DELAY_MS = 100;

  let folderPath = $state("");
  let projectStorageKey = $state("");
  let projectInspection = $state<WorldProjectFolderInspection>({
    kind: "ordinary",
    storageKey: "",
  });
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
  let forcedSave: { path: string; revision: number } | null = null;
  let lastSaveFailure: SaveFailure | null = null;
  let practiceState = $state(beginDailyPractice(""));
  let activeDailyDateKey = $state(localDateKey());
  let activeDailyRevision = 0;
  let activeCompletedAt: string | null = null;
  let activeCompletedTarget: number | null = null;
  let dailyRecordsByDate = $state<DailyProgressRecords>({});
  let dailyTarget = $state(DEFAULT_DAILY_TARGET);
  let editingDailyTarget = $state(false);
  let dailyTargetInput = $state("");
  let completionMessage = $state("");
  let dailyProgressError = $state("");
  let correctingDailyProgress = $state(false);
  let lastDailyProgressFailure: {
    path: string;
    revision: number;
  } | null = null;
  const persistedContentByPath = new Map<string, string>();
  const dailyProgressWriters = new Map<
    string,
    AutosaveController<DailyProgressWrite>
  >();

  interface DailyProgressWrite {
    path: string;
    revision: number;
    record: DailyProgressRecord;
  }

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
  const projectRootName = $derived(
    projectInspection.kind === "world-project"
      ? projectInspection.manifest.name
      : "Project root",
  );
  const selectedDirectoryName = $derived.by(() => {
    if (!selectedDirectoryPath || selectedDirectoryPath === folderPath) {
      return projectRootName;
    }
    return (
      findTreeEntry(entries, selectedDirectoryPath)?.name ?? projectRootName
    );
  });
  const practicePresentation = $derived(
    presentPractice(practiceState, dailyTarget),
  );

  const autosave = new AutosaveController({
    delayMs: AUTOSAVE_DELAY_MS,
    save: async (request: AutosaveRequest) => {
      const expectedContent = persistedContentByPath.get(request.path);
      if (expectedContent === undefined) {
        throw new SourceFileUnavailableError("No known source revision.");
      }
      const force =
        forcedSave?.path === request.path &&
        forcedSave.revision === request.revision;
      await guardedWriteText(
        {
          path: request.path,
          content: request.content,
          expectedContent,
          force,
        },
        {
          read: readTextFile,
          write: (path, nextContent) =>
            writeTextFile(path, nextContent, { create: force }),
        },
      );
    },
    onStart: (request) => {
      if (activeFilePath !== request.path) return;
      error = "";
      saveState = startSave(saveState, request.revision);
    },
    onSuccess: (request) => {
      persistedContentByPath.set(request.path, request.content);
      if (
        forcedSave?.path === request.path &&
        forcedSave.revision === request.revision
      ) {
        forcedSave = null;
      }
      if (
        lastSaveFailure?.path === request.path &&
        lastSaveFailure.revision <= request.revision
      ) {
        lastSaveFailure = null;
      }
      if (activeFilePath === request.path) {
        persistedContent = request.content;
        saveState = saveSucceeded(saveState, request.revision);
      }
      void clearRecoveryAfterSave(request.path, request.revision);
    },
    onError: (request, cause) => {
      const failure: SaveFailure = {
        path: request.path,
        revision: request.revision,
        kind:
          cause instanceof ExternalFileChangeError
            ? "external-change"
            : cause instanceof SourceFileUnavailableError
              ? "source-unavailable"
              : "write-failure",
        diskContent:
          cause instanceof ExternalFileChangeError
            ? cause.diskContent
            : undefined,
      };
      lastSaveFailure = failure;
      const message =
        failure.kind === "external-change"
          ? "This file changed outside the app. Your writing is still open and has not overwritten it."
          : failure.kind === "source-unavailable"
            ? "This file was moved, deleted, or became unreadable. Your writing is still open and has not recreated it."
            : `Could not save: ${formatError(cause)}`;
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

  let dailyRepositoriesPromise: Promise<{
    progress: DailyProgressRepository;
    goal: DailyGoalRepository;
  }> | null = null;

  function getDailyRepositories() {
    dailyRepositoriesPromise ??= load(DAILY_PROGRESS_STORE_FILE, {
      autoSave: false,
      defaults: {},
    }).then((store) => ({
      progress: new DailyProgressRepository(store),
      goal: new DailyGoalRepository(store),
    }));
    return dailyRepositoriesPromise;
  }

  function getDailyProgressRepository(): Promise<DailyProgressRepository> {
    return getDailyRepositories().then(({ progress }) => progress);
  }

  function getDailyGoalRepository(): Promise<DailyGoalRepository> {
    return getDailyRepositories().then(({ goal }) => goal);
  }

  function dailyProgressWriter(record: DailyProgressRecord) {
    const entryPath = `${record.projectPath}\u0000${record.dateKey}`;
    let writer = dailyProgressWriters.get(entryPath);
    if (writer) return writer;

    writer = new AutosaveController<DailyProgressWrite>({
      delayMs: DAILY_PROGRESS_DELAY_MS,
      save: ({ record: pendingRecord }) =>
        getDailyProgressRepository().then((repository) =>
          repository.put(pendingRecord),
        ),
      onSuccess: (request) => {
        if (
          lastDailyProgressFailure?.path === request.path &&
          lastDailyProgressFailure.revision <= request.revision
        ) {
          lastDailyProgressFailure = null;
          dailyProgressError = "";
        }
      },
      onError: (request, cause) => {
        lastDailyProgressFailure = {
          path: request.path,
          revision: request.revision,
        };
        dailyProgressError = `Your writing is safe, but today's progress could not be stored: ${formatError(cause)}`;
      },
    });
    dailyProgressWriters.set(entryPath, writer);
    return writer;
  }

  async function flushDailyProgress(): Promise<void> {
    await Promise.all(
      Array.from(dailyProgressWriters.values(), (writer) => writer.flush()),
    );
  }

  onDestroy(() => {
    autosave.dispose();
    recoveryWriter.dispose();
    for (const writer of dailyProgressWriters.values()) writer.dispose();
  });

  onMount(() => {
    const timer = setInterval(() => refreshDailyDate(), 30_000);
    return () => clearInterval(timer);
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
    const failure = lastSaveFailure;
    const isCurrentFailure =
      failure?.path === activeFilePath &&
      failure.revision === saveState.currentRevision;
    const prompt =
      isCurrentFailure && failure.kind === "external-change"
        ? `This file changed outside the app. Your writing has not overwritten it. Choose Overwrite file only if the in-app version should replace the disk version.\n\n${formatRecoveryPreview(failure.diskContent ?? "", content)}`
        : isCurrentFailure && failure.kind === "source-unavailable"
          ? "The file was moved, deleted, or became unreadable. Choose Write current text only if the app should try to create or replace the path."
          : "Your latest changes could not be saved. You can retry, discard those changes, or keep the document open.";
    const retryLabel =
      isCurrentFailure && failure.kind === "external-change"
        ? "Overwrite file"
        : isCurrentFailure && failure.kind === "source-unavailable"
          ? "Write current text"
          : "Retry";
    const result = await message(prompt, {
      title: "200 Crappy Words",
      kind: "warning",
      buttons: {
        yes: retryLabel,
        no: "Discard my changes",
        cancel: "Keep writing",
      },
    });

    if (result === retryLabel) {
      if (
        isCurrentFailure &&
        (failure.kind === "external-change" ||
          failure.kind === "source-unavailable")
      ) {
        forcedSave = {
          path: activeFilePath,
          revision: saveState.currentRevision,
        };
      }
      return "retry";
    }
    if (result === "Discard my changes") return "discard";
    return "cancel";
  }

  async function discardActiveChanges(): Promise<void> {
    const path = activeFilePath;
    const revision = saveState.currentRevision;
    if (!path) return;

    autosave.cancelPending();
    recoveryWriter.cancelPendingThrough(path, revision);
    await recoveryWriter.flush();
    await (await getRecoveryRepository()).remove(path, revision);
    persistedContentByPath.delete(path);
    forcedSave = null;
    lastSaveFailure = null;
    activeFile = "";
    activeFilePath = "";
    content = "";
    persistedContent = "";
    practiceState = beginDailyPractice("", practiceState.dailyWords);
    saveState = createSaveState();
  }

  async function prepareToLeave(): Promise<boolean> {
    const canLeave = await resolvePendingChanges({
      hasUnsavedChanges: () => dirty,
      save: saveFile,
      chooseAfterFailure: chooseAfterSaveFailure,
      discard: discardActiveChanges,
    });
    if (canLeave) await flushDailyProgress();
    return canLeave;
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
    const inspectedProject = await inspectWorldProjectFolder({
      folderPath: path,
      entries: newEntries,
      readText: readTextFile,
    });
    const storageKey = inspectedProject.storageKey;
    let projectRecords: DailyProgressRecords = {};
    let projectTarget = DEFAULT_DAILY_TARGET;
    let progressLoadError = "";
    try {
      const repositories = await getDailyRepositories();
      [projectRecords, projectTarget] = await Promise.all([
        repositories.progress.getProject(storageKey),
        repositories.goal.get(storageKey),
      ]);
    } catch (cause) {
      progressLoadError = `The folder opened, but its daily progress could not be loaded: ${formatError(cause)}`;
    }
    const dailyContext = resolveDailyProgress(projectRecords);

    folderPath = path;
    projectStorageKey = storageKey;
    projectInspection = inspectedProject;
    selectedDirectoryPath = path;
    entries = newEntries;
    activeFile = "";
    activeFilePath = "";
    content = "";
    persistedContent = "";
    dailyRecordsByDate = projectRecords;
    activeDailyDateKey = dailyContext.dateKey;
    activeDailyRevision = dailyContext.revision;
    activeCompletedAt = dailyContext.completedAt;
    activeCompletedTarget = dailyContext.completedTarget;
    practiceState = beginDailyPractice("", dailyContext.creditedWords);
    dailyTarget = projectTarget;
    editingDailyTarget = false;
    dailyTargetInput = "";
    completionMessage = "";
    lastDailyProgressFailure = null;
    dailyProgressError = progressLoadError;
    error =
      inspectedProject.kind === "manifest-problem"
        ? inspectedProject.message
        : "";
    persistedContentByPath.clear();
    forcedSave = null;
    lastSaveFailure = null;
    saveState = createSaveState();
    creatingFile = false;
    newFileName = "";
  }

  async function openFolder() {
    await navigate(async () => {
      error = "";
      const selected = await open(folderDialogOptions);
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
    } catch (cause) {
      error = `The last folder could not be reopened. Choose Open Folder to select it again: ${formatError(cause)}`;
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
        persistedContentByPath.set(entry.path, fileContent);
        content = recovered.content;
        refreshDailyDate(recovered.content);
        practiceState = beginDailyPractice(
          recovered.content,
          practiceState.dailyWords,
        );
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

  function refreshDailyDate(documentText = content, now = new Date()) {
    if (!folderPath) return;
    const dailyContext = resolveDailyProgress(dailyRecordsByDate, now);
    if (dailyContext.dateKey === activeDailyDateKey) return;

    activeDailyDateKey = dailyContext.dateKey;
    activeDailyRevision = dailyContext.revision;
    activeCompletedAt = dailyContext.completedAt;
    activeCompletedTarget = dailyContext.completedTarget;
    practiceState = beginDailyPractice(documentText, dailyContext.creditedWords);
    completionMessage = "";
  }

  function scheduleDailyProgress(now = new Date()) {
    if (!folderPath) return;
    activeDailyRevision += 1;
    const record = createDailyProgressRecord({
      projectPath: projectStorageKey,
      dateKey: activeDailyDateKey,
      creditedWords: practiceState.dailyWords,
      revision: activeDailyRevision,
      completedAt: activeCompletedAt,
      completedTarget: activeCompletedTarget,
      target: dailyTarget,
      corrections: dailyRecordsByDate[activeDailyDateKey]?.corrections,
      now,
    });
    dailyRecordsByDate = {
      ...dailyRecordsByDate,
      [activeDailyDateKey]: record,
    };
    dailyProgressWriter(record).schedule({
      path: `${record.projectPath}\u0000${record.dateKey}`,
      revision: record.revision,
      record,
    });
  }

  function handleContentInput(event: Event) {
    const nextContent = (event.currentTarget as HTMLTextAreaElement).value;
    const now = new Date();
    refreshDailyDate(content, now);
    const previousDailyWords = practiceState.dailyWords;
    practiceState = applyDailyPracticeEdit(practiceState, nextContent);
    const completion = assessGoalCompletion({
      dailyWords: practiceState.dailyWords,
      target: dailyTarget,
      completedAt: activeCompletedAt,
      now,
    });
    const newlyCompleted = completion.completedAt !== activeCompletedAt;
    activeCompletedAt = completion.completedAt;
    if (completion.shouldAnnounce) {
      activeCompletedTarget = dailyTarget;
      completionMessage = "Daily goal reached. Nicely done.";
    }
    if (practiceState.dailyWords > previousDailyWords || newlyCompleted) {
      scheduleDailyProgress(now);
    }
    content = nextContent;
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

  function startDailyTargetEdit() {
    if (!folderPath) return;
    dailyProgressError = "";
    dailyTargetInput = String(dailyTarget);
    editingDailyTarget = true;
  }

  function cancelDailyTargetEdit() {
    editingDailyTarget = false;
    dailyTargetInput = "";
  }

  async function confirmDailyTargetEdit() {
    if (!editingDailyTarget || !folderPath || correctingDailyProgress) return;
    const nextTarget = parseDailyTarget(dailyTargetInput);
    if (nextTarget === null) {
      dailyProgressError = `Daily goal must be a whole number from ${MIN_DAILY_TARGET} to ${MAX_DAILY_TARGET}.`;
      return;
    }

    try {
      await (await getDailyGoalRepository()).set(
        projectStorageKey,
        nextTarget,
      );
      dailyTarget = nextTarget;
      editingDailyTarget = false;
      dailyTargetInput = "";
      dailyProgressError = "";
      completionMessage = "";

      const now = new Date();
      const completion = assessGoalCompletion({
        dailyWords: practiceState.dailyWords,
        target: dailyTarget,
        completedAt: activeCompletedAt,
        now,
      });
      if (completion.completedAt !== activeCompletedAt) {
        activeCompletedAt = completion.completedAt;
        activeCompletedTarget = dailyTarget;
        completionMessage = "Daily goal reached. Nicely done.";
        scheduleDailyProgress(now);
      } else if (practiceState.dailyWords > 0) {
        scheduleDailyProgress(now);
      }
    } catch (cause) {
      dailyProgressError = `The daily goal could not be stored: ${formatError(cause)}`;
    }
  }

  async function correctDailyProgress(
    dateKey: string,
    correctedWords: number,
  ): Promise<boolean> {
    const openFolderPath = folderPath;
    const projectPath = projectStorageKey;
    const existing = dailyRecordsByDate[dateKey];
    if (!projectPath || !existing || existing.projectPath !== projectPath) {
      dailyProgressError = "That writing day is no longer available to correct.";
      return false;
    }

    try {
      correctingDailyProgress = true;
      await flushDailyProgress();
      const corrected = correctDailyProgressRecord(existing, correctedWords);
      if (corrected !== existing) {
        await (await getDailyProgressRepository()).put(corrected);
      }
      if (
        folderPath !== openFolderPath ||
        projectStorageKey !== projectPath
      ) {
        return true;
      }

      dailyRecordsByDate = {
        ...dailyRecordsByDate,
        [dateKey]: corrected,
      };
      if (dateKey === activeDailyDateKey) {
        activeDailyRevision = corrected.revision;
        activeCompletedAt = corrected.completedAt ?? null;
        activeCompletedTarget = corrected.completedTarget ?? null;
        practiceState = beginDailyPractice(content, corrected.creditedWords);
        completionMessage = "";
      }
      dailyProgressError = "";
      return true;
    } catch (cause) {
      dailyProgressError = `The writing total could not be corrected: ${formatError(cause)}`;
      return false;
    } finally {
      correctingDailyProgress = false;
    }
  }

  function dailyTargetKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmDailyTargetEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelDailyTargetEdit();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void prepareToLeave();
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
            aria-pressed={entry.path === selectedDirectoryPath}
            title={`Select and ${entry.expanded ? "collapse" : "expand"} ${entry.name}`}
          >
            <span class="arrow" aria-hidden="true">
              {entry.expanded ? "▼" : "▶"}
            </span>
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
            aria-current={entry.path === activeFilePath ? "page" : undefined}
          >
            <span aria-hidden="true">📄</span> {entry.name}
            {#if dirty && entry.path === activeFilePath}
              <span class="dirty-dot" aria-hidden="true">●</span>
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
        aria-label="New file name"
        placeholder="filename.txt"
        bind:value={newFileName}
        onkeydown={newFileKeydown}
        onblur={confirmNewFile}
        autofocus
      />
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    {#if dailyProgressError}
      <p class="error" role="alert">{dailyProgressError}</p>
    {/if}

    <nav class="files" aria-label="Project files">
      {#if folderPath}
        <button
          class="file-item root-item"
          class:selected={selectedDirectoryPath === folderPath}
          onclick={() => (selectedDirectoryPath = folderPath)}
          aria-pressed={selectedDirectoryPath === folderPath}
          title="Select the project root for new files"
        >
          ▾ {projectRootName}
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

    {#if folderPath}
      <PracticeHistory
        records={dailyRecordsByDate}
        todayKey={activeDailyDateKey}
        onCorrect={correctDailyProgress}
      />
    {/if}
  </aside>

  <div class="divider"></div>

  <main class="editor">
    <div class="editor-header">
      <span>
        {activeFile ? activeFile : "No file open"}
        {#if dirty}<span class="dirty-dot" aria-hidden="true">●</span>{/if}
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
      aria-label="Document editor"
      disabled={!activeFilePath || correctingDailyProgress}
      value={content}
      oninput={handleContentInput}
    ></textarea>
    <div class="practice-bar" aria-label="Writing progress">
      <span class="document-count">
        {activeFile ? practicePresentation.documentLabel : "No document open"}
      </span>
      {#if completionMessage}
        <span class="completion-message" role="status" aria-live="polite">
          {completionMessage}
        </span>
      {/if}
      <div
        class="daily-progress"
        title="Today's progress is stored locally for this project"
      >
        <span>{practicePresentation.dailyLabel}</span>
        <progress
          class="daily-meter"
          max={dailyTarget}
          value={practicePresentation.progressValue}
          aria-label={practicePresentation.accessibleDailyLabel}
        ></progress>
        {#if editingDailyTarget}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="daily-target-input"
            type="number"
            min={MIN_DAILY_TARGET}
            max={MAX_DAILY_TARGET}
            aria-label="Daily word goal"
            value={dailyTargetInput}
            oninput={(event) =>
              (dailyTargetInput = (
                event.currentTarget as HTMLInputElement
              ).value)}
            onkeydown={dailyTargetKeydown}
            onblur={() => void confirmDailyTargetEdit()}
            disabled={correctingDailyProgress}
            autofocus
          />
        {:else}
          <button
            class="daily-target-button"
            onclick={startDailyTargetEdit}
            disabled={!folderPath || correctingDailyProgress}
            aria-label={`Change daily goal, currently ${dailyTarget} words`}
            title="Change daily goal"
          >Goal</button>
        {/if}
      </div>
    </div>
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
    gap: 0;
  }

  .window-control {
    position: relative;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: transparent;
    font-family: inherit;
    font-size: 11px;
    line-height: 24px;
    cursor: default;
  }

  .window-control::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
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
    margin-left: -6px;
  }

  .close-control::before {
    background-color: #ff5f57;
  }

  .minimize-control::before {
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

  .open-btn:focus-visible,
  .new-file-input:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
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
    color: #a0a0a0;
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
    color: #a0a0a0;
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
    color: #a0a0a0;
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
    color: #999999;
  }

  .editor-input:focus-visible {
    box-shadow: inset 0 0 0 2px #75beff;
  }

  .editor-input:disabled {
    cursor: default;
    opacity: 0.72;
  }

  .practice-bar {
    box-sizing: border-box;
    min-height: 40px;
    padding: 0.55rem 1.5rem;
    border-top: 1px solid #3c3c3c;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    color: #b8b8b8;
    font-size: 0.78rem;
  }

  .document-count {
    flex: 0 0 auto;
  }

  .completion-message {
    min-width: 0;
    color: #a7d7ad;
    text-align: center;
  }

  .daily-progress {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    color: #d4d4d4;
    white-space: nowrap;
  }

  .daily-meter {
    width: min(140px, 22vw);
    height: 6px;
    border: none;
    border-radius: 999px;
    overflow: hidden;
    background-color: #333333;
  }

  .daily-meter::-webkit-progress-bar {
    border-radius: 999px;
    background-color: #333333;
  }

  .daily-meter::-webkit-progress-value {
    border-radius: 999px;
    background-color: #4da3d9;
  }

  .daily-meter::-moz-progress-bar {
    border-radius: 999px;
    background-color: #4da3d9;
  }

  .daily-target-button,
  .daily-target-input {
    box-sizing: border-box;
    height: 24px;
    border: 1px solid #4b4b4b;
    border-radius: 4px;
    background-color: #292929;
    color: #d4d4d4;
    font: inherit;
  }

  .daily-target-button {
    padding: 0 0.45rem;
    cursor: pointer;
  }

  .daily-target-button:hover:not(:disabled) {
    background-color: #353535;
  }

  .daily-target-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .daily-target-button:focus-visible,
  .daily-target-input:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .daily-target-input {
    width: 72px;
    padding: 0 0.35rem;
  }
</style>
