<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { message, open } from "@tauri-apps/plugin-dialog";
  import {
    mkdir,
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
    validateFolderName,
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
  import {
    executeWorldProjectAdoption,
    planWorldProjectAdoption,
    SUGGESTED_WORLD_PROJECT_FOLDERS,
  } from "$lib/project/adoption";
  import {
    WORLD_PROJECT_FOLDER_ROLES,
    WORLD_PROJECT_MANIFEST_FILE,
    validateProjectName,
    type WorldProjectFolderRole,
  } from "$lib/project/manifest";
  import {
    executeNewWorldProject,
    planNewWorldProject,
  } from "$lib/project/new-project";
  import {
    discoverStructuredNoteDestinations,
    type StructuredNoteDestination,
  } from "$lib/project/note-destination";
  import {
    createStructuredNote,
    STRUCTURED_NOTE_TEMPLATES,
    STRUCTURED_NOTE_TYPES,
    suggestStructuredNoteFileName,
    validateStructuredNoteFileName,
    type StructuredNoteType,
  } from "$lib/project/structured-note";
  import { createIndependentProjectManifestText } from "$lib/project/project-copy";
  import {
    collectExpandedProjectDirectories,
    restoreProjectNavigation,
  } from "$lib/project/navigation-restore";
  import {
    createProjectNavigationState,
    createRecentProject,
    projectRelativePath,
    WORKSPACE_STORE_FILE,
    WorkspaceRepository,
    type ProjectNavigationState,
    type RecentProject,
  } from "$lib/project/workspace";

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
  const NAVIGATION_DELAY_MS = 150;

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
  let adoptingWorldProject = $state(false);
  let adoptionName = $state("");
  let adoptionRoles = $state<WorldProjectFolderRole[]>([]);
  let adoptionBusy = $state(false);
  let adoptionNameInput = $state<HTMLInputElement>();
  let creatingWorldProject = $state(false);
  let newWorldProjectName = $state("");
  let newWorldProjectFolderName = $state("");
  let newWorldProjectRoles = $state<WorldProjectFolderRole[]>([]);
  let newWorldProjectBusy = $state(false);
  let newWorldProjectNameInput = $state<HTMLInputElement>();
  let newWorldProjectFolderNameInput = $state<HTMLInputElement>();
  let creatingStructuredNote = $state(false);
  let structuredNoteType = $state<StructuredNoteType>("character");
  let structuredNoteTitle = $state("");
  let structuredNoteFileName = $state("");
  let structuredNoteFileNameTouched = $state(false);
  let structuredNoteDestination = $state("");
  let structuredNoteDestinations = $state<StructuredNoteDestination[]>([]);
  let structuredNoteBusy = $state(false);
  let structuredNoteError = $state("");
  let structuredNoteTitleInput = $state<HTMLInputElement>();
  let structuredNoteFileNameInput = $state<HTMLInputElement>();
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
  let recentProjects = $state<RecentProject[]>([]);
  let unavailableRecentKeys = $state<string[]>([]);
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

  interface NavigationWrite {
    path: string;
    revision: number;
    state: ProjectNavigationState;
  }

  const dirty = $derived(
    activeFilePath !== "" && hasUnsavedChanges(saveState),
  );
  const worldProjectBusy = $derived(
    adoptionBusy || newWorldProjectBusy || structuredNoteBusy,
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
  let workspaceRepositoryPromise: Promise<WorkspaceRepository> | null = null;
  let navigationRevision = 0;

  function getWorkspaceRepository(): Promise<WorkspaceRepository> {
    workspaceRepositoryPromise ??= load(WORKSPACE_STORE_FILE, {
      autoSave: false,
      defaults: {},
    }).then((store) => new WorkspaceRepository(store));
    return workspaceRepositoryPromise;
  }

  const navigationWriter = new AutosaveController<NavigationWrite>({
    delayMs: NAVIGATION_DELAY_MS,
    save: ({ state }) =>
      getWorkspaceRepository().then((repository) =>
        repository.setNavigation(state),
      ),
    onError: (_request, cause) => {
      appendError(
        `Navigation could not be remembered, but no project file was changed: ${formatError(cause)}`,
      );
    },
  });

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
    navigationWriter.dispose();
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

  function appendError(message: string): void {
    error = error ? `${error} ${message}` : message;
  }

  function projectDisplayName(
    path: string,
    inspection: WorldProjectFolderInspection,
  ): string {
    if (inspection.kind === "world-project") return inspection.manifest.name;
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Folder";
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
    scheduleNavigationState();
  }

  async function prepareToLeave(): Promise<boolean> {
    const canLeave = await resolvePendingChanges({
      hasUnsavedChanges: () => dirty,
      save: saveFile,
      chooseAfterFailure: chooseAfterSaveFailure,
      discard: discardActiveChanges,
    });
    if (canLeave) {
      await Promise.all([flushDailyProgress(), navigationWriter.flush()]);
    }
    return canLeave;
  }

  function scheduleNavigationState(): void {
    if (!folderPath || !projectStorageKey) return;
    const selectedDirectory = projectRelativePath(
      folderPath,
      selectedDirectoryPath || folderPath,
    );
    const activeFileRelative = activeFilePath
      ? projectRelativePath(folderPath, activeFilePath)
      : null;
    if (selectedDirectory === null || (activeFilePath && !activeFileRelative)) {
      return;
    }

    navigationRevision += 1;
    navigationWriter.schedule({
      path: projectStorageKey,
      revision: navigationRevision,
      state: createProjectNavigationState({
        projectKey: projectStorageKey,
        selectedDirectory,
        activeFile: activeFileRelative,
        expandedDirectories: collectExpandedProjectDirectories(
          entries,
          folderPath,
        ),
      }),
    });
  }

  async function rememberOpenedProject(
    path: string,
    inspection: WorldProjectFolderInspection,
    previousProjectKey: string,
    previousFolderPath: string,
  ): Promise<void> {
    const repository = await getWorkspaceRepository();
    if (
      previousProjectKey &&
      previousProjectKey !== inspection.storageKey &&
      previousFolderPath === path
    ) {
      await repository.removeProject(previousProjectKey);
    }
    await repository.rememberProject(
      createRecentProject({
        projectKey: inspection.storageKey,
        path,
        name: projectDisplayName(path, inspection),
        kind:
          inspection.kind === "world-project" ? "world-project" : "ordinary",
      }),
    );
    recentProjects = await repository.listRecent();
    unavailableRecentKeys = unavailableRecentKeys.filter(
      (key) => key !== inspection.storageKey,
    );

    const settings = await load(STORE_FILE);
    await settings.set(LAST_FOLDER_KEY, path);
    await settings.save();
  }

  async function openRecentProject(project: RecentProject): Promise<void> {
    await navigate(async () => {
      try {
        await loadFolder(project.path);
      } catch (cause) {
        unavailableRecentKeys = [
          ...new Set([...unavailableRecentKeys, project.projectKey]),
        ];
        error = `“${project.name}” is unavailable at its last location. If it moved, use Open Folder to select it again; a world project will reconnect by its project ID. ${formatError(cause)}`;
      }
    });
  }

  async function forgetRecentProject(project: RecentProject): Promise<void> {
    try {
      const repository = await getWorkspaceRepository();
      await repository.removeProject(project.projectKey);
      recentProjects = await repository.listRecent();
      unavailableRecentKeys = unavailableRecentKeys.filter(
        (key) => key !== project.projectKey,
      );
    } catch (cause) {
      appendError(`Could not remove the recent-project shortcut: ${formatError(cause)}`);
    }
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
        scheduleNavigationState();
        return;
      }
      entries = updateTreeEntry(entries, entry.path, (current) => ({
        ...current,
        expanded: !current.expanded,
      }));
      scheduleNavigationState();
    } catch (e) {
      error = `Could not read ${entry.name}: ${e}`;
      scheduleNavigationState();
    }
  }

  function selectProjectRoot(): void {
    selectedDirectoryPath = folderPath;
    scheduleNavigationState();
  }

  async function resolvePossibleProjectCopy(
    path: string,
    folderEntries: readonly FileTreeEntry[],
    inspection: WorldProjectFolderInspection,
  ): Promise<{
    inspection: WorldProjectFolderInspection;
    warning: string;
  }> {
    if (inspection.kind !== "world-project") {
      return { inspection, warning: "" };
    }
    const previous = (await (
      await getWorkspaceRepository()
    ).listRecent()).find(
      (project) =>
        project.projectKey === inspection.storageKey && project.path !== path,
    );
    if (!previous) return { inspection, warning: "" };

    try {
      await readDir(previous.path);
    } catch {
      // An inaccessible previous path is treated as a move. Only app-local
      // location data changes; the portable manifest remains untouched.
      return { inspection, warning: "" };
    }

    const choice = await message(
      `“${inspection.manifest.name}” is also available at ${previous.path}. Is this another location for the same world, or should this copy become an independent world?`,
      {
        title: "Possible world-project copy",
        kind: "warning",
        buttons: {
          yes: "Same project",
          no: "Make independent",
          cancel: "Open as folder",
        },
      },
    );
    if (choice === "Same project") return { inspection, warning: "" };
    if (choice === "Open as folder") {
      return {
        inspection: { kind: "ordinary", storageKey: path },
        warning:
          "This copy is open as an ordinary folder. Its manifest was not changed and its local practice data was not merged with the other world.",
      };
    }

    const manifestEntry = folderEntries.find(
      (entry) => entry.name === WORLD_PROJECT_MANIFEST_FILE,
    );
    if (!manifestEntry?.isFile || manifestEntry.isSymlink) {
      throw new Error("The project manifest is no longer a regular file.");
    }
    const currentText = await readTextFile(manifestEntry.path);
    const independent = createIndependentProjectManifestText(
      currentText,
      crypto.randomUUID(),
    );
    await guardedWriteText(
      {
        path: manifestEntry.path,
        content: independent.text,
        expectedContent: currentText,
      },
      { read: readTextFile, write: writeTextFile },
    );
    const reinspected = await inspectWorldProjectFolder({
      folderPath: path,
      entries: folderEntries,
      readText: readTextFile,
    });
    if (reinspected.kind !== "world-project") {
      throw new Error("The independent project manifest could not be reopened.");
    }
    return {
      inspection: reinspected,
      warning:
        "This copy now has its own project ID and independent local practice history.",
    };
  }

  // Load a folder into the sidebar. Throws if the path can't be read,
  // leaving existing state untouched (entries are read before committing).
  async function loadFolder(path: string) {
    const previousProjectKey = projectStorageKey;
    const previousFolderPath = folderPath;
    let newEntries = await readEntries(path);
    let inspectedProject = await inspectWorldProjectFolder({
      folderPath: path,
      entries: newEntries,
      readText: readTextFile,
    });
    const copyResolution = await resolvePossibleProjectCopy(
      path,
      newEntries,
      inspectedProject,
    );
    inspectedProject = copyResolution.inspection;
    const storageKey = inspectedProject.storageKey;
    let projectRecords: DailyProgressRecords = {};
    let projectTarget = DEFAULT_DAILY_TARGET;
    let progressLoadError = "";
    try {
      const repositories = await getDailyRepositories();
      if (inspectedProject.kind === "world-project") {
        await repositories.progress.copyProject(path, storageKey);
        await repositories.goal.copyProject(path, storageKey);
      }
      [projectRecords, projectTarget] = await Promise.all([
        repositories.progress.getProject(storageKey),
        repositories.goal.get(storageKey),
      ]);
    } catch (cause) {
      progressLoadError = `The folder opened, but its daily progress could not be loaded: ${formatError(cause)}`;
    }
    const dailyContext = resolveDailyProgress(projectRecords);

    let restoredSelectedDirectoryPath = path;
    let restoredFile: FileTreeEntry | null = null;
    let restoredFileContent = "";
    let restoredContent = "";
    let restoredRevision = 0;
    let navigationLoadError = "";
    try {
      const navigationState = await (
        await getWorkspaceRepository()
      ).getNavigation(storageKey);
      const restored = await restoreProjectNavigation(
        path,
        newEntries,
        navigationState,
        { joinPath: join, readEntries },
      );
      newEntries = restored.entries;
      restoredSelectedDirectoryPath = restored.selectedDirectoryPath;
      restoredFile = restored.activeFileEntry;
      if (restoredFile) {
        restoredFileContent = await readTextFile(restoredFile.path);
        const recovered = await recoverContent(
          restoredFile.path,
          restoredFileContent,
        );
        if (recovered) {
          restoredContent = recovered.content;
          restoredRevision = recovered.revision;
        } else {
          restoredFile = null;
        }
      }
    } catch (cause) {
      restoredFile = null;
      restoredFileContent = "";
      restoredContent = "";
      restoredRevision = 0;
      navigationLoadError = `The folder opened, but its previous navigation could not be restored: ${formatError(cause)}`;
    }

    folderPath = path;
    projectStorageKey = storageKey;
    projectInspection = inspectedProject;
    selectedDirectoryPath = restoredSelectedDirectoryPath;
    entries = newEntries;
    activeFile = restoredFile?.name ?? "";
    activeFilePath = restoredFile?.path ?? "";
    content = restoredContent;
    persistedContent = restoredFileContent;
    dailyRecordsByDate = projectRecords;
    activeDailyDateKey = dailyContext.dateKey;
    activeDailyRevision = dailyContext.revision;
    activeCompletedAt = dailyContext.completedAt;
    activeCompletedTarget = dailyContext.completedTarget;
    practiceState = beginDailyPractice(restoredContent, dailyContext.creditedWords);
    dailyTarget = projectTarget;
    editingDailyTarget = false;
    dailyTargetInput = "";
    completionMessage = "";
    lastDailyProgressFailure = null;
    dailyProgressError = progressLoadError;
    error = [
      inspectedProject.kind === "manifest-problem"
        ? inspectedProject.message
        : "",
      copyResolution.warning,
      navigationLoadError,
    ]
      .filter(Boolean)
      .join(" ");
    persistedContentByPath.clear();
    if (restoredFile) {
      persistedContentByPath.set(restoredFile.path, restoredFileContent);
    }
    forcedSave = null;
    lastSaveFailure = null;
    saveState = restoredRevision
      ? createRecoveredSaveState(restoredRevision)
      : createSaveState();
    creatingFile = false;
    newFileName = "";
    adoptingWorldProject = false;
    adoptionName = "";
    adoptionRoles = [];
    adoptionBusy = false;
    creatingWorldProject = false;
    newWorldProjectName = "";
    newWorldProjectFolderName = "";
    newWorldProjectRoles = [];
    newWorldProjectBusy = false;
    resetStructuredNote();

    try {
      await rememberOpenedProject(
        path,
        inspectedProject,
        previousProjectKey,
        previousFolderPath,
      );
    } catch (cause) {
      appendError(
        `The folder is open, but its recent-project shortcut could not be stored: ${formatError(cause)}`,
      );
    }

    navigationRevision = 0;
    if (restoredRevision) {
      const request = currentSaveRequest();
      if (request) autosave.schedule(request);
    }
  }

  async function startWorldProjectAdoption() {
    if (!folderPath || projectInspection.kind !== "ordinary") return;
    error = "";
    cancelNewWorldProject();
    adoptionName =
      folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "My World";
    adoptionRoles = [...WORLD_PROJECT_FOLDER_ROLES];
    adoptingWorldProject = true;
    await tick();
    adoptionNameInput?.focus();
    adoptionNameInput?.select();
  }

  function cancelWorldProjectAdoption() {
    if (adoptionBusy) return;
    adoptingWorldProject = false;
    adoptionName = "";
    adoptionRoles = [];
  }

  function setAdoptionRole(role: WorldProjectFolderRole, selected: boolean) {
    adoptionRoles = selected
      ? [...new Set([...adoptionRoles, role])]
      : adoptionRoles.filter((candidate) => candidate !== role);
  }

  function adoptionFormKeydown(event: KeyboardEvent) {
    if (
      adoptingWorldProject &&
      !adoptionBusy &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      cancelWorldProjectAdoption();
    } else if (
      creatingWorldProject &&
      !newWorldProjectBusy &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      cancelNewWorldProject();
    } else if (
      creatingStructuredNote &&
      !structuredNoteBusy &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      cancelStructuredNote();
    }
  }

  async function startNewWorldProject() {
    if (worldProjectBusy) return;
    cancelWorldProjectAdoption();
    cancelStructuredNote();
    error = "";
    newWorldProjectName = "My World";
    newWorldProjectFolderName = "My World";
    newWorldProjectRoles = [...WORLD_PROJECT_FOLDER_ROLES];
    creatingWorldProject = true;
    await tick();
    newWorldProjectNameInput?.focus();
    newWorldProjectNameInput?.select();
  }

  function cancelNewWorldProject() {
    if (newWorldProjectBusy) return;
    creatingWorldProject = false;
    newWorldProjectName = "";
    newWorldProjectFolderName = "";
    newWorldProjectRoles = [];
  }

  function setNewWorldProjectRole(
    role: WorldProjectFolderRole,
    selected: boolean,
  ) {
    newWorldProjectRoles = selected
      ? [...new Set([...newWorldProjectRoles, role])]
      : newWorldProjectRoles.filter((candidate) => candidate !== role);
  }

  async function confirmNewWorldProject() {
    if (!creatingWorldProject || newWorldProjectBusy) return;

    const nameIssue = validateProjectName(newWorldProjectName);
    if (nameIssue) {
      error = `Project ${nameIssue}`;
      await tick();
      newWorldProjectNameInput?.focus();
      return;
    }
    const folderNameIssue = validateFolderName(
      newWorldProjectFolderName.trim(),
    );
    if (folderNameIssue) {
      error = folderNameIssue;
      await tick();
      newWorldProjectFolderNameInput?.focus();
      return;
    }
    error = "";

    newWorldProjectBusy = true;
    try {
      await navigate(async () => {
        const parentPath = await open({
          ...folderDialogOptions,
          title: "Choose where to create the world project",
        });
        if (!parentPath) return;

        const parentEntries = await readEntries(parentPath);
        const plan = planNewWorldProject({
          parentEntries,
          projectId: crypto.randomUUID(),
          name: newWorldProjectName,
          folderName: newWorldProjectFolderName,
          selectedRoles: newWorldProjectRoles,
        });
        if (plan.kind === "blocked") {
          error = `Nothing was changed. “${plan.folderName}” already exists in the selected location.`;
          await tick();
          newWorldProjectFolderNameInput?.focus();
          return;
        }

        const rootPath = await join(parentPath, plan.folderName);
        const result = await executeNewWorldProject(plan, {
          createRoot: async () => {
            await mkdir(rootPath);
          },
          createDirectory: async (relativePath) => {
            await mkdir(await join(rootPath, relativePath));
          },
          createManifest: async (text) => {
            await writeTextFile(
              await join(rootPath, WORLD_PROJECT_MANIFEST_FILE),
              text,
              { createNew: true },
            );
          },
        });

        if (result.kind === "partial") {
          const created =
            result.createdDirectories.length > 0
              ? ` Created inside it: ${result.createdDirectories.join(", ")}.`
              : "";
          const root = result.createdRoot
            ? ` The folder “${plan.folderName}” was created and remains safe to inspect or remove manually.`
            : " No project folder was created.";
          error = `World project creation stopped at ${result.failedAt}: ${result.message}.${root}${created}`;
          return;
        }

        await loadFolder(rootPath);
      });
    } catch (cause) {
      error = `Could not create world project: ${formatError(cause)}`;
    } finally {
      newWorldProjectBusy = false;
    }
  }

  async function resolveRealProjectDirectory(
    relativePath: string,
  ): Promise<string | null> {
    if (!folderPath || projectInspection.kind !== "world-project") {
      return null;
    }
    if (!relativePath) return folderPath;

    let currentPath = folderPath;
    for (const segment of relativePath.split("/")) {
      const currentEntries = await readDir(currentPath);
      const entry = currentEntries.find((candidate) => candidate.name === segment);
      if (!entry?.isDirectory || entry.isSymlink) return null;
      currentPath = await join(currentPath, segment);
    }
    return currentPath;
  }

  async function startStructuredNote() {
    if (projectInspection.kind !== "world-project" || worldProjectBusy) return;
    cancelNewWorldProject();
    error = "";
    structuredNoteBusy = true;
    try {
      structuredNoteDestinations =
        await discoverStructuredNoteDestinations({
          entries,
          folders: projectInspection.manifest.folders,
          rootLabel: projectInspection.manifest.name,
          isUsableDirectory: async (relativePath) =>
            (await resolveRealProjectDirectory(relativePath)) !== null,
        });
      structuredNoteType = "character";
      structuredNoteTitle = "";
      structuredNoteFileName = suggestStructuredNoteFileName(
        "",
        structuredNoteType,
      );
      structuredNoteFileNameTouched = false;
      selectDefaultStructuredNoteDestination();
      creatingStructuredNote = true;
      await tick();
      structuredNoteTitleInput?.focus();
    } catch (cause) {
      error = `Could not prepare note creation: ${formatError(cause)}`;
    } finally {
      structuredNoteBusy = false;
    }
  }

  function resetStructuredNote() {
    creatingStructuredNote = false;
    structuredNoteType = "character";
    structuredNoteTitle = "";
    structuredNoteFileName = "";
    structuredNoteFileNameTouched = false;
    structuredNoteDestination = "";
    structuredNoteDestinations = [];
    structuredNoteBusy = false;
    structuredNoteError = "";
  }

  function cancelStructuredNote() {
    if (structuredNoteBusy) return;
    resetStructuredNote();
  }

  function selectDefaultStructuredNoteDestination() {
    const preferred =
      projectInspection.kind === "world-project"
        ? projectInspection.manifest.folders[
            STRUCTURED_NOTE_TEMPLATES[structuredNoteType].defaultRole
          ]
        : undefined;
    structuredNoteDestination =
      preferred &&
      structuredNoteDestinations.some(
        (destination) => destination.relativePath === preferred,
      )
        ? preferred
        : "";
  }

  function setStructuredNoteType(type: StructuredNoteType) {
    structuredNoteType = type;
    if (!structuredNoteFileNameTouched) {
      structuredNoteFileName = suggestStructuredNoteFileName(
        structuredNoteTitle,
        type,
      );
    }
    selectDefaultStructuredNoteDestination();
    structuredNoteError = "";
  }

  function setStructuredNoteTitle(title: string) {
    structuredNoteTitle = title;
    if (!structuredNoteFileNameTouched) {
      structuredNoteFileName = suggestStructuredNoteFileName(
        title,
        structuredNoteType,
      );
    }
    structuredNoteError = "";
  }

  async function confirmStructuredNote() {
    if (
      !creatingStructuredNote ||
      structuredNoteBusy ||
      projectInspection.kind !== "world-project"
    ) {
      return;
    }

    const titleIssue = validateProjectName(structuredNoteTitle);
    if (titleIssue) {
      structuredNoteError = `Title ${titleIssue.slice("name ".length)}`;
      await tick();
      structuredNoteTitleInput?.focus();
      return;
    }
    const fileName = structuredNoteFileName.trim();
    const fileNameIssue = validateStructuredNoteFileName(fileName);
    if (fileNameIssue) {
      structuredNoteError = fileNameIssue;
      await tick();
      structuredNoteFileNameInput?.focus();
      return;
    }
    if (
      !structuredNoteDestinations.some(
        (destination) =>
          destination.relativePath === structuredNoteDestination,
      )
    ) {
      structuredNoteError =
        "Choose an available project folder for this note.";
      return;
    }

    structuredNoteError = "";
    structuredNoteBusy = true;
    let createdEntry: FileTreeEntry | null = null;
    try {
      await navigate(async () => {
        const destinationPath = await resolveRealProjectDirectory(
          structuredNoteDestination,
        );
        if (!destinationPath) {
          structuredNoteError =
            "That project folder moved, disappeared, or became a symbolic link. Nothing was written.";
          return;
        }

        const path = await join(destinationPath, fileName);
        const note = createStructuredNote({
          id: crypto.randomUUID(),
          type: structuredNoteType,
          title: structuredNoteTitle,
        });
        await writeTextFile(path, note, { createNew: true });
        await refreshDirectory(destinationPath);
        createdEntry = {
          name: fileName,
          path,
          isDirectory: false,
          isFile: true,
          isSymlink: false,
          expanded: false,
          children: null,
        };
        resetStructuredNote();
      });
      if (createdEntry) await openFile(createdEntry);
    } catch (cause) {
      structuredNoteError = `Could not create note. No existing file was changed: ${formatError(cause)}`;
    } finally {
      structuredNoteBusy = false;
    }
  }

  async function confirmWorldProjectAdoption() {
    if (
      !folderPath ||
      projectInspection.kind !== "ordinary" ||
      adoptionBusy
    ) {
      return;
    }

    adoptionBusy = true;
    try {
      await navigate(async () => {
        let plan;
        try {
          plan = planWorldProjectAdoption({
            entries,
            projectId: crypto.randomUUID(),
            name: adoptionName,
            selectedRoles: adoptionRoles,
          });
        } catch (cause) {
          error = formatError(cause);
          return;
        }

        if (plan.kind === "blocked") {
          error = `This folder was not changed. Resolve these project-creation conflicts first: ${plan.collisions
            .map((collision) => `${collision.path} (${collision.reason})`)
            .join(", ")}.`;
          return;
        }

        const adoptingFolderPath = folderPath;
        const result = await executeWorldProjectAdoption(plan, {
          createDirectory: async (relativePath) => {
            await mkdir(await join(adoptingFolderPath, relativePath));
          },
          createManifest: async (text) => {
            await writeTextFile(
              await join(adoptingFolderPath, WORLD_PROJECT_MANIFEST_FILE),
              text,
              { createNew: true },
            );
          },
        });

        if (result.kind === "partial") {
          await refreshDirectory(adoptingFolderPath);
          const created =
            result.createdDirectories.length > 0
              ? ` Created: ${result.createdDirectories.join(", ")}.`
              : "";
          error = `World project creation stopped at ${result.failedAt}: ${result.message}.${created} Existing material was not removed or replaced.`;
          return;
        }

        await loadFolder(adoptingFolderPath);
      });
    } finally {
      adoptionBusy = false;
    }
  }

  async function openFolder() {
    await navigate(async () => {
      error = "";
      const selected = await open(folderDialogOptions);
      if (!selected) return;

      try {
        await loadFolder(selected);
      } catch (e) {
        error = `Could not read folder: ${e}`;
      }
    });
  }

  // On startup, reopen the last folder if it's still accessible.
  onMount(async () => {
    let last = "";
    try {
      const repository = await getWorkspaceRepository();
      recentProjects = await repository.listRecent();
      const store = await load(STORE_FILE);
      last = (await store.get<string>(LAST_FOLDER_KEY)) ?? "";
      if (last) await loadFolder(last);
    } catch (cause) {
      const unavailable = recentProjects.find((project) => project.path === last);
      if (unavailable) {
        unavailableRecentKeys = [
          ...new Set([...unavailableRecentKeys, unavailable.projectKey]),
        ];
      }
      error = `The last folder could not be reopened. Choose Open Folder to select it again: ${formatError(cause)}`;
    }
  });

  function startNewFile() {
    // Only meaningful once a folder is open.
    if (!folderPath) return;
    cancelNewWorldProject();
    cancelStructuredNote();
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
        scheduleNavigationState();

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
    adoptionFormKeydown(event);
    if (event.defaultPrevented) return;
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

    <button class="open-btn" onclick={openFolder} disabled={worldProjectBusy}
      >Open Folder</button>
    <button
      class="open-btn"
      onclick={startNewWorldProject}
      disabled={worldProjectBusy}
    >New World Project</button>
    <button class="open-btn" onclick={startNewFile} disabled={!folderPath || worldProjectBusy}>
      New File in {selectedDirectoryName}
    </button>

    {#if recentProjects.length > 0}
      <details class="recent-projects">
        <summary>Recent projects</summary>
        <ul>
          {#each recentProjects as project (project.projectKey)}
            <li class:unavailable={unavailableRecentKeys.includes(project.projectKey)}>
              <button
                class="recent-project-open"
                onclick={() => openRecentProject(project)}
                disabled={worldProjectBusy}
                title={`Open ${project.name} from ${project.path}`}
              >
                <span>{project.name}</span>
                <small>
                  {project.kind === "world-project" ? "World project" : "Folder"}
                  {unavailableRecentKeys.includes(project.projectKey)
                    ? " · unavailable"
                    : ""}
                </small>
              </button>
              <button
                class="recent-project-remove"
                onclick={() => forgetRecentProject(project)}
                disabled={worldProjectBusy}
                aria-label={`Remove ${project.name} from recent projects`}
                title="Remove shortcut only; project files stay untouched"
              >×</button>
            </li>
          {/each}
        </ul>
        {#if unavailableRecentKeys.length > 0}
          <p class="form-hint">
            If a world moved, use Open Folder to reconnect it by project ID.
          </p>
        {/if}
      </details>
    {/if}

    {#if projectInspection.kind === "world-project"}
      <button
        class="open-btn"
        onclick={startStructuredNote}
        disabled={worldProjectBusy}
      >New Note from Template</button>
    {/if}

    {#if folderPath && projectInspection.kind === "ordinary"}
      <button
        class="open-btn"
        onclick={startWorldProjectAdoption}
        disabled={worldProjectBusy}
      >Make World Project</button>
    {/if}

    {#if creatingWorldProject}
      <form
        class="project-adoption"
        aria-label="Create new world project"
        onsubmit={(event) => {
          event.preventDefault();
          void confirmNewWorldProject();
        }}
      >
        <label for="new-project-name">Project name</label>
        <input
          id="new-project-name"
          class="new-file-input"
          aria-label="New world project name"
          value={newWorldProjectName}
          oninput={(event) => {
            newWorldProjectName = (
              event.currentTarget as HTMLInputElement
            ).value;
            error = "";
          }}
          bind:this={newWorldProjectNameInput}
          disabled={newWorldProjectBusy}
        />
        <label for="new-project-folder-name">Folder name</label>
        <input
          id="new-project-folder-name"
          class="new-file-input"
          aria-label="New world project folder name"
          value={newWorldProjectFolderName}
          oninput={(event) => {
            newWorldProjectFolderName = (
              event.currentTarget as HTMLInputElement
            ).value;
            error = "";
          }}
          bind:this={newWorldProjectFolderNameInput}
          disabled={newWorldProjectBusy}
        />
        <fieldset disabled={newWorldProjectBusy}>
          <legend>Suggested folders</legend>
          {#each WORLD_PROJECT_FOLDER_ROLES as role}
            <label class="folder-choice">
              <input
                type="checkbox"
                checked={newWorldProjectRoles.includes(role)}
                onchange={(event) =>
                  setNewWorldProjectRole(
                    role,
                    (event.currentTarget as HTMLInputElement).checked,
                  )}
              />
              {SUGGESTED_WORLD_PROJECT_FOLDERS[role]}
            </label>
          {/each}
        </fieldset>
        <div class="adoption-actions">
          <button
            type="submit"
            disabled={newWorldProjectBusy}
          >{newWorldProjectBusy ? "Creating…" : "Choose location & create"}</button>
          <button
            type="button"
            onclick={cancelNewWorldProject}
            disabled={newWorldProjectBusy}
          >Cancel</button>
        </div>
      </form>
    {/if}

    {#if creatingStructuredNote}
      <form
        class="project-adoption"
        aria-label="Create structured Markdown note"
        onsubmit={(event) => {
          event.preventDefault();
          void confirmStructuredNote();
        }}
      >
        <label for="structured-note-type">Template</label>
        <select
          id="structured-note-type"
          aria-label="Note template"
          value={structuredNoteType}
          onchange={(event) =>
            setStructuredNoteType(
              (event.currentTarget as HTMLSelectElement)
                .value as StructuredNoteType,
            )}
          disabled={structuredNoteBusy}
        >
          {#each STRUCTURED_NOTE_TYPES as type}
            <option value={type}>{STRUCTURED_NOTE_TEMPLATES[type].label}</option>
          {/each}
        </select>
        <label for="structured-note-title">Title</label>
        <input
          id="structured-note-title"
          class="new-file-input"
          aria-label="Structured note title"
          value={structuredNoteTitle}
          oninput={(event) =>
            setStructuredNoteTitle(
              (event.currentTarget as HTMLInputElement).value,
            )}
          bind:this={structuredNoteTitleInput}
          disabled={structuredNoteBusy}
        />
        <label for="structured-note-file-name">Markdown file name</label>
        <input
          id="structured-note-file-name"
          class="new-file-input"
          aria-label="Structured note file name"
          value={structuredNoteFileName}
          oninput={(event) => {
            structuredNoteFileName = (
              event.currentTarget as HTMLInputElement
            ).value;
            structuredNoteFileNameTouched = true;
            structuredNoteError = "";
          }}
          bind:this={structuredNoteFileNameInput}
          disabled={structuredNoteBusy}
        />
        <label for="structured-note-destination">Project folder</label>
        <select
          id="structured-note-destination"
          aria-label="Structured note project folder"
          value={structuredNoteDestination}
          onchange={(event) => {
            structuredNoteDestination = (
              event.currentTarget as HTMLSelectElement
            ).value;
            structuredNoteError = "";
          }}
          disabled={structuredNoteBusy}
        >
          {#each structuredNoteDestinations as destination}
            <option value={destination.relativePath}>{destination.label}</option>
          {/each}
        </select>
        <p class="form-hint">
          Creates an ordinary Markdown file. Template comments are optional and safe to delete.
        </p>
        {#if structuredNoteError}
          <p class="error" role="alert">{structuredNoteError}</p>
        {/if}
        <div class="adoption-actions">
          <button type="submit" disabled={structuredNoteBusy}
            >{structuredNoteBusy ? "Creating…" : "Create note"}</button>
          <button
            type="button"
            onclick={cancelStructuredNote}
            disabled={structuredNoteBusy}
          >Cancel</button>
        </div>
      </form>
    {/if}

    {#if adoptingWorldProject}
      <form
        class="project-adoption"
        aria-label="Make world project"
        onsubmit={(event) => {
          event.preventDefault();
          void confirmWorldProjectAdoption();
        }}
      >
        <label for="project-name">Project name</label>
        <input
          id="project-name"
          class="new-file-input"
          aria-label="World project name"
          value={adoptionName}
          oninput={(event) =>
            (adoptionName = (event.currentTarget as HTMLInputElement).value)}
          bind:this={adoptionNameInput}
          disabled={adoptionBusy}
        />
        <fieldset disabled={adoptionBusy}>
          <legend>Suggested folders</legend>
          {#each WORLD_PROJECT_FOLDER_ROLES as role}
            <label class="folder-choice">
              <input
                type="checkbox"
                checked={adoptionRoles.includes(role)}
                onchange={(event) =>
                  setAdoptionRole(
                    role,
                    (event.currentTarget as HTMLInputElement).checked,
                  )}
              />
              {SUGGESTED_WORLD_PROJECT_FOLDERS[role]}
            </label>
          {/each}
        </fieldset>
        <div class="adoption-actions">
          <button
            type="submit"
            disabled={adoptionBusy}
          >{adoptionBusy ? "Creating…" : "Create project"}</button>
          <button
            type="button"
            onclick={cancelWorldProjectAdoption}
            disabled={adoptionBusy}
          >Cancel</button>
        </div>
      </form>
    {/if}

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

    {#if folderPath}
      <details class="project-info">
        <summary>Project & backup info</summary>
        {#if projectInspection.kind === "world-project"}
          <p>
            This world's stable identity lives in
            <code>{WORLD_PROJECT_MANIFEST_FILE}</code>. Back up or move the entire
            project folder so its writing and identity stay together.
          </p>
          <p>
            If both an original and a copy are available, the app asks whether they
            are the same world or whether the copy should receive a new project ID.
            Making it independent is the only opening choice that changes its
            manifest.
          </p>
        {:else}
          <p>
            This ordinary folder is identified by its location. Moving it may start
            separate local practice history until you reopen it.
          </p>
        {/if}
        <p>
          Daily goals and history, recent locations, navigation, and recovery drafts
          stay private to this app on this Mac. They are not part of a project-folder
          backup. Recovery drafts are temporary safety copies, not version history.
        </p>
      </details>
    {/if}

    <nav class="files" aria-label="Project files">
      {#if folderPath}
        <button
          class="file-item root-item"
          class:selected={selectedDirectoryPath === folderPath}
          onclick={selectProjectRoot}
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
      disabled={!activeFilePath || correctingDailyProgress || worldProjectBusy}
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

  .recent-projects,
  .project-info {
    margin: 0 0 0.75rem;
    color: #b8b8b8;
    font-size: 0.76rem;
  }

  .recent-projects summary,
  .project-info summary {
    padding: 0.3rem 0;
    color: #d4d4d4;
    font-weight: 600;
    cursor: pointer;
  }

  .recent-projects summary:focus-visible,
  .project-info summary:focus-visible,
  .recent-project-open:focus-visible,
  .recent-project-remove:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .recent-projects ul {
    margin: 0.25rem 0 0.5rem;
    padding: 0;
    list-style: none;
  }

  .recent-projects li {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
    margin-bottom: 0.25rem;
  }

  .recent-project-open,
  .recent-project-remove {
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background: #292929;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  .recent-project-open {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.4rem 0.45rem;
    text-align: left;
  }

  .recent-project-open span,
  .recent-project-open small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-project-open small {
    margin-top: 0.15rem;
    color: #999999;
  }

  .recent-project-remove {
    flex: 0 0 1.8rem;
    padding: 0;
    font-size: 1rem;
  }

  .recent-project-open:hover:not(:disabled),
  .recent-project-remove:hover:not(:disabled) {
    background: #353535;
  }

  .recent-projects li.unavailable .recent-project-open {
    border-color: #8a5548;
  }

  .recent-project-open:disabled,
  .recent-project-remove:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .project-info p {
    margin: 0.35rem 0;
    line-height: 1.4;
  }

  .project-info code {
    color: #cccccc;
    font-size: 0.72rem;
    overflow-wrap: anywhere;
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

  .project-adoption {
    box-sizing: border-box;
    margin: 0 0 0.75rem;
    padding: 0.75rem;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background-color: #202020;
    font-size: 0.78rem;
  }

  .project-adoption > label,
  .project-adoption legend {
    display: block;
    margin-bottom: 0.4rem;
    color: #d4d4d4;
    font-weight: 600;
  }

  .project-adoption fieldset {
    margin: 0 0 0.65rem;
    padding: 0;
    border: 0;
  }

  .project-adoption select {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 0.65rem;
    padding: 0.45rem;
    border: 1px solid #4b4b4b;
    border-radius: 4px;
    background-color: #292929;
    color: #d4d4d4;
    font: inherit;
  }

  .form-hint {
    margin: 0 0 0.65rem;
    color: #a8a8a8;
    line-height: 1.4;
  }

  .folder-choice {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.3rem 0;
    color: #b8b8b8;
  }

  .folder-choice input {
    margin: 0;
  }

  .adoption-actions {
    display: flex;
    gap: 0.45rem;
  }

  .adoption-actions button {
    padding: 0.35rem 0.5rem;
    border: 1px solid #4b4b4b;
    border-radius: 4px;
    background-color: #292929;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }

  .adoption-actions button:hover:not(:disabled) {
    background-color: #353535;
  }

  .adoption-actions button:focus-visible,
  .folder-choice input:focus-visible,
  .project-adoption select:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .adoption-actions button:disabled,
  .project-adoption fieldset:disabled {
    opacity: 0.6;
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
