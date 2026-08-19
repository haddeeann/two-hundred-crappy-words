export class ExternalFileChangeError extends Error {
  readonly diskContent: string;

  constructor(diskContent: string) {
    super("The file changed outside the app.");
    this.name = "ExternalFileChangeError";
    this.diskContent = diskContent;
  }
}

export class SourceFileUnavailableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The file can no longer be read at its previous path.");
    this.name = "SourceFileUnavailableError";
    this.cause = cause;
  }
}

interface GuardedWriteRequest {
  path: string;
  content: string;
  expectedContent: string;
  force?: boolean;
}

interface GuardedWriteIo {
  read: (path: string) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
}

export async function guardedWriteText(
  request: GuardedWriteRequest,
  io: GuardedWriteIo,
): Promise<void> {
  if (!request.force) {
    let diskContent: string;
    try {
      diskContent = await io.read(request.path);
    } catch (cause) {
      throw new SourceFileUnavailableError(cause);
    }

    if (diskContent !== request.expectedContent) {
      throw new ExternalFileChangeError(diskContent);
    }
  }

  await io.write(request.path, request.content);
}
