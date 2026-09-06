import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDriveService, isDriveConfigured, DriveNotConfiguredError } from "@/lib/services/drive";

describe("Google Drive Service Provider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns unconfigured provider when env vars are missing", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    expect(isDriveConfigured()).toBe(false);

    const service = getDriveService();
    expect(service.configured).toBe(false);

    await expect(
      service.uploadFile({
        folderId: "test",
        fileName: "test.pdf",
        mimeType: "application/pdf",
        data: new Uint8Array(),
      }),
    ).rejects.toThrow(DriveNotConfiguredError);
  });

  it("identifies when drive credentials are configured", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@test.iam.gserviceaccount.com";
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nMIIEvg...\\n-----END PRIVATE KEY-----";

    expect(isDriveConfigured()).toBe(true);

    const service = getDriveService();
    expect(service.configured).toBe(true);
  });
});
