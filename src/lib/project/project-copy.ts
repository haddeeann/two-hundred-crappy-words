import {
  parseWorldProjectManifest,
  type WorldProjectManifest,
} from "./manifest";

export function createIndependentProjectManifestText(
  currentText: string,
  projectId: string,
): { text: string; manifest: WorldProjectManifest } {
  const current = parseWorldProjectManifest(currentText);
  if (current.kind !== "valid") {
    throw new RangeError("Only a valid supported world project can become independent.");
  }

  const source = structuredClone(current.source);
  source.projectId = projectId;
  const text = `${JSON.stringify(source, null, 2)}\n`;
  const updated = parseWorldProjectManifest(text);
  if (updated.kind !== "valid" || updated.manifest.projectId !== projectId) {
    throw new RangeError("The independent project manifest did not validate.");
  }
  return { text, manifest: updated.manifest };
}
