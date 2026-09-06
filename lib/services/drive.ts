import "server-only";
import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";

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

class RealGoogleDriveProvider implements DriveService {
  readonly configured = true;
  private drive: drive_v3.Drive;

  constructor(email: string, privateKey: string) {
    // Normaliza quebras de linha que possam ter vindo escapadas como \n no .env
    const formattedKey = privateKey.replace(/\\n/g, "\n");
    const auth = new google.auth.JWT({
      email,
      key: formattedKey,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    this.drive = google.drive({ version: "v3", auth });
  }

  async uploadFile(input: {
    folderId: string;
    fileName: string;
    mimeType: string;
    data: Uint8Array;
  }): Promise<DriveFile> {
    const stream = Readable.from(Buffer.from(input.data));
    const response = await this.drive.files.create({
      requestBody: {
        name: input.fileName,
        parents: input.folderId ? [input.folderId] : undefined,
      },
      media: {
        mimeType: input.mimeType,
        body: stream,
      },
      fields: "id, name, webViewLink, mimeType, size",
      supportsAllDrives: true,
    });

    const file = response.data;
    if (!file.id) {
      throw new Error("Falha ao obter ID do arquivo enviado ao Google Drive.");
    }

    return {
      id: file.id,
      name: file.name || input.fileName,
      webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      mimeType: file.mimeType || input.mimeType,
      size: Number(file.size || input.data.byteLength),
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
  }

  async getFile(fileId: string): Promise<DriveFile | null> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: "id, name, webViewLink, mimeType, size",
        supportsAllDrives: true,
      });
      const file = response.data;
      if (!file.id) return null;
      return {
        id: file.id,
        name: file.name || "arquivo",
        webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        mimeType: file.mimeType || "application/octet-stream",
        size: Number(file.size || 0),
      };
    } catch {
      return null;
    }
  }

  async createFolder(input: { name: string; parentFolderId: string }): Promise<{ id: string }> {
    const response = await this.drive.files.create({
      requestBody: {
        name: input.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: input.parentFolderId ? [input.parentFolderId] : undefined,
      },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!response.data.id) {
      throw new Error("Falha ao criar pasta no Google Drive.");
    }
    return { id: response.data.id };
  }

  async findFolder(input: { name: string; parentFolderId: string }): Promise<{ id: string } | null> {
    const query = [
      `name = '${input.name.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      input.parentFolderId ? `'${input.parentFolderId}' in parents` : null,
    ]
      .filter(Boolean)
      .join(" and ");

    const response = await this.drive.files.list({
      q: query,
      fields: "files(id, name)",
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const first = response.data.files?.[0];
    return first?.id ? { id: first.id } : null;
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
 * Retorna a integração com o Google Drive.
 * Se GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY estiverem
 * configurados, inicializa o provedor real autenticado via JWT da Service Account.
 * Caso contrário, retorna o provedor não-configurado para fallback transparente.
 */
export function getDriveService(): DriveService {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (email && privateKey) {
    return new RealGoogleDriveProvider(email, privateKey);
  }

  return new UnconfiguredDriveProvider();
}
