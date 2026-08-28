<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { message, open } from "@tauri-apps/plugin-dialog";
  import {
    exists,
    mkdir,
    readDir,
    readTextFile,
    watch,
    writeTextFile,
  } from "@tauri-apps/plugin-fs";
  import { join } from "@tauri-apps/api/path";
  import { invoke } from "@tauri-apps/api/core";
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
    initialWritingLayout,
    transitionWritingLayout,
  } from "$lib/editor/writing-layout";
  import {
    assessRecovery,
    createRecoveryRecord,
    fingerprintContent,
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
  import LoreIndexStatus from "$lib/lore/LoreIndexStatus.svelte";
  import LoreCompletion from "$lib/lore/LoreCompletion.svelte";
  import LoreConnections from "$lib/lore/LoreConnections.svelte";
  import LoreQuickOpen from "$lib/lore/LoreQuickOpen.svelte";
  import LoreReferencePane from "$lib/lore/LoreReferencePane.svelte";
  import LoreRenameDialog from "$lib/lore/LoreRenameDialog.svelte";
  import {
    findWikiLinkCompletion,
    loreCompletionCandidates,
    type LoreCompletionCandidate,
    type WikiLinkCompletionContext,
  } from "$lib/lore/completion";
  import {
    activeLoreConnections,
    type LoreConnectionItem,
  } from "$lib/lore/connections";
  import type { LoreUnlinkedMention } from "$lib/lore/mentions";
  import {
    searchProjectLore,
    type LoreSearchResult,
  } from "$lib/lore/search";
  import {
    loadLoreReferenceSource,
    LoreReferenceRequestCoordinator,
    type LoreReferenceView,
  } from "$lib/lore/reference";
  import { planMissingLoreNote } from "$lib/lore/missing-note";
  import { planLoreRename } from "$lib/lore/rename";
  import {
    executeLoreRename,
    mapOffsetThroughLoreRename,
  } from "$lib/lore/rename-execution";
  import {
    LoreNavigationHistory,
    type LoreNavigationLocation,
  } from "$lib/lore/navigation-history";
  import { isMarkdownPath } from "$lib/lore/normalize";
  import {
    DEFAULT_MAX_LORE_FILE_BYTES,
    scanProjectLore,
    type LoreScanIssue,
    type LoreScanResult,
  } from "$lib/lore/scan";
  import { buildLoreProjectIndexCooperatively } from "$lib/lore/index";
  import { LoreIndexSession } from "$lib/lore/session";
  import {
    LoreChangeMonitor,
    shouldReconcileWatchEvent,
  } from "$lib/lore/monitor";
  import {
    collapseLoreChangePaths,
    reconcileLoreChanges,
  } from "$lib/lore/reconcile";
  import { tauriLoreScanBackend } from "$lib/lore/tauri-scan";
  import type { LoreProjectIndex, SourceRange } from "$lib/lore/types";
  import ManuscriptCorkboard from "$lib/manuscript/ManuscriptCorkboard.svelte";
  import ManuscriptCreationDialog from "$lib/manuscript/ManuscriptCreationDialog.svelte";
  import ManuscriptMetadataDialog from "$lib/manuscript/ManuscriptMetadataDialog.svelte";
  import ManuscriptOutline from "$lib/manuscript/ManuscriptOutline.svelte";
  import ManuscriptRepairDialog from "$lib/manuscript/ManuscriptRepairDialog.svelte";
  import ManuscriptReorderDialog from "$lib/manuscript/ManuscriptReorderDialog.svelte";
  import ManuscriptSceneMoveDialog from "$lib/manuscript/ManuscriptSceneMoveDialog.svelte";
  import ManuscriptSceneMergeDialog from "$lib/manuscript/ManuscriptSceneMergeDialog.svelte";
  import ManuscriptSceneSplitDialog from "$lib/manuscript/ManuscriptSceneSplitDialog.svelte";
  import {
    planManuscriptCreation,
    retitleManuscriptCreationPlan,
    verifyManuscriptCreationPlan,
    type ManuscriptCreationMode,
    type ManuscriptCreationPlan,
    type ReadyManuscriptCreationPlan,
  } from "$lib/manuscript/creation";
  import {
    loadManuscriptProject,
    type ManuscriptProjectLoadResult,
  } from "$lib/manuscript/source-reconciliation";
  import {
    planManuscriptSourceRepair,
    type ManuscriptSourceRepairPlan,
  } from "$lib/manuscript/repair";
  import {
    executeManuscriptSourceRepair,
    undoManuscriptSourceRepair,
    type ManuscriptRepairIo,
    type ManuscriptRepairUndo,
  } from "$lib/manuscript/repair-execution";
  import {
    manuscriptMetadataEditorState,
    planManuscriptMetadataEdit,
    type ManuscriptMetadataDraft,
    type ManuscriptMetadataTarget,
  } from "$lib/manuscript/metadata";
  import { executeManuscriptMetadataEdit } from "$lib/manuscript/metadata-execution";
  import {
    planManuscriptReorder,
    type ManuscriptReorderDirection,
    type ManuscriptReorderPlan,
  } from "$lib/manuscript/reorder";
  import { executeManuscriptReorder } from "$lib/manuscript/reorder-execution";
  import {
    manuscriptSceneMoveDestinations,
    planManuscriptSceneMove,
    type ManuscriptSceneMovePlan,
  } from "$lib/manuscript/relocate";
  import { executeManuscriptSceneMove } from "$lib/manuscript/relocate-execution";
  import {
    manuscriptSceneMergeAvailableSceneIds,
    manuscriptSceneMergeAvailability,
    planManuscriptSceneMerge,
    suggestRetiredScenePath,
    type ManuscriptSceneMergePlan,
    type ManuscriptSceneMergeRequest,
  } from "$lib/manuscript/merge";
  import {
    executeManuscriptSceneMerge,
    undoManuscriptSceneMerge,
    type ManuscriptSceneMergeIo,
    type ManuscriptSceneMergeUndo,
  } from "$lib/manuscript/merge-execution";
  import {
    manuscriptSceneSplitAvailability,
    planManuscriptSceneSplit,
    suggestSplitScenePath,
    type ManuscriptSceneSplitPlan,
    type ManuscriptSceneSplitRequest,
  } from "$lib/manuscript/split";
  import {
    executeManuscriptSceneSplit,
    undoManuscriptSceneSplit,
    type ManuscriptSceneSplitIo,
    type ManuscriptSceneSplitUndo,
  } from "$lib/manuscript/split-execution";
  import { MANUSCRIPT_STRUCTURE_FILE } from "$lib/manuscript/structure";

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
  const LORE_OVERLAY_DELAY_MS = 180;
  const EMPTY_MANUSCRIPT_METADATA_DRAFT: ManuscriptMetadataDraft = {
    title: "",
    synopsis: "",
    pov: "",
    location: "",
    storyDate: "",
    status: "",
    labels: "",
    notes: "",
    targetWords: "",
    includeInCompile: true,
  };

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
  let writingLayout = $state(initialWritingLayout());
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
  let loreIndex = $state<LoreProjectIndex | null>(null);
  let loreIndexPhase = $state<
    "idle" | "indexing" | "ready" | "stale" | "error"
  >("idle");
  let loreScanIssues = $state<LoreScanIssue[]>([]);
  let loreSuppressedIssueCount = $state(0);
  let loreIndexError = $state("");
  let loreIndexNeedsRefresh = false;
  let loreIndexSession = new LoreIndexSession();
  let loreOverlayTimer: ReturnType<typeof setTimeout> | null = null;
  let loreChangeMonitor: LoreChangeMonitor | null = null;
  let stopLoreWatch: (() => void) | null = null;
  let editorInput = $state<HTMLTextAreaElement>();
  let editorSelectionStart = $state(0);
  let editorSelectionEnd = $state(0);
  let loreCompletionContext = $state<WikiLinkCompletionContext | null>(null);
  let loreCompletionItems = $state<LoreCompletionCandidate[]>([]);
  let loreCompletionSelectedIndex = $state(0);
  let dismissedLoreCompletion = "";
  let insertingLoreCompletion = false;
  let quickOpenVisible = $state(false);
  let quickOpenQuery = $state("");
  let quickOpenSelectedIndex = $state(0);
  let quickOpenReturnFocus: HTMLElement | null = null;
  let loreReference = $state<LoreReferenceView | null>(null);
  const loreReferenceRequests = new LoreReferenceRequestCoordinator();
  let loreRenameSourcePath = $state("");
  let loreRenameRequestedPath = $state("");
  let loreRenameBusy = $state(false);
  let loreRenameError = $state("");
  const loreNavigationHistory = new LoreNavigationHistory();
  let loreHistoryRevision = $state(0);
  let restoringLoreHistory = $state(false);
  let loreHistoryNotice = $state("");
  let manuscriptProject = $state<ManuscriptProjectLoadResult>({ kind: "absent" });
  let manuscriptLoading = $state(false);
  let manuscriptLoadRevision = 0;
  let manuscriptCreationVisible = $state(false);
  let manuscriptCreationMode = $state<ManuscriptCreationMode>("import");
  let manuscriptCreationTitle = $state("");
  let manuscriptCreationImportDirectory = $state("");
  let manuscriptCreationBasePlan = $state<ManuscriptCreationPlan | null>(null);
  let manuscriptCreationPlanning = $state(false);
  let manuscriptCreationBusy = $state(false);
  let manuscriptCreationError = $state("");
  let manuscriptCreationRevision = 0;
  let manuscriptRepairKey = $state("");
  let manuscriptRepairPlan = $state<ManuscriptSourceRepairPlan | null>(null);
  let manuscriptRepairBusy = $state(false);
  let manuscriptRepairError = $state("");
  let manuscriptRepairUndo = $state<ManuscriptRepairUndo | null>(null);
  let manuscriptRepairNotice = $state("");
  let manuscriptMetadataItemId = $state("");
  let manuscriptMetadataTarget = $state<ManuscriptMetadataTarget | null>(null);
  let manuscriptMetadataBaseProject = $state<ManuscriptProjectLoadResult | null>(null);
  let manuscriptMetadataDraft = $state<ManuscriptMetadataDraft>({
    ...EMPTY_MANUSCRIPT_METADATA_DRAFT,
  });
  let manuscriptMetadataError = $state("");
  let manuscriptReorderPlan = $state<ManuscriptReorderPlan | null>(null);
  let manuscriptReorderError = $state("");
  let manuscriptSceneMoveItemId = $state("");
  let manuscriptSceneMoveBaseProject = $state<ManuscriptProjectLoadResult | null>(null);
  let manuscriptSceneMoveDestinationKey = $state("");
  let manuscriptSceneMoveDestinationIndex = $state(0);
  let manuscriptSceneMoveError = $state("");
  let manuscriptSceneSplitBaseProject = $state<ManuscriptProjectLoadResult | null>(null);
  let manuscriptSceneSplitRequest = $state<ManuscriptSceneSplitRequest | null>(null);
  let manuscriptSceneSplitBusy = $state(false);
  let manuscriptSceneSplitError = $state("");
  let manuscriptSceneSplitUndo = $state<ManuscriptSceneSplitUndo | null>(null);
  let manuscriptSceneMergeBaseProject = $state<ManuscriptProjectLoadResult | null>(null);
  let manuscriptSceneMergeRequest = $state<ManuscriptSceneMergeRequest | null>(null);
  let manuscriptSceneMergeBusy = $state(false);
  let manuscriptSceneMergeError = $state("");
  let manuscriptSceneMergeUndo = $state<ManuscriptSceneMergeUndo | null>(null);
  let manuscriptOutlineFocusItemId = $state("");
  let manuscriptOutlineFocusRevision = $state(0);
  let manuscriptCorkboardId = $state("");
  let manuscriptCorkboardFocusItemId = $state("");
  let manuscriptCorkboardFocusRevision = $state(0);
  let manuscriptCorkboardEditorSelection = { start: 0, end: 0 };
  let manuscriptMutationSurface: "outline" | "corkboard" = "outline";
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
  const focusMode = $derived(writingLayout.mode === "focus");
  const worldProjectBusy = $derived(
    adoptionBusy ||
      newWorldProjectBusy ||
      structuredNoteBusy ||
      loreRenameBusy ||
      manuscriptCreationVisible ||
      manuscriptRepairBusy ||
      Boolean(manuscriptRepairKey) ||
      Boolean(manuscriptMetadataItemId) ||
      Boolean(manuscriptReorderPlan) ||
      Boolean(manuscriptSceneMoveItemId) ||
      manuscriptSceneSplitBusy ||
      Boolean(manuscriptSceneSplitRequest) ||
      manuscriptSceneMergeBusy ||
      Boolean(manuscriptSceneMergeRequest),
  );
  const manuscriptCreationPlan = $derived.by(() => {
    if (manuscriptCreationBasePlan?.kind !== "ready") {
      return manuscriptCreationBasePlan;
    }
    return retitleManuscriptCreationPlan(
      manuscriptCreationBasePlan,
      manuscriptCreationTitle,
    );
  });
  const manuscriptMetadataPlan = $derived.by(() => {
    if (!manuscriptMetadataBaseProject || !manuscriptMetadataItemId) return null;
    return planManuscriptMetadataEdit(
      manuscriptMetadataBaseProject,
      manuscriptMetadataItemId,
      manuscriptMetadataDraft,
    );
  });
  const manuscriptSceneMoveDestinationsForDialog = $derived.by(() => {
    if (!manuscriptSceneMoveBaseProject || !manuscriptSceneMoveItemId) return [];
    return manuscriptSceneMoveDestinations(
      manuscriptSceneMoveBaseProject,
      manuscriptSceneMoveItemId,
    );
  });
  const manuscriptSceneMovePlan = $derived.by<ManuscriptSceneMovePlan | null>(() => {
    if (!manuscriptSceneMoveBaseProject || !manuscriptSceneMoveItemId) return null;
    return planManuscriptSceneMove(
      manuscriptSceneMoveBaseProject,
      manuscriptSceneMoveItemId,
      manuscriptSceneMoveDestinationKey,
      manuscriptSceneMoveDestinationIndex,
    );
  });
  const manuscriptSceneSplitPlan = $derived.by<ManuscriptSceneSplitPlan | null>(() => {
    if (!manuscriptSceneSplitBaseProject || !manuscriptSceneSplitRequest) return null;
    return planManuscriptSceneSplit(
      manuscriptSceneSplitBaseProject,
      manuscriptSceneSplitRequest,
    );
  });
  const manuscriptSceneMergePlan = $derived.by<ManuscriptSceneMergePlan | null>(() => {
    if (!manuscriptSceneMergeBaseProject || !manuscriptSceneMergeRequest) return null;
    return planManuscriptSceneMerge(
      manuscriptSceneMergeBaseProject,
      manuscriptSceneMergeRequest,
    );
  });
  const manuscriptSceneMergeAvailableIds = $derived(
    manuscriptSceneMergeAvailableSceneIds(manuscriptProject),
  );
  const activeSceneSplitAvailability = $derived.by(() => {
    const sourcePath = activeLorePath();
    if (
      !sourcePath ||
      dirty ||
      content !== persistedContent ||
      editorSelectionStart !== editorSelectionEnd
    ) return { kind: "unavailable" as const };
    return manuscriptSceneSplitAvailability(manuscriptProject, {
      sourcePath,
      sourceText: content,
      sourceFingerprint: fingerprintContent(content),
      caretOffset: editorSelectionStart,
    });
  });
  const manuscriptCorkboard = $derived.by(() => {
    if (!manuscriptCorkboardId || manuscriptProject.kind !== "ready") return null;
    return manuscriptProject.reconciled.manuscripts.find(
      (entry) => entry.manuscript.id === manuscriptCorkboardId,
    ) ?? null;
  });
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
  const loreIssueCount = $derived.by(() => {
    if (!loreIndex) return loreScanIssues.length + loreSuppressedIssueCount;
    let count = loreScanIssues.length + loreSuppressedIssueCount + loreIndex.issues.length;
    for (const document of loreIndex.documents.values()) {
      count += document.parseIssues.length;
      count += document.outgoing.filter(
        ({ resolution }) => resolution.kind !== "resolved",
      ).length;
    }
    return count;
  });
  const loreIndexIssueMessages = $derived.by(() => {
    if (!loreIndex) return [] as string[];
    const messages = loreIndex.issues.map(({ message, paths }) =>
      `${paths.join(", ")}: ${message}`,
    );
    for (const document of loreIndex.documents.values()) {
      for (const issue of document.parseIssues) {
        messages.push(
          `${document.path}:${issue.range.line}:${issue.range.column}: ${issue.message}`,
        );
      }
      for (const outgoing of document.outgoing) {
        if (outgoing.resolution.kind === "resolved") continue;
        messages.push(
          `${document.path}:${outgoing.link.range.line}:${outgoing.link.range.column}: ${outgoing.resolution.message}`,
        );
      }
    }
    return messages;
  });
  const currentLoreConnections = $derived(
    activeLoreConnections(loreIndex, activeLorePath()),
  );
  const loreRenamePlan = $derived(
    loreIndex && loreRenameSourcePath
      ? planLoreRename(loreIndex, loreRenameSourcePath, loreRenameRequestedPath)
      : null,
  );
  const canGoBackThroughLore = $derived.by(() => {
    loreHistoryRevision;
    return loreNavigationHistory.canGoBack;
  });
  const canGoForwardThroughLore = $derived.by(() => {
    loreHistoryRevision;
    return loreNavigationHistory.canGoForward;
  });
  const quickOpenResults = $derived(
    quickOpenVisible && loreIndex
      ? searchProjectLore(loreIndex, quickOpenQuery)
      : [],
  );
  const quickOpenActiveIndex = $derived(
    Math.max(0, Math.min(quickOpenSelectedIndex, quickOpenResults.length - 1)),
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
      updateLoreSourceAfterSave(request.path, request.content);
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
    if (loreOverlayTimer) clearTimeout(loreOverlayTimer);
    loreReferenceRequests.invalidate();
    stopLoreMonitoring();
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

  function beginLoreIndex(path: string): void {
    if (loreOverlayTimer) {
      clearTimeout(loreOverlayTimer);
      loreOverlayTimer = null;
    }
    stopLoreMonitoring();
    loreIndexSession.invalidatePendingWork();
    loreIndexSession = new LoreIndexSession();
    loreIndex = null;
    loreScanIssues = [];
    loreSuppressedIssueCount = 0;
    loreIndexError = "";
    loreIndexNeedsRefresh = false;
    clearLoreCompletion();
    closeLoreReference(false);
    loreRenameSourcePath = "";
    loreRenameRequestedPath = "";
    loreRenameBusy = false;
    loreRenameError = "";
    loreNavigationHistory.clear();
    loreHistoryRevision += 1;
    restoringLoreHistory = false;
    loreHistoryNotice = "";
    manuscriptLoadRevision += 1;
    manuscriptProject = { kind: "absent" };
    manuscriptLoading = false;
    resetManuscriptCreation(true);
    resetManuscriptRepair(true);
    resetManuscriptMetadata(true);
    resetManuscriptReorder(true);
    resetManuscriptSceneMove(true);
    resetManuscriptSceneSplit(true);
    resetManuscriptSceneMerge(true);
    manuscriptSceneSplitUndo = null;
    manuscriptSceneMergeUndo = null;
    manuscriptCorkboardId = "";
    manuscriptCorkboardFocusItemId = "";
    manuscriptCorkboardEditorSelection = { start: 0, end: 0 };
    writingLayout = transitionWritingLayout(writingLayout, { kind: "project-replaced" });
    loreIndexPhase = "indexing";
    void refreshLoreIndex(path);
  }

  async function refreshLoreIndex(path = folderPath): Promise<void> {
    if (!path) return;
    const session = loreIndexSession;
    loreIndexPhase = "indexing";
    loreIndexError = "";
    try {
      const scanPromise: Promise<LoreScanResult> = scanProjectLore(
        path,
        tauriLoreScanBackend,
      );
      const loaded = await session.rebuild(async () => (await scanPromise).sources);
      const scanResult = await scanPromise;
      if (session !== loreIndexSession || path !== folderPath) return;
      if (loaded.kind === "stale") {
        loreIndexPhase = "stale";
        return;
      }
      loreScanIssues = scanResult.issues;
      loreSuppressedIssueCount = scanResult.suppressedIssueCount;
      loreIndex = loaded.index;
      syncActiveLoreBuffer();
      loreIndexNeedsRefresh = false;
      loreIndexPhase = "ready";
      void startLoreMonitoring(path, session);
      if (loreReference) void openLoreReference(loreReference.path, false);
      void refreshManuscriptStructure(path, session, loreIndex);
    } catch (cause) {
      if (session !== loreIndexSession || path !== folderPath) return;
      loreIndexPhase = "error";
      loreIndexError = `Indexing could not finish, but writing and saving still work: ${formatError(cause)}`;
    }
  }

  function stopLoreMonitoring(): void {
    loreChangeMonitor?.dispose();
    loreChangeMonitor = null;
    stopLoreWatch?.();
    stopLoreWatch = null;
  }

  async function startLoreMonitoring(
    path: string,
    session: LoreIndexSession,
  ): Promise<void> {
    if (
      stopLoreWatch ||
      loreChangeMonitor ||
      path !== folderPath ||
      session !== loreIndexSession
    ) {
      return;
    }

    const monitor = new LoreChangeMonitor({
      delayMs: 180,
      reconcile: async ({ paths }) => {
        if (session !== loreIndexSession || path !== folderPath || !loreIndex) return;
        const changedPaths = collapseLoreChangePaths(paths);
        if (changedPaths.length === 0) return;
        try {
          const result = await reconcileLoreChanges({
            rootPath: path,
            relativePaths: changedPaths,
            currentIndex: loreIndex,
            backend: tauriLoreScanBackend,
          });
          if (session !== loreIndexSession || path !== folderPath) return;
          if (result.changes.size > 0) {
            loreIndex = session.applyDiskChanges(result.changes);
          }
          loreScanIssues = mergeReconciledScanIssues(
            loreScanIssues,
            result.issues,
            changedPaths,
          );
          if (result.stale) {
            loreIndexNeedsRefresh = true;
            loreIndexPhase = "stale";
            loreIndexError =
              "Some external changes could not be reconciled safely. The last known index remains available; use Refresh lore index to try again.";
          } else if (!loreIndexNeedsRefresh) {
            loreIndexPhase = "ready";
            loreIndexError = "";
          }
          if (
            loreReference &&
            changedPaths.some((changedPath) =>
              pathsOverlap(changedPath, loreReference!.path),
            )
          ) {
            void openLoreReference(loreReference.path, false);
          }
          void refreshManuscriptStructure(path, session, loreIndex);
        } catch (cause) {
          if (session !== loreIndexSession || path !== folderPath) return;
          loreIndexNeedsRefresh = true;
          loreIndexPhase = "stale";
          loreIndexError = `External changes could not be reconciled, but writing and saving still work: ${formatError(cause)}`;
        }
      },
    });
    loreChangeMonitor = monitor;

    try {
      const unwatch = await watch(
        path,
        (event) => {
          if (!shouldReconcileWatchEvent(event.type)) return;
          const relativePaths = event.paths
            .map((eventPath) => projectRelativePath(path, eventPath))
            .filter((eventPath): eventPath is string => eventPath !== null);
          monitor.notify(relativePaths);
        },
        { recursive: true, delayMs: 120 },
      );
      if (
        session !== loreIndexSession ||
        path !== folderPath ||
        monitor !== loreChangeMonitor
      ) {
        unwatch();
        return;
      }
      stopLoreWatch = unwatch;
    } catch (cause) {
      if (monitor === loreChangeMonitor) {
        monitor.dispose();
        loreChangeMonitor = null;
      }
      if (session !== loreIndexSession || path !== folderPath) return;
      loreIndexNeedsRefresh = true;
      loreIndexPhase = "stale";
      loreIndexError = `Automatic lore refresh is unavailable. Writing and explicit refresh still work: ${formatError(cause)}`;
    }
  }

  async function refreshManuscriptStructure(
    path = folderPath,
    session = loreIndexSession,
    index = loreIndex,
  ): Promise<void> {
    if (!path || !index) return;
    const revision = ++manuscriptLoadRevision;
    manuscriptLoading = true;
    try {
      const result = await loadManuscriptProject(path, tauriLoreScanBackend, {
        loreIndex: index,
      });
      if (
        revision !== manuscriptLoadRevision ||
        session !== loreIndexSession ||
        path !== folderPath
      ) {
        return;
      }
      invalidateManuscriptUndo(result);
      manuscriptProject = result;
    } catch (cause) {
      if (
        revision !== manuscriptLoadRevision ||
        session !== loreIndexSession ||
        path !== folderPath
      ) {
        return;
      }
      manuscriptProject = {
        kind: "unreadable",
        message: `The manuscript outline could not be refreshed safely: ${formatError(cause)}`,
      };
    } finally {
      if (revision === manuscriptLoadRevision) manuscriptLoading = false;
    }
  }

  async function openManuscriptSource(
    relativePath: string,
    fingerprint: string,
  ): Promise<void> {
    if (!(await historySourceMatches(relativePath, fingerprint))) {
      error = "That manuscript source changed before it could be opened. The outline is refreshing instead.";
      await refreshManuscriptStructure();
      return;
    }
    await openIndexedLorePath(relativePath, null);
  }

  async function referenceManuscriptSource(
    relativePath: string,
    fingerprint: string,
    closeCorkboard = false,
  ): Promise<void> {
    if (!activeFilePath) {
      error = "Open a draft before adding a manuscript reference beside it.";
      return;
    }
    if (!(await historySourceMatches(relativePath, fingerprint))) {
      error = "That manuscript source changed before it could be referenced. The outline is refreshing instead.";
      await refreshManuscriptStructure();
      return;
    }
    if (closeCorkboard) {
      manuscriptCorkboardId = "";
      await tick();
      if (editorInput) {
        const start = Math.min(
          manuscriptCorkboardEditorSelection.start,
          editorInput.value.length,
        );
        const end = Math.min(
          Math.max(start, manuscriptCorkboardEditorSelection.end),
          editorInput.value.length,
        );
        editorInput.setSelectionRange(start, end);
      }
    }
    await openLoreReference(relativePath);
  }

  function setWritingFocus(enabled: boolean): void {
    const start = editorInput?.selectionStart ?? 0;
    const end = editorInput?.selectionEnd ?? start;
    const next = transitionWritingLayout(writingLayout, enabled
      ? {
          kind: "enter-focus",
          hasActiveDraft: Boolean(activeFilePath),
          corkboardOpen: Boolean(manuscriptCorkboard),
        }
      : { kind: "exit-focus" });
    if (next === writingLayout || next.mode === writingLayout.mode) return;
    writingLayout = next;
    void tick().then(() => {
      if (!editorInput) return;
      editorInput.focus({ preventScroll: true });
      editorInput.setSelectionRange(
        Math.min(start, editorInput.value.length),
        Math.min(Math.max(start, end), editorInput.value.length),
      );
    });
  }

  function beginManuscriptRepair(key: string): void {
    if (manuscriptRepairBusy || worldProjectBusy || !key) return;
    const plan = planManuscriptSourceRepair(manuscriptProject, key);
    if (plan.kind !== "ready") {
      manuscriptRepairNotice = plan.reason;
      return;
    }
    manuscriptRepairError = "";
    manuscriptRepairPlan = plan;
    manuscriptRepairKey = key;
  }

  function closeManuscriptRepair(): void {
    if (manuscriptRepairBusy) return;
    manuscriptRepairKey = "";
    manuscriptRepairPlan = null;
    manuscriptRepairError = "";
  }

  function resetManuscriptRepair(force = false): void {
    if (manuscriptRepairBusy && !force) return;
    manuscriptRepairKey = "";
    manuscriptRepairPlan = null;
    manuscriptRepairBusy = false;
    manuscriptRepairError = "";
    manuscriptRepairUndo = null;
    manuscriptRepairNotice = "";
  }

  function invalidateManuscriptUndo(result: ManuscriptProjectLoadResult): void {
    if (
      manuscriptRepairUndo &&
      (result.kind !== "ready" ||
        result.fingerprint !== manuscriptRepairUndo.expectedFingerprint ||
        result.text !== manuscriptRepairUndo.expectedText)
    ) {
      manuscriptRepairUndo = null;
      manuscriptRepairNotice =
        "The manuscript structure changed after the last edit, so its one-step Undo is no longer available.";
    }
    if (manuscriptSceneSplitUndo) {
      const left = loreIndex?.documents.get(manuscriptSceneSplitUndo.sourcePath);
      const right = loreIndex?.documents.get(manuscriptSceneSplitUndo.destinationPath);
      if (
        result.kind !== "ready" ||
        result.fingerprint !== manuscriptSceneSplitUndo.expectedStructureFingerprint ||
        result.text !== manuscriptSceneSplitUndo.expectedStructureText ||
        left?.fingerprint !== manuscriptSceneSplitUndo.expectedLeftSourceFingerprint ||
        right?.fingerprint !== manuscriptSceneSplitUndo.expectedRightSourceFingerprint
      ) {
        manuscriptSceneSplitUndo = null;
        manuscriptRepairNotice =
          "A split scene or the manuscript structure changed, so the guarded split Undo is no longer available.";
      }
    }
    if (manuscriptSceneMergeUndo) {
      const left = loreIndex?.documents.get(manuscriptSceneMergeUndo.leftPath);
      const originalRight = loreIndex?.documents.get(manuscriptSceneMergeUndo.rightPath);
      if (
        result.kind !== "ready" ||
        result.fingerprint !== manuscriptSceneMergeUndo.expectedStructureFingerprint ||
        result.text !== manuscriptSceneMergeUndo.expectedStructureText ||
        left?.fingerprint !== manuscriptSceneMergeUndo.expectedMergedLeftFingerprint ||
        originalRight
      ) {
        manuscriptSceneMergeUndo = null;
        manuscriptRepairNotice =
          "The merged scene, original right path, or manuscript structure changed, so guarded merge Undo is no longer available.";
      }
    }
  }

  function manuscriptRepairIo(
    rootPath: string,
  ): ManuscriptRepairIo {
    return {
      reload: async () => {
        const scan = await scanProjectLore(rootPath, tauriLoreScanBackend);
        const currentIndex = await buildLoreProjectIndexCooperatively(scan.sources);
        return loadManuscriptProject(rootPath, tauriLoreScanBackend, {
          loreIndex: currentIndex,
        });
      },
      replaceAtomic: (expectedText, newText) =>
        invoke<void>("replace_manuscript_structure_atomic", {
          rootPath,
          expectedText,
          newText,
        }),
    };
  }

  async function confirmManuscriptRepair(): Promise<void> {
    const plan = manuscriptRepairPlan;
    if (
      !folderPath ||
      !loreIndex ||
      !manuscriptRepairKey ||
      manuscriptRepairBusy ||
      plan?.kind !== "ready"
    ) {
      return;
    }
    const rootPath = folderPath;
    const session = loreIndexSession;
    manuscriptRepairBusy = true;
    manuscriptRepairError = "";
    const result = await executeManuscriptSourceRepair(
      plan,
      manuscriptRepairIo(rootPath),
    );
    if (rootPath !== folderPath || session !== loreIndexSession) {
      manuscriptRepairBusy = false;
      manuscriptRepairKey = "";
      manuscriptRepairPlan = null;
      error = "The project changed while the manuscript repair was running. Refresh the project before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptRepairBusy = false;
      manuscriptRepairError = result.message;
      void refreshManuscriptStructure(rootPath, session, loreIndex);
      return;
    }
    manuscriptRepairKey = "";
    manuscriptRepairPlan = null;
    manuscriptProject = result.project;
    manuscriptRepairUndo = result.undo;
    manuscriptSceneSplitUndo = null;
    manuscriptSceneMergeUndo = null;
    manuscriptRepairNotice = `Updated ${plan.candidate.bindingLabel.toLowerCase()} for ${plan.candidate.itemTitle}. The Markdown file was not changed.`;
    manuscriptRepairBusy = false;
  }

  async function undoLastManuscriptRepair(): Promise<void> {
    const undo = manuscriptRepairUndo;
    if (!folderPath || !loreIndex || !undo || manuscriptRepairBusy) return;
    const rootPath = folderPath;
    const session = loreIndexSession;
    manuscriptRepairBusy = true;
    const result = await undoManuscriptSourceRepair(
      undo,
      manuscriptRepairIo(rootPath),
    );
    if (rootPath !== folderPath || session !== loreIndexSession) {
      manuscriptRepairBusy = false;
      manuscriptRepairUndo = null;
      error = "The project changed while Undo was running. Refresh the project before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptRepairBusy = false;
      manuscriptRepairUndo = null;
      manuscriptRepairNotice = result.message;
      void refreshManuscriptStructure(rootPath, session, loreIndex);
      return;
    }
    manuscriptProject = result.project;
    manuscriptRepairUndo = null;
    manuscriptRepairNotice = "The last manuscript structure change was undone exactly.";
    manuscriptRepairBusy = false;
  }

  async function undoLastManuscriptChange(): Promise<void> {
    if (manuscriptSceneMergeUndo) {
      await undoLastManuscriptSceneMerge();
      return;
    }
    if (manuscriptSceneSplitUndo) {
      await undoLastManuscriptSceneSplit();
      return;
    }
    await undoLastManuscriptRepair();
  }

  function beginManuscriptMetadataEdit(
    itemId: string,
    surface: "outline" | "corkboard" = "outline",
  ): void {
    if (!itemId || worldProjectBusy || manuscriptRepairBusy) return;
    const editor = manuscriptMetadataEditorState(manuscriptProject, itemId);
    if (editor.kind !== "ready") {
      manuscriptRepairNotice = editor.reason;
      return;
    }
    manuscriptMetadataItemId = itemId;
    manuscriptMetadataTarget = editor.target;
    manuscriptMetadataBaseProject = manuscriptProject;
    manuscriptMetadataDraft = { ...editor.draft };
    manuscriptMetadataError = "";
    manuscriptMutationSurface = surface;
  }

  function resetManuscriptMetadata(force = false): void {
    if (manuscriptRepairBusy && !force) return;
    manuscriptMetadataItemId = "";
    manuscriptMetadataTarget = null;
    manuscriptMetadataBaseProject = null;
    manuscriptMetadataDraft = { ...EMPTY_MANUSCRIPT_METADATA_DRAFT };
    manuscriptMetadataError = "";
  }

  async function confirmManuscriptMetadataEdit(): Promise<void> {
    const plan = manuscriptMetadataPlan;
    if (
      !folderPath ||
      !loreIndex ||
      !manuscriptMetadataItemId ||
      manuscriptRepairBusy ||
      plan?.kind !== "ready"
    ) {
      return;
    }
    const rootPath = folderPath;
    const session = loreIndexSession;
    manuscriptRepairBusy = true;
    manuscriptMetadataError = "";
    const result = await executeManuscriptMetadataEdit(plan, manuscriptRepairIo(rootPath));
    if (rootPath !== folderPath || session !== loreIndexSession) {
      manuscriptRepairBusy = false;
      resetManuscriptMetadata(true);
      error = "The project changed while the manuscript details were being saved. Refresh the project before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptRepairBusy = false;
      manuscriptMetadataError = result.message;
      void refreshManuscriptStructure(rootPath, session, loreIndex);
      return;
    }
    const itemTitle = plan.target.itemTitle;
    const focusSurface = manuscriptMutationSurface;
    manuscriptProject = result.project;
    manuscriptRepairUndo = result.undo;
    manuscriptSceneSplitUndo = null;
    manuscriptSceneMergeUndo = null;
    manuscriptRepairNotice = `Updated details for ${itemTitle}. No Markdown file was changed.`;
    manuscriptRepairBusy = false;
    resetManuscriptMetadata(true);
    focusManuscriptMutationItem(plan.target.itemId, focusSurface);
  }

  function beginManuscriptReorder(
    itemId: string,
    direction: ManuscriptReorderDirection,
    surface: "outline" | "corkboard" = "outline",
  ): void {
    if (!itemId || worldProjectBusy || manuscriptRepairBusy) return;
    const plan = planManuscriptReorder(manuscriptProject, itemId, direction);
    if (plan.kind !== "ready") {
      manuscriptRepairNotice = plan.reason;
      return;
    }
    manuscriptReorderPlan = plan;
    manuscriptReorderError = "";
    manuscriptMutationSurface = surface;
  }

  function resetManuscriptReorder(force = false): void {
    if (manuscriptRepairBusy && !force) return;
    manuscriptReorderPlan = null;
    manuscriptReorderError = "";
  }

  async function confirmManuscriptReorder(): Promise<void> {
    const plan = manuscriptReorderPlan;
    if (
      !folderPath ||
      !loreIndex ||
      manuscriptRepairBusy ||
      plan?.kind !== "ready"
    ) {
      return;
    }
    const rootPath = folderPath;
    const session = loreIndexSession;
    manuscriptRepairBusy = true;
    manuscriptReorderError = "";
    const result = await executeManuscriptReorder(plan, manuscriptRepairIo(rootPath));
    if (rootPath !== folderPath || session !== loreIndexSession) {
      manuscriptRepairBusy = false;
      resetManuscriptReorder(true);
      error = "The project changed while the manuscript order was being saved. Refresh the project before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptRepairBusy = false;
      manuscriptReorderError = result.message;
      void refreshManuscriptStructure(rootPath, session, loreIndex);
      return;
    }
    manuscriptProject = result.project;
    manuscriptRepairUndo = result.undo;
    manuscriptSceneSplitUndo = null;
    manuscriptSceneMergeUndo = null;
    manuscriptRepairNotice = `Moved ${plan.target.itemTitle} ${plan.target.direction}. No Markdown file was changed.`;
    manuscriptRepairBusy = false;
    resetManuscriptReorder(true);
    focusManuscriptMutationItem(plan.target.itemId, manuscriptMutationSurface);
  }

  function canMoveManuscriptScene(itemId: string): boolean {
    return manuscriptSceneMoveDestinations(manuscriptProject, itemId).length > 0;
  }

  function beginManuscriptSceneMove(
    itemId: string,
    surface: "outline" | "corkboard" = "outline",
  ): void {
    if (!itemId || worldProjectBusy || manuscriptRepairBusy) return;
    const destinations = manuscriptSceneMoveDestinations(manuscriptProject, itemId);
    if (destinations.length === 0) {
      manuscriptRepairNotice = "This scene has no other legal container in its manuscript.";
      return;
    }
    manuscriptSceneMoveItemId = itemId;
    manuscriptSceneMoveBaseProject = manuscriptProject;
    manuscriptSceneMoveDestinationKey = destinations[0]!.key;
    manuscriptSceneMoveDestinationIndex = 0;
    manuscriptSceneMoveError = "";
    manuscriptMutationSurface = surface;
  }

  function selectManuscriptSceneMoveDestination(key: string): void {
    const destination = manuscriptSceneMoveDestinationsForDialog.find(
      (candidate) => candidate.key === key,
    );
    if (!destination || manuscriptRepairBusy) return;
    manuscriptSceneMoveDestinationKey = key;
    manuscriptSceneMoveDestinationIndex = 0;
    manuscriptSceneMoveError = "";
  }

  function resetManuscriptSceneMove(force = false): void {
    if (manuscriptRepairBusy && !force) return;
    manuscriptSceneMoveItemId = "";
    manuscriptSceneMoveBaseProject = null;
    manuscriptSceneMoveDestinationKey = "";
    manuscriptSceneMoveDestinationIndex = 0;
    manuscriptSceneMoveError = "";
  }

  function cancelManuscriptSceneMove(): void {
    const itemId = manuscriptSceneMoveItemId;
    const surface = manuscriptMutationSurface;
    resetManuscriptSceneMove();
    if (!itemId) return;
    void tick().then(() => {
      window.setTimeout(() => {
        document.getElementById(`move-scene-${surface}-${itemId}`)?.focus();
      }, 0);
    });
  }

  async function confirmManuscriptSceneMove(): Promise<void> {
    const plan = manuscriptSceneMovePlan;
    if (!folderPath || !loreIndex || manuscriptRepairBusy || plan?.kind !== "ready") return;
    const rootPath = folderPath;
    const session = loreIndexSession;
    manuscriptRepairBusy = true;
    manuscriptSceneMoveError = "";
    const result = await executeManuscriptSceneMove(plan, manuscriptRepairIo(rootPath));
    if (rootPath !== folderPath || session !== loreIndexSession) {
      manuscriptRepairBusy = false;
      resetManuscriptSceneMove(true);
      error = "The project changed while the scene container was being saved. Refresh the project before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptRepairBusy = false;
      manuscriptSceneMoveError = result.message;
      void refreshManuscriptStructure(rootPath, session, loreIndex);
      return;
    }
    const focusSurface = manuscriptMutationSurface;
    manuscriptProject = result.project;
    manuscriptRepairUndo = result.undo;
    manuscriptSceneSplitUndo = null;
    manuscriptSceneMergeUndo = null;
    manuscriptRepairNotice = `Moved ${plan.target.sceneTitle} to ${plan.target.destinationContainerLabel}. No Markdown file was changed.`;
    manuscriptRepairBusy = false;
    resetManuscriptSceneMove(true);
    focusManuscriptMutationItem(plan.target.sceneId, focusSurface);
  }

  async function beginManuscriptSceneSplit(): Promise<void> {
    if (!folderPath || !activeFilePath || worldProjectBusy || manuscriptRepairBusy) return;
    const openingPath = activeFilePath;
    await saveFile();
    if (openingPath !== activeFilePath) return;
    if (dirty || content !== persistedContent || saveState.phase === "error") {
      manuscriptRepairNotice = "Save this scene successfully before splitting it.";
      return;
    }
    const sourcePath = activeLorePath();
    const start = editorInput?.selectionStart ?? -1;
    const end = editorInput?.selectionEnd ?? -1;
    if (!sourcePath || start !== end) {
      manuscriptRepairNotice = "Place one collapsed caret inside a saved manuscript scene before splitting.";
      return;
    }
    let attempt = 2;
    let newSourcePath = suggestSplitScenePath(sourcePath, attempt);
    while (attempt < 100 && await exists(await join(folderPath, newSourcePath))) {
      attempt += 1;
      newSourcePath = suggestSplitScenePath(sourcePath, attempt);
    }
    const baseRequest: ManuscriptSceneSplitRequest = {
      sourcePath,
      sourceText: content,
      sourceFingerprint: fingerprintContent(content),
      caretOffset: start,
      newSceneId: crypto.randomUUID(),
      newSceneTitle: "New scene",
      newSourcePath,
    };
    const basePlan = planManuscriptSceneSplit(manuscriptProject, baseRequest);
    if (basePlan.kind !== "ready") {
      manuscriptRepairNotice = basePlan.reason;
      return;
    }
    manuscriptSceneSplitBaseProject = manuscriptProject;
    manuscriptSceneSplitRequest = {
      ...baseRequest,
      newSceneTitle: `${basePlan.target.sceneTitle} — continued`,
    };
    manuscriptSceneSplitError = "";
    manuscriptRepairNotice = "";
  }

  function updateManuscriptSceneSplitRequest(request: ManuscriptSceneSplitRequest): void {
    if (manuscriptSceneSplitBusy) return;
    manuscriptSceneSplitRequest = request;
    manuscriptSceneSplitError = "";
  }

  function resetManuscriptSceneSplit(force = false): void {
    if (manuscriptSceneSplitBusy && !force) return;
    manuscriptSceneSplitBaseProject = null;
    manuscriptSceneSplitRequest = null;
    manuscriptSceneSplitBusy = false;
    manuscriptSceneSplitError = "";
  }

  function closeManuscriptSceneSplit(): void {
    if (manuscriptSceneSplitBusy) return;
    const caret = manuscriptSceneSplitRequest?.caretOffset ?? 0;
    resetManuscriptSceneSplit();
    void tick().then(() => {
      editorInput?.focus({ preventScroll: true });
      editorInput?.setSelectionRange(caret, caret);
      editorSelectionStart = caret;
      editorSelectionEnd = caret;
    });
  }

  function manuscriptSceneSplitIo(rootPath: string): ManuscriptSceneSplitIo {
    return {
      reload: async () => {
        const scan = await scanProjectLore(rootPath, tauriLoreScanBackend);
        const currentIndex = await buildLoreProjectIndexCooperatively(scan.sources);
        return loadManuscriptProject(rootPath, tauriLoreScanBackend, {
          loreIndex: currentIndex,
        });
      },
      readSource: async (relativePath) => readTextFile(await join(rootPath, relativePath)),
      sourceExists: async (relativePath) => exists(await join(rootPath, relativePath)),
      splitAtomic: (request) =>
        invoke("split_manuscript_scene_atomic", {
          request: { rootPath, ...request },
        }),
      undoAtomic: (request) =>
        invoke("undo_manuscript_scene_split_atomic", {
          request: { rootPath, ...request },
        }),
    };
  }

  async function refreshSceneSplitDirectories(
    rootPath: string,
    ...relativePaths: string[]
  ): Promise<void> {
    const directories = new Set(
      relativePaths.map((relativePath) => {
        const separator = relativePath.lastIndexOf("/");
        return separator < 0 ? "" : relativePath.slice(0, separator);
      }),
    );
    for (const directory of directories) {
      await refreshDirectory(directory ? await join(rootPath, directory) : rootPath);
    }
  }

  async function confirmManuscriptSceneSplit(): Promise<void> {
    const plan = manuscriptSceneSplitPlan;
    if (!folderPath || !loreIndex || manuscriptSceneSplitBusy || plan?.kind !== "ready") return;
    const rootPath = folderPath;
    const session = loreIndexSession;
    const sourceAbsolutePath = activeFilePath;
    manuscriptSceneSplitBusy = true;
    manuscriptSceneSplitError = "";
    const result = await executeManuscriptSceneSplit(plan, manuscriptSceneSplitIo(rootPath));
    if (rootPath !== folderPath || session !== loreIndexSession || sourceAbsolutePath !== activeFilePath) {
      resetManuscriptSceneSplit(true);
      error = "The project or active scene changed while the split was running. Refresh before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptSceneSplitBusy = false;
      manuscriptSceneSplitError = result.message;
      void refreshLoreIndex(rootPath);
      return;
    }

    content = plan.leftSourceText;
    persistedContent = plan.leftSourceText;
    persistedContentByPath.set(sourceAbsolutePath, plan.leftSourceText);
    saveState = createSaveState();
    lastSaveFailure = null;
    forcedSave = null;
    practiceState = beginDailyPractice(plan.leftSourceText, practiceState.dailyWords);
    manuscriptProject = result.project;
    manuscriptRepairUndo = null;
    manuscriptSceneSplitUndo = null;
    manuscriptSceneMergeUndo = null;
    manuscriptRepairNotice = `Split ${plan.target.sceneTitle} into two scene files. Undo remains available until either scene or the structure changes.`;
    if (result.cleanupWarnings.length > 0) {
      appendError(`The split is verified, but temporary backup cleanup needs review: ${result.cleanupWarnings.join(" ")}`);
    }
    resetManuscriptSceneSplit(true);
    await refreshSceneSplitDirectories(rootPath, plan.target.sourcePath, plan.target.newSourcePath);
    await refreshLoreIndex(rootPath);
    manuscriptSceneSplitUndo = result.undo;
    await tick();
    editorInput?.focus({ preventScroll: true });
    editorInput?.setSelectionRange(content.length, content.length);
    editorSelectionStart = content.length;
    editorSelectionEnd = content.length;
  }

  async function undoLastManuscriptSceneSplit(): Promise<void> {
    const undo = manuscriptSceneSplitUndo;
    if (!folderPath || !loreIndex || !undo || manuscriptSceneSplitBusy) return;
    const activeRelativePath = activeLorePath();
    if (
      (activeRelativePath === undo.sourcePath || activeRelativePath === undo.destinationPath) &&
      (dirty || content !== persistedContent)
    ) {
      manuscriptRepairNotice = "Save or discard changes in the split scenes before using Undo.";
      return;
    }
    const rootPath = folderPath;
    const session = loreIndexSession;
    manuscriptSceneSplitBusy = true;
    const result = await undoManuscriptSceneSplit(undo, manuscriptSceneSplitIo(rootPath));
    if (rootPath !== folderPath || session !== loreIndexSession) {
      manuscriptSceneSplitBusy = false;
      manuscriptSceneSplitUndo = null;
      error = "The project changed while scene-split Undo was running. Refresh before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptSceneSplitBusy = false;
      manuscriptSceneSplitUndo = null;
      manuscriptRepairNotice = result.message;
      void refreshLoreIndex(rootPath);
      return;
    }

    const sourceAbsolutePath = await join(rootPath, undo.sourcePath);
    const destinationAbsolutePath = await join(rootPath, undo.destinationPath);
    persistedContentByPath.set(sourceAbsolutePath, undo.restoredSourceText);
    persistedContentByPath.delete(destinationAbsolutePath);
    if (activeRelativePath === undo.sourcePath || activeRelativePath === undo.destinationPath) {
      activeFilePath = sourceAbsolutePath;
      activeFile = undo.sourcePath.split("/").at(-1) ?? undo.sourcePath;
      content = undo.restoredSourceText;
      persistedContent = undo.restoredSourceText;
      saveState = createSaveState();
      practiceState = beginDailyPractice(content, practiceState.dailyWords);
      editorSelectionStart = 0;
      editorSelectionEnd = 0;
    }
    manuscriptProject = result.project;
    manuscriptSceneSplitUndo = null;
    manuscriptRepairNotice = "The scene split was undone exactly; the unchanged right-hand file was removed.";
    manuscriptSceneSplitBusy = false;
    if (result.cleanupWarnings.length > 0) {
      appendError(`Undo is verified, but temporary backup cleanup needs review: ${result.cleanupWarnings.join(" ")}`);
    }
    await refreshSceneSplitDirectories(rootPath, undo.sourcePath, undo.destinationPath);
    await refreshLoreIndex(rootPath);
  }

  function canMergeManuscriptScene(itemId: string): boolean {
    return manuscriptSceneMergeAvailableIds.has(itemId);
  }

  async function beginManuscriptSceneMerge(
    itemId: string,
    surface: "outline" | "corkboard" = "outline",
  ): Promise<void> {
    if (!folderPath || !itemId || worldProjectBusy || manuscriptRepairBusy) return;
    let availability = manuscriptSceneMergeAvailability(manuscriptProject, itemId);
    if (availability.kind !== "available") {
      manuscriptRepairNotice = availability.reason;
      return;
    }
    const activeRelativePath = activeLorePath();
    if (
      (activeRelativePath === availability.leftSourcePath ||
        activeRelativePath === availability.rightSourcePath) &&
      (dirty || content !== persistedContent)
    ) {
      await saveFile();
      if (dirty || content !== persistedContent || saveState.phase === "error") {
        manuscriptRepairNotice = "Save the affected scene successfully before merging.";
        return;
      }
    }

    const rootPath = folderPath;
    const io = manuscriptSceneMergeIo(rootPath);
    let current: ManuscriptProjectLoadResult;
    try {
      current = await io.reload();
    } catch (cause) {
      manuscriptRepairNotice = `The manuscript could not be refreshed for merge: ${formatError(cause)}`;
      return;
    }
    if (rootPath !== folderPath) return;
    availability = manuscriptSceneMergeAvailability(current, itemId);
    if (availability.kind !== "available") {
      manuscriptRepairNotice = availability.reason;
      return;
    }

    let leftSourceText: string;
    let rightSourceText: string;
    try {
      [leftSourceText, rightSourceText] = await Promise.all([
        io.readSource(availability.leftSourcePath),
        io.readSource(availability.rightSourcePath),
      ]);
    } catch (cause) {
      manuscriptRepairNotice = `Both scene sources must be readable before merging: ${formatError(cause)}`;
      return;
    }
    if (
      fingerprintContent(leftSourceText) !== availability.leftSourceFingerprint ||
      fingerprintContent(rightSourceText) !== availability.rightSourceFingerprint
    ) {
      manuscriptRepairNotice = "One of the adjacent scenes changed while the merge was opening. Refresh and try again.";
      void refreshLoreIndex(rootPath);
      return;
    }

    let attempt = 1;
    let retiredSourcePath = suggestRetiredScenePath(availability.rightSourcePath, attempt);
    try {
      while (attempt < 100 && await io.sourceExists(retiredSourcePath)) {
        attempt += 1;
        retiredSourcePath = suggestRetiredScenePath(availability.rightSourcePath, attempt);
      }
      if (await io.sourceExists(retiredSourcePath)) {
        manuscriptRepairNotice = "A non-colliding visible retirement path could not be found safely.";
        return;
      }
    } catch (cause) {
      manuscriptRepairNotice = `The retirement destination could not be checked safely: ${formatError(cause)}`;
      return;
    }

    const request: ManuscriptSceneMergeRequest = {
      leftSceneId: itemId,
      leftSourceText,
      leftSourceFingerprint: availability.leftSourceFingerprint,
      rightSourceText,
      rightSourceFingerprint: availability.rightSourceFingerprint,
      join: "blank-line",
      retiredSourcePath,
    };
    const plan = planManuscriptSceneMerge(current, request);
    if (plan.kind !== "ready") {
      manuscriptRepairNotice = plan.reason;
      return;
    }
    manuscriptSceneMergeBaseProject = current;
    manuscriptSceneMergeRequest = request;
    manuscriptSceneMergeError = "";
    manuscriptRepairNotice = "";
    manuscriptMutationSurface = surface;
  }

  function updateManuscriptSceneMergeRequest(request: ManuscriptSceneMergeRequest): void {
    if (manuscriptSceneMergeBusy) return;
    manuscriptSceneMergeRequest = request;
    manuscriptSceneMergeError = "";
  }

  function resetManuscriptSceneMerge(force = false): void {
    if (manuscriptSceneMergeBusy && !force) return;
    manuscriptSceneMergeBaseProject = null;
    manuscriptSceneMergeRequest = null;
    manuscriptSceneMergeBusy = false;
    manuscriptSceneMergeError = "";
  }

  function closeManuscriptSceneMerge(): void {
    if (manuscriptSceneMergeBusy) return;
    const itemId = manuscriptSceneMergeRequest?.leftSceneId ?? "";
    const surface = manuscriptMutationSurface;
    resetManuscriptSceneMerge();
    if (!itemId) return;
    void tick().then(() => {
      document.getElementById(`merge-scene-${surface}-${itemId}`)?.focus();
    });
  }

  function manuscriptSceneMergeIo(rootPath: string): ManuscriptSceneMergeIo {
    return {
      reload: async () => {
        const scan = await scanProjectLore(rootPath, tauriLoreScanBackend);
        const currentIndex = await buildLoreProjectIndexCooperatively(scan.sources);
        return loadManuscriptProject(rootPath, tauriLoreScanBackend, {
          loreIndex: currentIndex,
        });
      },
      readSource: async (relativePath) => readTextFile(await join(rootPath, relativePath)),
      sourceExists: async (relativePath) => exists(await join(rootPath, relativePath)),
      mergeAtomic: (request) =>
        invoke("merge_manuscript_scenes_atomic", {
          request: { rootPath, ...request },
        }),
      undoAtomic: (request) =>
        invoke("undo_manuscript_scene_merge_atomic", {
          request: { rootPath, ...request },
        }),
    };
  }

  async function confirmManuscriptSceneMerge(): Promise<void> {
    const plan = manuscriptSceneMergePlan;
    if (!folderPath || !loreIndex || manuscriptSceneMergeBusy || plan?.kind !== "ready") return;
    const rootPath = folderPath;
    const session = loreIndexSession;
    const activeRelativePath = activeLorePath();
    manuscriptSceneMergeBusy = true;
    manuscriptSceneMergeError = "";
    const result = await executeManuscriptSceneMerge(plan, manuscriptSceneMergeIo(rootPath));
    if (rootPath !== folderPath || session !== loreIndexSession) {
      resetManuscriptSceneMerge(true);
      error = "The project changed while the scene merge was running. Refresh before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptSceneMergeBusy = false;
      manuscriptSceneMergeError = result.message;
      void refreshLoreIndex(rootPath);
      return;
    }

    const leftAbsolutePath = await join(rootPath, plan.target.leftSourcePath);
    const rightAbsolutePath = await join(rootPath, plan.target.rightSourcePath);
    const retiredAbsolutePath = await join(rootPath, plan.target.retiredSourcePath);
    persistedContentByPath.set(leftAbsolutePath, plan.mergedSourceText);
    persistedContentByPath.delete(rightAbsolutePath);
    persistedContentByPath.set(retiredAbsolutePath, plan.originalRightSourceText);
    if (
      activeRelativePath === plan.target.leftSourcePath ||
      activeRelativePath === plan.target.rightSourcePath
    ) {
      activeFilePath = leftAbsolutePath;
      activeFile = plan.target.leftSourcePath.split("/").at(-1) ?? plan.target.leftSourcePath;
      content = plan.mergedSourceText;
      persistedContent = plan.mergedSourceText;
      saveState = createSaveState();
      lastSaveFailure = null;
      forcedSave = null;
      practiceState = beginDailyPractice(content, practiceState.dailyWords);
      editorSelectionStart = 0;
      editorSelectionEnd = 0;
    }
    manuscriptProject = result.project;
    manuscriptRepairUndo = null;
    manuscriptSceneSplitUndo = null;
    manuscriptSceneMergeUndo = null;
    manuscriptRepairNotice = `Merged ${plan.target.leftSceneTitle} with ${plan.target.rightSceneTitle}. The exact right source is visible at ${plan.target.retiredSourcePath}.`;
    if (result.cleanupWarnings.length > 0) {
      appendError(`The merge is verified, but temporary backup cleanup needs review: ${result.cleanupWarnings.join(" ")}`);
    }
    const focusSurface = manuscriptMutationSurface;
    resetManuscriptSceneMerge(true);
    await refreshSceneSplitDirectories(
      rootPath,
      plan.target.leftSourcePath,
      plan.target.rightSourcePath,
      plan.target.retiredSourcePath,
    );
    await refreshLoreIndex(rootPath);
    manuscriptSceneMergeUndo = result.undo;
    focusManuscriptMutationItem(plan.target.leftSceneId, focusSurface);
  }

  async function undoLastManuscriptSceneMerge(): Promise<void> {
    const undo = manuscriptSceneMergeUndo;
    if (!folderPath || !loreIndex || !undo || manuscriptSceneMergeBusy) return;
    const activeRelativePath = activeLorePath();
    if (
      activeRelativePath !== null &&
      [undo.leftPath, undo.rightPath, undo.retiredPath].includes(activeRelativePath) &&
      (dirty || content !== persistedContent)
    ) {
      manuscriptRepairNotice = "Save or discard changes in the merged or retired scene before using Undo.";
      return;
    }
    const rootPath = folderPath;
    const session = loreIndexSession;
    manuscriptSceneMergeBusy = true;
    const result = await undoManuscriptSceneMerge(undo, manuscriptSceneMergeIo(rootPath));
    if (rootPath !== folderPath || session !== loreIndexSession) {
      manuscriptSceneMergeBusy = false;
      manuscriptSceneMergeUndo = null;
      error = "The project changed while scene-merge Undo was running. Refresh before continuing.";
      return;
    }
    if (result.kind === "failed") {
      manuscriptSceneMergeBusy = false;
      manuscriptSceneMergeUndo = null;
      manuscriptRepairNotice = result.message;
      void refreshLoreIndex(rootPath);
      return;
    }

    const leftAbsolutePath = await join(rootPath, undo.leftPath);
    const rightAbsolutePath = await join(rootPath, undo.rightPath);
    const retiredAbsolutePath = await join(rootPath, undo.retiredPath);
    persistedContentByPath.set(leftAbsolutePath, undo.restoredLeftText);
    persistedContentByPath.set(rightAbsolutePath, undo.restoredRightText);
    persistedContentByPath.delete(retiredAbsolutePath);
    if (activeRelativePath === undo.leftPath) {
      activeFilePath = leftAbsolutePath;
      activeFile = undo.leftPath.split("/").at(-1) ?? undo.leftPath;
      content = undo.restoredLeftText;
      persistedContent = undo.restoredLeftText;
      saveState = createSaveState();
      practiceState = beginDailyPractice(content, practiceState.dailyWords);
      editorSelectionStart = 0;
      editorSelectionEnd = 0;
    } else if (activeRelativePath === undo.retiredPath) {
      activeFilePath = rightAbsolutePath;
      activeFile = undo.rightPath.split("/").at(-1) ?? undo.rightPath;
      content = undo.restoredRightText;
      persistedContent = undo.restoredRightText;
      saveState = createSaveState();
      practiceState = beginDailyPractice(content, practiceState.dailyWords);
      editorSelectionStart = 0;
      editorSelectionEnd = 0;
    }
    manuscriptProject = result.project;
    manuscriptSceneMergeUndo = null;
    manuscriptRepairNotice = "The scene merge was undone exactly; both Markdown sources and their structure entry were restored.";
    manuscriptSceneMergeBusy = false;
    if (result.cleanupWarnings.length > 0) {
      appendError(`Undo is verified, but temporary backup cleanup needs review: ${result.cleanupWarnings.join(" ")}`);
    }
    await refreshSceneSplitDirectories(rootPath, undo.leftPath, undo.rightPath, undo.retiredPath);
    await refreshLoreIndex(rootPath);
  }

  function focusManuscriptMutationItem(
    itemId: string,
    surface: "outline" | "corkboard",
  ): void {
    if (surface === "corkboard" && manuscriptCorkboardId) {
      manuscriptCorkboardFocusItemId = itemId;
      manuscriptCorkboardFocusRevision += 1;
      return;
    }
    manuscriptOutlineFocusItemId = itemId;
    manuscriptOutlineFocusRevision += 1;
  }

  function openManuscriptCorkboard(manuscriptId: string): void {
    if (
      manuscriptProject.kind !== "ready" ||
      !manuscriptProject.reconciled.manuscripts.some(
        (entry) => entry.manuscript.id === manuscriptId,
      )
    ) {
      manuscriptRepairNotice = "That manuscript is not available in the current verified structure.";
      return;
    }
    dismissLoreCompletion();
    manuscriptCorkboardEditorSelection = {
      start: editorInput?.selectionStart ?? 0,
      end: editorInput?.selectionEnd ?? 0,
    };
    manuscriptCorkboardFocusItemId = "";
    manuscriptCorkboardId = manuscriptId;
  }

  function closeManuscriptCorkboard(): void {
    const manuscriptId = manuscriptCorkboardId;
    manuscriptCorkboardId = "";
    void tick().then(() => {
      document.getElementById(`open-corkboard-${manuscriptId}`)?.focus();
    });
  }

  async function openManuscriptSourceFromCorkboard(
    path: string,
    fingerprint: string,
  ): Promise<void> {
    manuscriptCorkboardId = "";
    await tick();
    await openManuscriptSource(path, fingerprint);
  }

  async function preferredManuscriptImportDirectory(): Promise<string> {
    if (!folderPath) return "";
    if (projectInspection.kind === "world-project") {
      const preferred = projectInspection.manifest.folders.manuscript;
      if (preferred && (await resolveRealProjectDirectory(preferred))) {
        return preferred;
      }
    }
    const selected = projectRelativePath(
      folderPath,
      selectedDirectoryPath || folderPath,
    );
    if (selected) return selected;
    const conventional = entries.find(
      (entry) =>
        entry.name.localeCompare("Manuscript", undefined, { sensitivity: "base" }) === 0 &&
        entry.isDirectory &&
        !entry.isFile &&
        !entry.isSymlink,
    );
    return conventional?.name ?? "";
  }

  async function startManuscriptCreation(): Promise<void> {
    if (
      !folderPath ||
      manuscriptProject.kind !== "absent" ||
      loreIndexPhase !== "ready" ||
      !loreIndex ||
      worldProjectBusy
    ) {
      return;
    }
    manuscriptCreationVisible = true;
    manuscriptCreationMode = "import";
    manuscriptCreationTitle =
      projectInspection.kind === "world-project"
        ? projectInspection.manifest.name
        : folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "My Manuscript";
    manuscriptCreationImportDirectory = await preferredManuscriptImportDirectory();
    manuscriptCreationBasePlan = null;
    manuscriptCreationError = "";
    await refreshManuscriptCreationPreview();
  }

  function resetManuscriptCreation(force = false): void {
    if (manuscriptCreationBusy && !force) return;
    manuscriptCreationRevision += 1;
    manuscriptCreationVisible = false;
    manuscriptCreationMode = "import";
    manuscriptCreationTitle = "";
    manuscriptCreationImportDirectory = "";
    manuscriptCreationBasePlan = null;
    manuscriptCreationPlanning = false;
    manuscriptCreationBusy = false;
    manuscriptCreationError = "";
  }

  function setManuscriptCreationMode(mode: ManuscriptCreationMode): void {
    if (manuscriptCreationBusy || mode === manuscriptCreationMode) return;
    manuscriptCreationMode = mode;
    manuscriptCreationError = "";
    void refreshManuscriptCreationPreview();
  }

  async function refreshManuscriptCreationPreview(): Promise<void> {
    if (!manuscriptCreationVisible || !folderPath) return;
    const rootPath = folderPath;
    const revision = ++manuscriptCreationRevision;
    manuscriptCreationPlanning = true;
    manuscriptCreationError = "";
    try {
      const plan = await planManuscriptCreation({
        rootPath,
        importDirectory: manuscriptCreationImportDirectory,
        title: manuscriptCreationTitle,
        mode: manuscriptCreationMode,
        backend: tauriLoreScanBackend,
        loreIndex,
        createId: () => crypto.randomUUID(),
      });
      if (
        revision !== manuscriptCreationRevision ||
        rootPath !== folderPath ||
        !manuscriptCreationVisible
      ) {
        return;
      }
      manuscriptCreationBasePlan = plan;
    } catch (cause) {
      if (revision !== manuscriptCreationRevision || !manuscriptCreationVisible) return;
      manuscriptCreationBasePlan = null;
      manuscriptCreationError = `The preview could not be prepared safely: ${formatError(cause)}`;
    } finally {
      if (revision === manuscriptCreationRevision) manuscriptCreationPlanning = false;
    }
  }

  async function confirmManuscriptCreation(): Promise<void> {
    const plan = manuscriptCreationPlan;
    if (
      !folderPath ||
      !manuscriptCreationVisible ||
      manuscriptCreationBusy ||
      plan?.kind !== "ready"
    ) {
      return;
    }
    const rootPath = folderPath;
    const session = loreIndexSession;
    let created = false;
    manuscriptCreationBusy = true;
    manuscriptCreationError = "";
    try {
      const verified = await verifyManuscriptCreationPlan(
        rootPath,
        plan as ReadyManuscriptCreationPlan,
        tauriLoreScanBackend,
        loreIndex,
      );
      if (verified.kind === "blocked") {
        manuscriptCreationError = `Nothing was written. ${verified.issues
          .slice(0, 5)
          .map((issue) => `${issue.path || "Project root"}: ${issue.message}`)
          .join(" ")}`;
        return;
      }
      await writeTextFile(
        await join(rootPath, MANUSCRIPT_STRUCTURE_FILE),
        verified.text,
        { createNew: true },
      );
      created = true;
      resetManuscriptCreation(true);
      await refreshDirectory(rootPath);
      await refreshManuscriptStructure(rootPath, session, loreIndex);
    } catch (cause) {
      if (created) {
        error = `The manuscript structure was created safely, but the project view could not refresh: ${formatError(cause)}. Reopen the folder or refresh the outline to try again.`;
      } else {
        manuscriptCreationError = `Nothing existing was changed. The structure could not be created: ${formatError(cause)}`;
      }
    } finally {
      manuscriptCreationBusy = false;
    }
  }

  function mergeReconciledScanIssues(
    existing: readonly LoreScanIssue[],
    incoming: readonly LoreScanIssue[],
    changedPaths: readonly string[],
  ): LoreScanIssue[] {
    const untouched = existing.filter(
      (issue) =>
        !changedPaths.some(
          (path) =>
            !path ||
            !issue.path ||
            issue.path === path ||
            issue.path.startsWith(`${path}/`) ||
            path.startsWith(`${issue.path}/`),
        ),
    );
    return [...untouched, ...incoming].filter(
      (issue, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.kind === issue.kind &&
            candidate.path === issue.path &&
            candidate.message === issue.message,
        ) === index,
    );
  }

  function pathsOverlap(first: string, second: string): boolean {
    return (
      !first ||
      !second ||
      first === second ||
      first.startsWith(`${second}/`) ||
      second.startsWith(`${first}/`)
    );
  }

  function activeLorePath(path = activeFilePath): string | null {
    if (!folderPath || !path) return null;
    const relativePath = projectRelativePath(folderPath, path);
    return relativePath && isMarkdownPath(relativePath) ? relativePath : null;
  }

  function captureLoreNavigationLocation(): LoreNavigationLocation {
    const editorPath = folderPath && activeFilePath
      ? projectRelativePath(folderPath, activeFilePath)
      : null;
    const readyReference = loreReference?.phase === "ready" ? loreReference : null;
    return {
      editorPath,
      editorFingerprint: editorPath ? fingerprintContent(content) : null,
      selectionStart: editorInput?.selectionStart ?? 0,
      selectionEnd: editorInput?.selectionEnd ?? 0,
      referencePath: readyReference?.path ?? null,
      referenceFingerprint: readyReference?.fingerprint ?? null,
    };
  }

  function recordLoreNavigation(
    from: LoreNavigationLocation,
  ): void {
    if (restoringLoreHistory) return;
    const to = captureLoreNavigationLocation();
    if (!from.editorPath || !to.editorPath) return;
    loreNavigationHistory.recordTransition(
      from,
      to,
    );
    loreHistoryRevision += 1;
    loreHistoryNotice = "";
  }

  async function historySourceMatches(
    relativePath: string,
    fingerprint: string | null,
  ): Promise<boolean> {
    if (!folderPath || !fingerprint) return false;
    if (
      activeFilePath &&
      projectRelativePath(folderPath, activeFilePath) === relativePath
    ) {
      return fingerprintContent(content) === fingerprint;
    }
    if (isMarkdownPath(relativePath)) {
      const record = loreIndex?.documents.get(relativePath);
      if (!record || record.fingerprint !== fingerprint) return false;
    }
    try {
      const path = await join(folderPath, ...relativePath.split("/"));
      const entry = findTreeEntry(entries, path);
      if (entry?.isSymlink) return false;
      return fingerprintContent(await readTextFile(path)) === fingerprint;
    } catch {
      return false;
    }
  }

  async function restoreLoreNavigationLocation(
    location: LoreNavigationLocation,
  ): Promise<boolean> {
    if (!folderPath || !location.editorPath) return false;
    if (
      !(await historySourceMatches(
        location.editorPath,
        location.editorFingerprint,
      ))
    ) {
      return false;
    }
    if (
      location.referencePath &&
      !(await historySourceMatches(
        location.referencePath,
        location.referenceFingerprint,
      ))
    ) {
      return false;
    }

    const editorAbsolute = await join(
      folderPath,
      ...location.editorPath.split("/"),
    );
    if (activeFilePath !== editorAbsolute) {
      const segments = location.editorPath.split("/");
      const known = findTreeEntry(entries, editorAbsolute);
      const opened = await openFile(
        known ?? {
          name: segments.at(-1) ?? location.editorPath,
          path: editorAbsolute,
          isFile: true,
          isDirectory: false,
          isSymlink: false,
          expanded: false,
          children: null,
        },
        false,
      );
      if (!opened) return false;
    }
    if (fingerprintContent(content) !== location.editorFingerprint) return false;

    if (location.referencePath) {
      const opened = await openLoreReference(location.referencePath, false, false);
      if (
        !opened ||
        loreReference?.phase !== "ready" ||
        loreReference.fingerprint !== location.referenceFingerprint
      ) {
        return false;
      }
    } else {
      closeLoreReference(false, false);
    }
    await tick();
    if (!editorInput) return false;
    const start = Math.min(location.selectionStart, editorInput.value.length);
    const end = Math.min(location.selectionEnd, editorInput.value.length);
    editorInput.setSelectionRange(start, Math.max(start, end));
    if (location.referencePath) await focusLoreReference();
    else editorInput.focus();
    return true;
  }

  async function goThroughLoreHistory(
    direction: "back" | "forward",
  ): Promise<void> {
    if (restoringLoreHistory || worldProjectBusy || quickOpenVisible || loreRenameSourcePath) {
      return;
    }
    loreNavigationHistory.replaceCurrent(captureLoreNavigationLocation());
    loreHistoryRevision += 1;
    restoringLoreHistory = true;
    let skipped = 0;
    try {
      let target = loreNavigationHistory.peek(direction);
      while (target) {
        if (await restoreLoreNavigationLocation(target)) {
          loreNavigationHistory.commit(direction);
          loreHistoryRevision += 1;
          const destination = target.referencePath ?? target.editorPath ?? "prior writing context";
          loreHistoryNotice = `${skipped ? `Skipped ${skipped} changed or unavailable ${skipped === 1 ? "entry" : "entries"}. ` : ""}${direction === "back" ? "Back" : "Forward"} to ${destination}.`;
          return;
        }
        loreNavigationHistory.dropCandidate(direction);
        loreHistoryRevision += 1;
        skipped += 1;
        target = loreNavigationHistory.peek(direction);
      }
      loreHistoryNotice = skipped
        ? `Skipped ${skipped} changed or unavailable ${skipped === 1 ? "entry" : "entries"}; there is nowhere else to go ${direction}.`
        : `There is nowhere to go ${direction} in this session.`;
    } finally {
      restoringLoreHistory = false;
    }
  }

  function loreCompletionSignature(
    context: WikiLinkCompletionContext,
  ): string {
    return [
      activeFilePath,
      context.linkStart,
      context.replaceStart,
      context.replaceEnd,
      context.mode,
      context.noteTarget,
      context.query,
    ].join("\u0000");
  }

  function clearLoreCompletion(): void {
    loreCompletionContext = null;
    loreCompletionItems = [];
    loreCompletionSelectedIndex = 0;
  }

  function updateLoreCompletion(textarea = editorInput): void {
    const sourcePath = activeLorePath();
    if (!textarea || !loreIndex || !sourcePath) {
      clearLoreCompletion();
      return;
    }
    const context = findWikiLinkCompletion(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    if (
      !context ||
      loreCompletionSignature(context) === dismissedLoreCompletion
    ) {
      clearLoreCompletion();
      return;
    }
    const selectedKey = loreCompletionItems[loreCompletionSelectedIndex]?.key;
    const items = loreCompletionCandidates(loreIndex, sourcePath, context);
    if (items.length === 0) {
      clearLoreCompletion();
      return;
    }
    loreCompletionContext = context;
    loreCompletionItems = items;
    const retainedIndex = selectedKey
      ? items.findIndex(({ key }) => key === selectedKey)
      : -1;
    loreCompletionSelectedIndex = retainedIndex === -1 ? 0 : retainedIndex;
  }

  function dismissLoreCompletion(): void {
    if (loreCompletionContext) {
      dismissedLoreCompletion = loreCompletionSignature(loreCompletionContext);
    }
    clearLoreCompletion();
  }

  async function acceptLoreCompletion(
    candidate = loreCompletionItems[loreCompletionSelectedIndex],
  ): Promise<void> {
    const textarea = editorInput;
    const context = loreCompletionContext;
    if (!textarea || !context || !candidate) return;

    insertingLoreCompletion = true;
    textarea.focus();
    textarea.setSelectionRange(context.replaceStart, context.replaceEnd);
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, candidate.insertText);
    } catch {
      inserted = false;
    }
    if (!inserted) {
      textarea.setRangeText(
        candidate.insertText,
        context.replaceStart,
        context.replaceEnd,
        "end",
      );
    }
    if (textarea.value !== content) {
      textarea.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: candidate.insertText,
          inputType: "insertText",
        }),
      );
    }
    insertingLoreCompletion = false;
    await tick();
    const acceptedContext = findWikiLinkCompletion(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    dismissedLoreCompletion = acceptedContext
      ? loreCompletionSignature(acceptedContext)
      : "";
    clearLoreCompletion();
    textarea.focus();
  }

  function handleEditorKeydown(event: KeyboardEvent): void {
    if (event.isComposing || loreCompletionItems.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      loreCompletionSelectedIndex =
        (loreCompletionSelectedIndex + direction + loreCompletionItems.length) %
        loreCompletionItems.length;
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      void acceptLoreCompletion();
    } else if (event.key === "Escape") {
      event.preventDefault();
      dismissLoreCompletion();
    }
  }

  function handleEditorCaretChange(event: Event): void {
    if (insertingLoreCompletion) return;
    const textarea = event.currentTarget as HTMLTextAreaElement;
    editorSelectionStart = textarea.selectionStart;
    editorSelectionEnd = textarea.selectionEnd;
    updateLoreCompletion(textarea);
  }

  async function openLoreConnection(item: LoreConnectionItem): Promise<void> {
    if (!item.targetPath) return;
    if (item.direction === "outgoing") {
      await openLoreReference(item.targetPath);
    } else {
      await openIndexedLorePath(item.targetPath, item.targetRange);
    }
  }

  async function openLoreMention(mention: LoreUnlinkedMention): Promise<void> {
    await openLoreReference(mention.targetPath);
  }

  async function openLoreSearchResult(result: LoreSearchResult): Promise<void> {
    closeQuickOpen(false);
    await openIndexedLorePath(result.path, result.range);
  }

  async function referenceLoreSearchResult(result: LoreSearchResult): Promise<void> {
    closeQuickOpen(false);
    await openLoreReference(result.path);
  }

  async function openIndexedLorePath(
    relativePath: string,
    targetRange: SourceRange | null,
    historyOrigin = captureLoreNavigationLocation(),
  ): Promise<boolean> {
    if (!folderPath) return false;
    try {
      const targetFingerprint = loreIndex?.documents.get(relativePath)?.fingerprint;
      const segments = relativePath.split("/");
      const path = await join(folderPath, ...segments);
      const known = findTreeEntry(entries, path);
      const opened = await openFile(
        known ?? {
          name: segments.at(-1) ?? relativePath,
          path,
          isFile: true,
          isDirectory: false,
          isSymlink: false,
          expanded: false,
          children: null,
        },
        false,
      );
      if (!opened) return false;
      await tick();
      if (activeFilePath !== path || !editorInput) return false;
      const range =
        targetFingerprint && fingerprintContent(content) === targetFingerprint
          ? targetRange
          : null;
      const start = Math.min(range?.start ?? 0, editorInput.value.length);
      const end = Math.min(range?.end ?? start, editorInput.value.length);
      editorInput.focus();
      editorInput.setSelectionRange(start, end);
      updateLoreCompletion(editorInput);
      recordLoreNavigation(historyOrigin);
      return true;
    } catch (cause) {
      error = `Could not open indexed note: ${formatError(cause)}`;
      return false;
    }
  }

  async function openLoreReference(
    relativePath: string,
    focus = true,
    recordHistory = focus,
  ): Promise<boolean> {
    if (!folderPath || !loreIndex) return false;
    const historyOrigin = recordHistory
      ? captureLoreNavigationLocation()
      : null;
    const request = loreReferenceRequests.begin(relativePath);
    const rootAtStart = folderPath;
    const sessionAtStart = loreIndexSession;
    const indexAtStart = loreIndex;
    loreReference = { phase: "loading", path: relativePath };

    const activePath = activeLorePath();
    const activeRecord = indexAtStart.documents.get(relativePath);
    if (
      relativePath === activePath &&
      activeRecord &&
      activeRecord.fingerprint === fingerprintContent(content)
    ) {
      loreReference = {
        phase: "ready",
        path: relativePath,
        title: activeRecord.title,
        text: content,
        fingerprint: activeRecord.fingerprint,
      };
      if (focus) await focusLoreReference();
      if (historyOrigin) recordLoreNavigation(historyOrigin);
      return true;
    }

    try {
      const loaded = await loadLoreReferenceSource({
        rootPath: rootAtStart,
        relativePath,
        currentIndex: indexAtStart,
        backend: tauriLoreScanBackend,
      });
      if (
        !loreReferenceRequests.isCurrent(request) ||
        rootAtStart !== folderPath ||
        sessionAtStart !== loreIndexSession
      ) {
        return false;
      }
      if (loaded.changes.size > 0) {
        loreIndex = sessionAtStart.applyDiskChanges(loaded.changes);
      }
      loreScanIssues = mergeReconciledScanIssues(
        loreScanIssues,
        loaded.issues,
        [relativePath],
      );
      loreReference = loaded.kind === "ready"
        ? {
            phase: "ready",
            path: loaded.path,
            title: loaded.title,
            text: loaded.text,
            fingerprint: loaded.fingerprint,
          }
        : {
            phase: loaded.kind,
            path: loaded.path,
            message: loaded.message,
          };
      if (focus) await focusLoreReference();
      if (historyOrigin && loreReference.phase === "ready") {
        recordLoreNavigation(historyOrigin);
      }
      return loreReference.phase === "ready";
    } catch (cause) {
      if (!loreReferenceRequests.isCurrent(request)) return false;
      loreReference = {
        phase: "error",
        path: relativePath,
        message: `The reference could not be opened safely: ${formatError(cause)}`,
      };
      if (focus) await focusLoreReference();
      return false;
    }
  }

  async function focusLoreReference(): Promise<void> {
    await tick();
    document.getElementById("lore-reference-pane")?.focus({ preventScroll: true });
  }

  function closeLoreReference(
    returnToEditor = true,
    recordHistory = returnToEditor,
  ): void {
    if (!loreReference) return;
    const historyOrigin = recordHistory
      ? captureLoreNavigationLocation()
      : null;
    loreReferenceRequests.invalidate();
    loreReference = null;
    if (historyOrigin) recordLoreNavigation(historyOrigin);
    if (returnToEditor) void tick().then(() => editorInput?.focus());
  }

  async function openReferenceInEditor(path: string): Promise<void> {
    const historyOrigin = captureLoreNavigationLocation();
    closeLoreReference(false);
    await openIndexedLorePath(path, null, historyOrigin);
  }

  function beginLoreRename(path: string): void {
    if (!loreIndex) return;
    if (dirty) {
      error = "Save or resolve the active draft before previewing a multi-file lore rename.";
      editorInput?.focus();
      return;
    }
    closeQuickOpen(false);
    loreRenameSourcePath = path;
    loreRenameRequestedPath = path;
    loreRenameBusy = false;
    loreRenameError = "";
    error = "";
  }

  function closeLoreRename(returnFocus = true): void {
    if (loreRenameBusy) return;
    loreRenameSourcePath = "";
    loreRenameRequestedPath = "";
    loreRenameError = "";
    if (returnFocus) {
      void tick().then(() =>
        document.getElementById("lore-reference-pane")?.focus({ preventScroll: true }),
      );
    }
  }

  async function confirmLoreRename(): Promise<void> {
    if (
      !folderPath ||
      !loreIndex ||
      !loreRenamePlan ||
      loreRenamePlan.kind !== "ready" ||
      loreRenameBusy
    ) {
      return;
    }
    if (dirty) {
      loreRenameError = "The active draft changed after the preview. Save or resolve it before renaming.";
      return;
    }
    const currentPlan = planLoreRename(
      loreIndex,
      loreRenamePlan.sourcePath,
      loreRenamePlan.targetPath,
    );
    if (
      currentPlan.kind !== "ready" ||
      currentPlan.signature !== loreRenamePlan.signature
    ) {
      loreRenameError = "The lore index changed after the preview, so nothing was renamed. Review the refreshed plan.";
      return;
    }

    const activeRelative = activeLorePath();
    const selectionStart = editorInput?.selectionStart ?? 0;
    const selectionEnd = editorInput?.selectionEnd ?? selectionStart;
    const rootAtStart = folderPath;
    const sessionAtStart = loreIndexSession;
    loreRenameBusy = true;
    const absolutePath = async (relativePath: string): Promise<string> =>
      join(rootAtStart, ...relativePath.split("/"));
    const result = await executeLoreRename(currentPlan, {
      readText: async (relativePath) => readTextFile(await absolutePath(relativePath)),
      writeText: async (relativePath, text) =>
        writeTextFile(await absolutePath(relativePath), text),
      renameNoClobber: async (sourcePath, targetPath) =>
        invoke("rename_lore_file_no_clobber", {
          rootPath: rootAtStart,
          sourceRelative: sourcePath,
          targetRelative: targetPath,
        }),
    });
    if (
      rootAtStart !== folderPath ||
      sessionAtStart !== loreIndexSession
    ) {
      loreRenameBusy = false;
      error = "The project changed while the rename was running. Refresh the project before continuing.";
      return;
    }
    if (result.kind === "failed") {
      loreRenameBusy = false;
      loreRenameError = result.message;
      if (!result.rollbackComplete) {
        error = result.message;
        void refreshLoreIndex();
      }
      return;
    }

    const diskChanges = new Map<string, string | null>();
    diskChanges.set(currentPlan.sourcePath, null);
    const sourceEdit = currentPlan.fileEdits.find(
      ({ path }) => path === currentPlan.sourcePath,
    );
    diskChanges.set(
      currentPlan.targetPath,
      sourceEdit?.updatedText ?? currentPlan.sourceText,
    );
    for (const edit of currentPlan.fileEdits) {
      if (edit.path !== currentPlan.sourcePath) {
        diskChanges.set(edit.path, edit.updatedText);
      }
    }
    loreIndex = sessionAtStart.applyDiskChanges(diskChanges);

    for (const edit of currentPlan.fileEdits) {
      const oldAbsolute = await absolutePath(edit.path);
      const nextRelative = edit.path === currentPlan.sourcePath
        ? currentPlan.targetPath
        : edit.path;
      const nextAbsolute = await absolutePath(nextRelative);
      persistedContentByPath.delete(oldAbsolute);
      persistedContentByPath.set(nextAbsolute, edit.updatedText);
      if (activeRelative === edit.path) {
        content = edit.updatedText;
        persistedContent = edit.updatedText;
      }
    }
    if (activeRelative === currentPlan.sourcePath) {
      const oldAbsolute = activeFilePath;
      const nextAbsolute = await absolutePath(currentPlan.targetPath);
      persistedContentByPath.delete(oldAbsolute);
      persistedContentByPath.set(
        nextAbsolute,
        sourceEdit?.updatedText ?? currentPlan.sourceText,
      );
      activeFilePath = nextAbsolute;
      activeFile = currentPlan.targetPath.split("/").at(-1) ?? currentPlan.targetPath;
      persistedContent = sourceEdit?.updatedText ?? currentPlan.sourceText;
      content = persistedContent;
    }

    const activeEdit = currentPlan.fileEdits.find(
      ({ path }) => path === activeRelative,
    );
    if (activeRelative === currentPlan.sourcePath || activeEdit) {
      practiceState = beginDailyPractice(content, practiceState.dailyWords);
    }
    const nextSelectionStart = mapOffsetThroughLoreRename(selectionStart, activeEdit);
    const nextSelectionEnd = mapOffsetThroughLoreRename(selectionEnd, activeEdit);
    const sourceParent = currentPlan.sourcePath.split("/").slice(0, -1).join("/");
    const targetParent = currentPlan.targetPath.split("/").slice(0, -1).join("/");
    const parents = [...new Set([sourceParent, targetParent])];
    for (const parent of parents) {
      const parentPath = parent ? await absolutePath(parent) : rootAtStart;
      await refreshDirectory(parentPath);
    }
    scheduleNavigationState();
    const referencePath = loreReference?.path === currentPlan.sourcePath
      ? currentPlan.targetPath
      : loreReference?.path;
    loreRenameBusy = false;
    loreRenameSourcePath = "";
    loreRenameRequestedPath = "";
    loreRenameError = "";
    error = "";
    if (referencePath) {
      await openLoreReference(referencePath, false);
      await focusLoreReference();
    }
    await tick();
    if (editorInput && activeRelative) {
      editorInput.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    }
  }

  async function createMissingLoreNote(item: LoreConnectionItem): Promise<void> {
    if (!folderPath || !loreIndex || !item.canCreateMissing) return;
    const outgoing = loreIndex.documents
      .get(item.sourcePath)
      ?.outgoing.find(({ link }) => link.range.start === item.sourceStart);
    if (!outgoing) {
      error = "The missing link changed before its note could be planned.";
      return;
    }
    const plan = planMissingLoreNote(outgoing, loreIndex);
    if (plan.kind === "unavailable") {
      error = `This missing note cannot be created safely: ${plan.reason}`;
      return;
    }
    const result = await message(
      `Create ${plan.path} inside this project?\n\nThe new Markdown note will contain only its title${outgoing.link.headingTarget ? " and requested heading" : ""}. The source link will not be rewritten.`,
      {
        title: "Create missing lore note",
        kind: "info",
        buttons: { ok: "Create note", cancel: "Cancel" },
      },
    );
    if (result !== "Create note" || !loreIndex) return;
    try {
      const currentOutgoing = loreIndex.documents
        .get(item.sourcePath)
        ?.outgoing.find(({ link }) => link.range.start === item.sourceStart);
      const currentPlan = currentOutgoing
        ? planMissingLoreNote(currentOutgoing, loreIndex)
        : null;
      if (
        !currentPlan ||
        currentPlan.kind !== "ready" ||
        currentPlan.path !== plan.path ||
        currentPlan.text !== plan.text
      ) {
        error = "The missing link changed while the confirmation was open, so nothing was created.";
        return;
      }
      const segments = plan.path.split("/");
      const path = await join(folderPath, ...segments);
      await writeTextFile(path, plan.text, { createNew: true });
      loreIndex = loreIndexSession.replaceDiskSource(plan.path, plan.text);
      const parentSegments = segments.slice(0, -1);
      const parentPath = parentSegments.length > 0
        ? await join(folderPath, ...parentSegments)
        : folderPath;
      await refreshDirectory(parentPath);
      error = "";
      await openLoreReference(plan.path);
    } catch (cause) {
      error = `Could not create ${plan.path}; no existing file was overwritten: ${formatError(cause)}`;
    }
  }

  async function openQuickOpen(): Promise<void> {
    if (quickOpenVisible) return;
    quickOpenReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dismissedLoreCompletion = "";
    clearLoreCompletion();
    quickOpenQuery = "";
    quickOpenSelectedIndex = 0;
    quickOpenVisible = true;
    await tick();
  }

  function closeQuickOpen(restoreFocus = true): void {
    if (!quickOpenVisible) return;
    quickOpenVisible = false;
    quickOpenQuery = "";
    quickOpenSelectedIndex = 0;
    const returnFocus = quickOpenReturnFocus;
    quickOpenReturnFocus = null;
    if (restoreFocus) {
      void tick().then(() => returnFocus?.focus());
    }
  }

  function updateQuickOpenQuery(value: string): void {
    quickOpenQuery = value;
    quickOpenSelectedIndex = 0;
  }

  function moveQuickOpenSelection(index: number): void {
    quickOpenSelectedIndex = Math.max(
      0,
      Math.min(index, quickOpenResults.length - 1),
    );
  }

  function syncActiveLoreBuffer(): void {
    if (!loreIndex) return;
    const relativePath = activeLorePath();
    if (!relativePath) return;
    loreIndex =
      content === persistedContent
        ? loreIndexSession.replaceDiskSource(relativePath, content)
        : loreIndexSession.setActiveOverlay(relativePath, content);
  }

  function scheduleLoreOverlay(): void {
    if (loreOverlayTimer) clearTimeout(loreOverlayTimer);
    const path = activeFilePath;
    const text = content;
    loreOverlayTimer = setTimeout(() => {
      loreOverlayTimer = null;
      if (!loreIndex || path !== activeFilePath || text !== content) return;
      const relativePath = activeLorePath(path);
      if (!relativePath) return;
      loreIndex = loreIndexSession.setActiveOverlay(relativePath, text);
      syncActiveLoreReference(relativePath, text);
    }, LORE_OVERLAY_DELAY_MS);
  }

  function syncActiveLoreReference(path: string, text: string): void {
    if (!loreReference || loreReference.path !== path || !loreIndex) return;
    const record = loreIndex.documents.get(path);
    if (!record || record.fingerprint !== fingerprintContent(text)) return;
    loreReference = {
      phase: "ready",
      path,
      title: record.title,
      text,
      fingerprint: record.fingerprint,
    };
  }

  function updateLoreSourceAfterSave(path: string, text: string): void {
    if (!loreIndex) return;
    const relativePath = activeLorePath(path);
    if (!relativePath) return;
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > DEFAULT_MAX_LORE_FILE_BYTES) {
      loreIndex = loreIndexSession.removeDiskSource(relativePath);
      loreIndexNeedsRefresh = true;
      loreIndexPhase = "stale";
      return;
    }
    loreIndex = loreIndexSession.replaceDiskSource(relativePath, text);
    syncActiveLoreReference(relativePath, text);
    if (!loreIndexNeedsRefresh) loreIndexPhase = "ready";
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
    const lorePath = activeLorePath(path);
    if (loreIndex && lorePath) {
      loreIndex = loreIndexSession.clearActiveOverlay(lorePath);
    }
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
    resetManuscriptCreation(true);

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

    beginLoreIndex(path);
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

  async function openFile(
    entry: FileTreeEntry,
    recordHistory = true,
  ): Promise<boolean> {
    if (entry.path === activeFilePath) return true;
    const historyOrigin = recordHistory
      ? captureLoreNavigationLocation()
      : null;
    let opened = false;

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
        editorSelectionStart = 0;
        editorSelectionEnd = 0;
        opened = true;
        dismissedLoreCompletion = "";
        clearLoreCompletion();
        syncActiveLoreBuffer();
        scheduleNavigationState();

        if (recovered.revision) {
          const request = currentSaveRequest();
          if (request) autosave.schedule(request);
        }
      } catch (e) {
        error = `Could not open ${entry.name}: ${e}`;
      }
    });
    if (opened && historyOrigin) recordLoreNavigation(historyOrigin);
    return opened;
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
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const nextContent = textarea.value;
    editorSelectionStart = textarea.selectionStart;
    editorSelectionEnd = textarea.selectionEnd;
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
    scheduleLoreOverlay();
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
    if (!insertingLoreCompletion) {
      dismissedLoreCompletion = "";
      updateLoreCompletion(textarea);
    }
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
    if (event.defaultPrevented) return;
    if (
      manuscriptCreationVisible ||
      manuscriptRepairKey ||
      manuscriptMetadataItemId ||
      manuscriptReorderPlan ||
      manuscriptSceneSplitRequest
    ) return;
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      (event.key === "[" || event.key === "]") &&
      !quickOpenVisible &&
      !loreRenameSourcePath
    ) {
      event.preventDefault();
      void goThroughLoreHistory(event.key === "[" ? "back" : "forward");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
      event.preventDefault();
      if (quickOpenVisible) closeQuickOpen();
      else void openQuickOpen();
      return;
    }
    if (quickOpenVisible && event.key === "Escape") {
      event.preventDefault();
      closeQuickOpen();
      return;
    }
    if (loreReference && event.key === "Escape") {
      event.preventDefault();
      closeLoreReference();
      return;
    }
    if (focusMode && event.key === "Escape") {
      event.preventDefault();
      setWritingFocus(false);
      return;
    }
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

<div class="app" class:focus-mode={focusMode}>
  <aside class="sidebar" hidden={focusMode}>
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

      <LoreIndexStatus
        phase={loreIndexPhase}
        documentCount={loreIndex?.documents.size ?? 0}
        issueCount={loreIssueCount}
        scanIssues={loreScanIssues}
        indexIssueMessages={loreIndexIssueMessages}
        suppressedIssueCount={loreSuppressedIssueCount}
        errorMessage={loreIndexError}
        onRefresh={() => void refreshLoreIndex()}
      />
      {#if manuscriptProject.kind === "absent" && loreIndexPhase === "ready"}
        <button
          class="open-btn manuscript-create"
          onclick={() => void startManuscriptCreation()}
          disabled={worldProjectBusy}
        >Create manuscript structure</button>
      {:else if manuscriptProject.kind !== "absent"}
        <ManuscriptOutline
          result={manuscriptProject}
          loading={manuscriptLoading}
          repairBusy={manuscriptRepairBusy || manuscriptSceneSplitBusy || manuscriptSceneMergeBusy}
          repairNotice={manuscriptRepairNotice}
          repairUndoLabel={manuscriptSceneMergeUndo?.label ?? manuscriptSceneSplitUndo?.label ?? manuscriptRepairUndo?.label ?? ""}
          focusItemId={manuscriptOutlineFocusItemId}
          focusRevision={manuscriptOutlineFocusRevision}
          onRefresh={() => void refreshManuscriptStructure()}
          onOpenSource={(path, fingerprint) => void openManuscriptSource(path, fingerprint)}
          onReferenceSource={(path, fingerprint) => void referenceManuscriptSource(path, fingerprint)}
          canReferenceSource={Boolean(activeFilePath)}
          onRepairSource={beginManuscriptRepair}
          onEditMetadata={beginManuscriptMetadataEdit}
          onReorder={beginManuscriptReorder}
          canMoveScene={canMoveManuscriptScene}
          onMoveScene={beginManuscriptSceneMove}
          canMergeScene={canMergeManuscriptScene}
          onMergeScene={beginManuscriptSceneMerge}
          onOpenCorkboard={openManuscriptCorkboard}
          onUndoRepair={() => void undoLastManuscriptChange()}
        />
      {/if}
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

  <div class="divider" hidden={focusMode}></div>

  <main class="editor">
    <div class="editor-header">
      <div class="editor-heading-main">
        {#if !focusMode}<nav class="lore-history" aria-label="Connected lore navigation history">
          <button
            type="button"
            aria-label="Back through connected lore navigation"
            title="Back through connected lore navigation (Command/Ctrl+[)"
            disabled={!canGoBackThroughLore || restoringLoreHistory || worldProjectBusy}
            onclick={() => void goThroughLoreHistory("back")}
          >←</button>
          <button
            type="button"
            aria-label="Forward through connected lore navigation"
            title="Forward through connected lore navigation (Command/Ctrl+])"
            disabled={!canGoForwardThroughLore || restoringLoreHistory || worldProjectBusy}
            onclick={() => void goThroughLoreHistory("forward")}
          >→</button>
        </nav>{/if}
        <span>
          {manuscriptCorkboard
            ? `Corkboard · ${manuscriptCorkboard.manuscript.title}`
            : activeFile || "No file open"}
          {#if dirty}<span class="dirty-dot" aria-hidden="true">●</span>{/if}
        </span>
      </div>
      <div class="editor-statuses">
        {#if loreHistoryNotice}
          <span class="history-notice" role="status" aria-live="polite">{loreHistoryNotice}</span>
        {/if}
        {#if activeFile}
          <span
            class="save-status"
            class:save-error={saveState.phase === "error"}
            aria-live="polite"
          >{saveStatus}</span>
          {#if !manuscriptCorkboard && activeSceneSplitAvailability.kind === "available"}
            <button
              type="button"
              class="focus-mode-button"
              title={`Split ${activeSceneSplitAvailability.sceneTitle} at the collapsed caret`}
              disabled={dirty || saveState.phase === "saving" || worldProjectBusy}
              onclick={() => void beginManuscriptSceneSplit()}
            >Split scene…</button>
          {/if}
          <button
            type="button"
            class="focus-mode-button"
            aria-pressed={focusMode}
            title={focusMode ? "Return project navigation" : "Hide navigation and focus on this draft"}
            onclick={() => setWritingFocus(!focusMode)}
          >{focusMode ? "Exit focus" : "Focus"}</button>
        {/if}
      </div>
    </div>
    <div
      class="writing-split"
      class:corkboard-mode={Boolean(manuscriptCorkboard)}
      class:focus-mode={focusMode}
      class:has-reference={Boolean(loreReference)}
    >
      <div class="editor-workspace">
        {#if manuscriptCorkboard}
          <ManuscriptCorkboard
            manuscript={manuscriptCorkboard}
            busy={manuscriptRepairBusy}
            focusItemId={manuscriptCorkboardFocusItemId}
            focusRevision={manuscriptCorkboardFocusRevision}
            onClose={closeManuscriptCorkboard}
            onOpenSource={(path, fingerprint) => void openManuscriptSourceFromCorkboard(path, fingerprint)}
            onReferenceSource={(path, fingerprint) => void referenceManuscriptSource(path, fingerprint, true)}
            canReferenceSource={Boolean(activeFilePath)}
            onEditMetadata={(itemId) => beginManuscriptMetadataEdit(itemId, "corkboard")}
            onReorder={(itemId, direction) => beginManuscriptReorder(itemId, direction, "corkboard")}
            canMoveScene={canMoveManuscriptScene}
            onMoveScene={(itemId) => beginManuscriptSceneMove(itemId, "corkboard")}
            canMergeScene={canMergeManuscriptScene}
            onMergeScene={(itemId) => void beginManuscriptSceneMerge(itemId, "corkboard")}
          />
        {:else}
          <textarea
        class="editor-input"
        placeholder="Start writing your 200 crappy words..."
        aria-label="Document editor"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={loreCompletionItems.length > 0}
        aria-controls={loreCompletionItems.length > 0
          ? "lore-completion-list"
          : undefined}
        aria-activedescendant={loreCompletionItems.length > 0
          ? `lore-completion-option-${loreCompletionSelectedIndex}`
          : undefined}
        disabled={!activeFilePath || correctingDailyProgress || worldProjectBusy}
        value={content}
        bind:this={editorInput}
        oninput={handleContentInput}
        onkeydown={handleEditorKeydown}
        onkeyup={handleEditorCaretChange}
        onclick={handleEditorCaretChange}
        onselect={handleEditorCaretChange}
          ></textarea>
          {#if loreCompletionContext && loreCompletionItems.length > 0}
            <LoreCompletion
              candidates={loreCompletionItems}
              selectedIndex={loreCompletionSelectedIndex}
              mode={loreCompletionContext.mode}
              onSelect={(candidate) => void acceptLoreCompletion(candidate)}
            />
          {/if}
        {/if}
      </div>
      {#if loreReference && !manuscriptCorkboard}
        <LoreReferencePane
          reference={loreReference}
          onClose={() => closeLoreReference()}
          onOpenEditor={(path) => void openReferenceInEditor(path)}
          onRename={(path) => beginLoreRename(path)}
          onRetry={(path) => void openLoreReference(path)}
        />
      {/if}
    </div>
    {#if currentLoreConnections && !focusMode}
      <LoreConnections
        connections={currentLoreConnections}
        onOpen={(item) => void openLoreConnection(item)}
        onOpenMention={(mention) => void openLoreMention(mention)}
        onCreateMissing={(item) => void createMissingLoreNote(item)}
      />
    {/if}
    {#if loreRenameSourcePath && loreRenamePlan}
      <LoreRenameDialog
        sourcePath={loreRenameSourcePath}
        requestedPath={loreRenameRequestedPath}
        plan={loreRenamePlan}
        busy={loreRenameBusy}
        executionError={loreRenameError}
        onRequestedPath={(path) => {
          loreRenameRequestedPath = path;
          loreRenameError = "";
        }}
        onCancel={() => closeLoreRename()}
        onConfirm={() => void confirmLoreRename()}
      />
    {/if}
    {#if manuscriptCreationVisible}
      <ManuscriptCreationDialog
        title={manuscriptCreationTitle}
        mode={manuscriptCreationMode}
        importDirectory={manuscriptCreationImportDirectory}
        plan={manuscriptCreationPlan}
        planning={manuscriptCreationPlanning}
        busy={manuscriptCreationBusy}
        executionError={manuscriptCreationError}
        onTitle={(title) => {
          manuscriptCreationTitle = title;
          manuscriptCreationError = "";
        }}
        onMode={setManuscriptCreationMode}
        onRefresh={() => void refreshManuscriptCreationPreview()}
        onCancel={() => resetManuscriptCreation()}
        onConfirm={() => void confirmManuscriptCreation()}
      />
    {/if}
    {#if manuscriptRepairKey && manuscriptRepairPlan}
      <ManuscriptRepairDialog
        plan={manuscriptRepairPlan}
        busy={manuscriptRepairBusy}
        executionError={manuscriptRepairError}
        onCancel={closeManuscriptRepair}
        onConfirm={() => void confirmManuscriptRepair()}
      />
    {/if}
    {#if manuscriptMetadataItemId && manuscriptMetadataTarget && manuscriptMetadataPlan}
      <ManuscriptMetadataDialog
        target={manuscriptMetadataTarget}
        draft={manuscriptMetadataDraft}
        plan={manuscriptMetadataPlan}
        busy={manuscriptRepairBusy}
        executionError={manuscriptMetadataError}
        onDraft={(draft) => {
          manuscriptMetadataDraft = draft;
        }}
        onCancel={() => resetManuscriptMetadata()}
        onConfirm={() => void confirmManuscriptMetadataEdit()}
      />
    {/if}
    {#if manuscriptReorderPlan}
      <ManuscriptReorderDialog
        plan={manuscriptReorderPlan}
        busy={manuscriptRepairBusy}
        executionError={manuscriptReorderError}
        onCancel={() => resetManuscriptReorder()}
        onConfirm={() => void confirmManuscriptReorder()}
      />
    {/if}
    {#if manuscriptSceneMoveItemId && manuscriptSceneMovePlan}
      <ManuscriptSceneMoveDialog
        destinations={manuscriptSceneMoveDestinationsForDialog}
        destinationKey={manuscriptSceneMoveDestinationKey}
        destinationIndex={manuscriptSceneMoveDestinationIndex}
        plan={manuscriptSceneMovePlan}
        busy={manuscriptRepairBusy}
        executionError={manuscriptSceneMoveError}
        onDestination={selectManuscriptSceneMoveDestination}
        onPosition={(index) => {
          manuscriptSceneMoveDestinationIndex = index;
          manuscriptSceneMoveError = "";
        }}
        onCancel={cancelManuscriptSceneMove}
        onConfirm={() => void confirmManuscriptSceneMove()}
      />
    {/if}
    {#if manuscriptSceneSplitRequest && manuscriptSceneSplitPlan}
      <ManuscriptSceneSplitDialog
        request={manuscriptSceneSplitRequest}
        plan={manuscriptSceneSplitPlan}
        busy={manuscriptSceneSplitBusy}
        executionError={manuscriptSceneSplitError}
        onRequest={updateManuscriptSceneSplitRequest}
        onCancel={closeManuscriptSceneSplit}
        onConfirm={() => void confirmManuscriptSceneSplit()}
      />
    {/if}
    {#if manuscriptSceneMergeRequest && manuscriptSceneMergePlan}
      <ManuscriptSceneMergeDialog
        request={manuscriptSceneMergeRequest}
        plan={manuscriptSceneMergePlan}
        busy={manuscriptSceneMergeBusy}
        executionError={manuscriptSceneMergeError}
        onRequest={updateManuscriptSceneMergeRequest}
        onCancel={closeManuscriptSceneMerge}
        onConfirm={() => void confirmManuscriptSceneMerge()}
      />
    {/if}
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

{#if quickOpenVisible}
  <LoreQuickOpen
    query={quickOpenQuery}
    results={quickOpenResults}
    selectedIndex={quickOpenActiveIndex}
    phase={loreIndexPhase}
    hasIndex={loreIndex !== null}
    onQuery={updateQuickOpenQuery}
    onMove={moveQuickOpenSelection}
    onOpen={(result) => void openLoreSearchResult(result)}
    onReference={(result) => void referenceLoreSearchResult(result)}
    onClose={() => closeQuickOpen()}
  />
{/if}

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

  .sidebar[hidden],
  .divider[hidden] {
    display: none;
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

  .editor-heading-main,
  .editor-statuses,
  .lore-history {
    display: flex;
    align-items: center;
  }

  .editor-heading-main {
    min-width: 0;
    gap: 0.65rem;
  }

  .editor-statuses {
    min-width: 0;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .lore-history {
    flex: 0 0 auto;
    gap: 0.2rem;
  }

  .lore-history button {
    width: 1.55rem;
    height: 1.45rem;
    padding: 0;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #292929;
    color: #c8c8c8;
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .lore-history button:hover:not(:disabled) {
    background: #383838;
  }

  .lore-history button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .lore-history button:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .focus-mode-button {
    flex: 0 0 auto;
    padding: 0.28rem 0.5rem;
    border: 1px solid #4d6252;
    border-radius: 4px;
    background: #29322b;
    color: #b8d8bd;
    font: inherit;
    cursor: pointer;
  }

  .focus-mode-button:hover {
    background: #344038;
  }

  .focus-mode-button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .history-notice {
    max-width: min(34vw, 28rem);
    overflow: hidden;
    color: #a7d7ad;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editor-workspace {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    min-height: 0;
  }

  .writing-split {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    min-height: 0;
  }

  .writing-split .editor-workspace {
    min-width: 0;
  }

  .writing-split.focus-mode {
    background: #181818;
  }

  .writing-split.focus-mode:not(.has-reference) .editor-workspace {
    max-width: 58rem;
    margin: 0 auto;
  }

  .save-status {
    flex: 0 0 auto;
  }

  .save-status.save-error {
    color: #f48771;
  }

  .editor-input {
    flex: 1 1 auto;
    width: 100%;
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
