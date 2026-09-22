export interface ManuscriptPrintPdfMetadata {
  author: string;
  modifiedAt: string;
}

export interface ManuscriptPrintPdfFonts {
  regular: Uint8Array;
  italic: Uint8Array;
  semibold: Uint8Array;
  semiboldItalic: Uint8Array;
}

export interface ValidatedManuscriptPrintPdfMetadata extends ManuscriptPrintPdfMetadata {
  author: string;
  modifiedAt: string;
}

export const KDP_MINIMUM_PAPERBACK_PAGES = 24;

export function validateManuscriptPrintPdfMetadata(
  metadata: ManuscriptPrintPdfMetadata,
): { kind: "valid"; metadata: ValidatedManuscriptPrintPdfMetadata } | { kind: "invalid"; message: string } {
  const author = metadata.author.normalize("NFC").trim();
  if (!author) return { kind: "invalid", message: "Enter the author name exactly as it will appear in print." };
  if (author.length > 200) return { kind: "invalid", message: "Author name must be 200 characters or fewer." };
  const modified = new Date(metadata.modifiedAt);
  if (!Number.isFinite(modified.getTime())) {
    return { kind: "invalid", message: "The export modification time is invalid." };
  }
  return {
    kind: "valid",
    metadata: {
      author,
      modifiedAt: modified.toISOString().replace(/\.\d{3}Z$/u, "Z"),
    },
  };
}
