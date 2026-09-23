import { validateFileName } from "./file-tree";

export const PROTECTED_PROJECT_FILENAMES = [
  "200-crappy-words.project.json",
  "200-crappy-words.manuscripts.json",
  "200-crappy-words.timeline.json",
] as const;

export type FileRenamePlan =
  | { kind: "ready"; targetName: string }
  | { kind: "unavailable"; reason: string };

export type FileDeletePlan =
  | { kind: "ready" }
  | { kind: "unavailable"; reason: string };

export function planFileDelete({
  name,
  atProjectRoot,
  isDirectory,
  isSymlink,
}: {
  name: string;
  atProjectRoot: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}): FileDeletePlan {
  if (isDirectory) return unavailable("Folders cannot be deleted from the file tree yet.");
  if (isSymlink) return unavailable("Symbolic links cannot be deleted from the app.");
  if (
    atProjectRoot &&
    PROTECTED_PROJECT_FILENAMES.some(
      (protectedName) => portableName(protectedName) === portableName(name),
    )
  ) {
    return unavailable("Project metadata files cannot be moved to Trash from the file tree.");
  }
  return { kind: "ready" };
}

export function planFileRename({
  currentName,
  requestedName,
  siblingNames,
  atProjectRoot,
}: {
  currentName: string;
  requestedName: string;
  siblingNames: readonly string[];
  atProjectRoot: boolean;
}): FileRenamePlan {
  if (
    atProjectRoot &&
    PROTECTED_PROJECT_FILENAMES.includes(
      currentName as (typeof PROTECTED_PROJECT_FILENAMES)[number],
    )
  ) {
    return unavailable("Project metadata files cannot be renamed from the file tree.");
  }

  const validationError = validateFileName(requestedName);
  if (validationError) return unavailable(validationError);
  if (requestedName === currentName) {
    return unavailable("Enter a different filename.");
  }

  const portableTarget = portableName(requestedName);
  if (portableTarget === portableName(currentName)) {
    return unavailable("Case-only filename changes are not supported safely.");
  }
  if (siblingNames.some((name) => portableName(name) === portableTarget)) {
    return unavailable(`“${requestedName}” already exists in this folder.`);
  }
  if (
    atProjectRoot &&
    PROTECTED_PROJECT_FILENAMES.some((name) => portableName(name) === portableTarget)
  ) {
    return unavailable("That filename is reserved for app-owned project metadata.");
  }

  return { kind: "ready", targetName: requestedName };
}

function portableName(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("en-US");
}

function unavailable(reason: string): FileRenamePlan {
  return { kind: "unavailable", reason };
}
