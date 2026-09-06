import "server-only";

export type DriveFile = {
  id: string;
  name: string;
  webViewLink: string;
  mimeType: string;
  size: number;
};

export interface DriveService {
  readonly configured: boolean;
  uploadFile(input: {
    folderId: string;
    fileName: string;
    mimeType: string;
    data: Uint8Array;
  }): Promise<DriveFile>;
  deleteFile(fileId: string): Promise<void>;
  getFile(fileId: string): Promise<DriveFile | null>;
  createFolder(input: { name: string; parentFolderId: string }): Promise<{ id: string }>;
  findFolder(input: { name: string; parentFolderId: string }): Promise<{ id: string } | null>;
}

export class DriveNotConfiguredError extends Error {
  constructor() {
    super(
      "A integração com o Google Drive ainda não foi configurada. Configure " +
        "GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY e os " +
        "IDs de pasta em GOOGLE_DRIVE_*_FOLDER_ID para habilitar o envio ao Drive.",
    );
    this.name = "DriveNotConfiguredError";
  }
}

// Every write goes through Supabase Storage first (see /api/uploads/*) and
// stays there — comprovantes and documentos work today with no Drive setup
// at all. This provider exists so the rest of the app can call
// `getDriveService()` unconditionally; it fails loudly and specifically
// instead of the app silently pretending an upload reached the Drive.
class UnconfiguredDriveProvider implements DriveService {
  readonly configured = false;

  async uploadFile(): Promise<DriveFile> {
    throw new DriveNotConfiguredError();
  }
  async deleteFile(): Promise<void> {
    throw new DriveNotConfiguredError();
  }
  async getFile(): Promise<DriveFile | null> {
    throw new DriveNotConfiguredError();
  }
  async createFolder(): Promise<{ id: string }> {
    throw new DriveNotConfiguredError();
  }
  async findFolder(): Promise<{ id: string } | null> {
    throw new DriveNotConfiguredError();
  }
}

export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  );
}

/**
 * Returns the Drive integration. Until GOOGLE_SERVICE_ACCOUNT_EMAIL /
 * GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are set, this is the unconfigured
 * provider — callers should check `.configured` before attempting an
 * operation that requires Drive rather than letting it throw, so the UI can
 * show "Google Drive não configurado" instead of a generic error.
 *
 * TODO(google-drive): once credentials exist, implement a
 * GoogleDriveService here using googleapis' drive_v3 client, authenticated
 * via a JWT client built from the service account email/private key
 * (google-auth-library's JWT class). Keep the constructor here so this
 * remains the single place that knows how to talk to Drive.
 */
export function getDriveService(): DriveService {
  return new UnconfiguredDriveProvider();
}
