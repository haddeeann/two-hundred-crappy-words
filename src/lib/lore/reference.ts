import { fingerprintContent } from "$lib/editor/recovery";
import { parseMarkdownNote } from "./markdown";
import { reconcileLoreChanges } from "./reconcile";
import type { LoreScanBackend, LoreScanIssue, LoreScanOptions } from "./scan";
import type { LoreProjectIndex } from "./types";

export type LoreReferenceLoadResult =
  | {
      kind: "ready";
      path: string;
      title: string;
      text: string;
      fingerprint: string;
      changes: ReadonlyMap<string, string | null>;
      issues: LoreScanIssue[];
    }
  | {
      kind: "stale" | "unavailable";
      path: string;
      message: string;
      changes: ReadonlyMap<string, string | null>;
      issues: LoreScanIssue[];
    };

export type LoreReferenceView =
  | { phase: "loading"; path: string }
  | {
      phase: "ready";
      path: string;
      title: string;
      text: string;
      fingerprint: string;
    }
  | {
      phase: "stale" | "unavailable" | "error";
      path: string;
      message: string;
    };

export async function loadLoreReferenceSource({
  rootPath,
  relativePath,
  currentIndex,
  backend,
  options,
}: {
  rootPath: string;
  relativePath: string;
  currentIndex: LoreProjectIndex;
  backend: LoreScanBackend;
  options?: LoreScanOptions;
}): Promise<LoreReferenceLoadResult> {
  if (!currentIndex.documents.has(relativePath)) {
    return {
      kind: "unavailable",
      path: relativePath,
      message: "This note is no longer present in the current lore index.",
      changes: new Map(),
      issues: [],
    };
  }
  const reconciled = await reconcileLoreChanges({
    rootPath,
    relativePaths: [relativePath],
    currentIndex,
    backend,
    options,
  });
  if (reconciled.stale) {
    return {
      kind: "stale",
      path: relativePath,
      message: "The note could not be verified safely. Refresh the lore index and try again.",
      changes: reconciled.changes,
      issues: reconciled.issues,
    };
  }
  const text = reconciled.changes.get(relativePath);
  if (text === null) {
    return {
      kind: "unavailable",
      path: relativePath,
      message: referenceUnavailableMessage(reconciled.issues),
      changes: reconciled.changes,
      issues: reconciled.issues,
    };
  }
  const accepted = text ?? currentIndex.documents.get(relativePath)!.searchText;
  return {
    kind: "ready",
    path: relativePath,
    title: parseMarkdownNote(relativePath, accepted).title,
    text: accepted,
    fingerprint: fingerprintContent(accepted),
    changes: reconciled.changes,
    issues: reconciled.issues,
  };
}

export interface LoreReferenceRequest {
  revision: number;
  path: string;
}

export class LoreReferenceRequestCoordinator {
  private revision = 0;

  begin(path: string): LoreReferenceRequest {
    return { revision: ++this.revision, path };
  }

  isCurrent(request: LoreReferenceRequest): boolean {
    return request.revision === this.revision;
  }

  invalidate(): void {
    this.revision += 1;
  }
}

function referenceUnavailableMessage(issues: readonly LoreScanIssue[]): string {
  const issue = issues[0];
  if (issue) return `This note is not available for reference: ${issue.message}`;
  return "This note was moved or removed before it could be opened for reference.";
}
