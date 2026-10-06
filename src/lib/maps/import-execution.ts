import type { MapsProjectLoadResult } from "./load";
import {
  executeMapsMutation,
  type MapsMutationExecutionResult,
  type MapsMutationIo,
} from "./mutation-execution";
import type { MapsMutationPlan, MapsMutationRequest } from "./mutation";

export interface PendingMapImageImport {
  sourcePath: string;
  targetName: string;
  targetPath: string;
  sha256: string;
}

export interface MapImageImportIo {
  copyNew(imageImport: PendingMapImageImport): Promise<void>;
  rollbackExact(imageImport: PendingMapImageImport): Promise<void>;
}

export async function executeMapsMutationWithImport(
  plan: Extract<MapsMutationPlan, { kind: "ready" }>,
  request: MapsMutationRequest,
  mapsIo: MapsMutationIo,
  imageImport: PendingMapImageImport | null,
  importIo: MapImageImportIo,
): Promise<MapsMutationExecutionResult> {
  if (!imageImport) return executeMapsMutation(plan, request, mapsIo);
  if (request.kind !== "add-map" && request.kind !== "replace-image") {
    return { kind: "failed", message: "Only a new map or image replacement can own a pending image import." };
  }

  try {
    await importIo.copyNew(imageImport);
  } catch (cause) {
    return { kind: "failed", message: `The map image was not imported: ${formatError(cause)}` };
  }

  const result = await executeMapsMutation(plan, request, mapsIo);
  if (result.kind === "applied") return result;

  let current: MapsProjectLoadResult;
  try {
    current = await mapsIo.reload();
  } catch (cause) {
    return {
      kind: "failed",
      message: `${result.message} The new image copy may remain at ${imageImport.targetPath} because the maps file could not be rechecked: ${formatError(cause)}`,
    };
  }
  const mapCommitted = current.kind === "ready" && current.mapsProject.maps.some(({ id, image }) =>
    id === request.mapId &&
    image.path === imageImport.targetPath &&
    image.sha256 === imageImport.sha256
  );
  if (mapCommitted) {
    return {
      kind: "failed",
      message: `${result.message} The new map references the verified imported image, so the image was retained for review.`,
    };
  }

  try {
    await importIo.rollbackExact(imageImport);
  } catch (cause) {
    return {
      kind: "failed",
      message: `${result.message} The new image copy may remain at ${imageImport.targetPath}: ${formatError(cause)}`,
    };
  }
  return result;
}

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
