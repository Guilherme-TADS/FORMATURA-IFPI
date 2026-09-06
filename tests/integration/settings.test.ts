import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getEventInfo,
  getReservationTtlMinutes,
  getUploadLimits,
  DEFAULT_EVENT_INFO,
  DEFAULT_RESERVATION_TTL_MINUTES,
  SETTINGS_KEYS,
} from "@/lib/settings";
import { DEFAULT_UPLOAD_LIMITS } from "@/lib/uploads";
import { adminClient } from "../helpers/supabase";
import type { Json } from "@/types/database";

const KEYS = [SETTINGS_KEYS.eventInfo, SETTINGS_KEYS.uploadLimits, SETTINGS_KEYS.reservationTtlMinutes];

// lib/settings.ts falls back to the app's hardcoded defaults whenever a
// system_settings row is absent, so the rest of the app (public upload
// routes, the raffle reservation flow) keeps working identically before
// anyone ever touches /admin/configuracoes. These tests exercise both the
// "row absent" and "row present" paths against the real table.
//
// system_settings holds real, admin-configured values (event name, upload
// limits, reservation TTL) that an operator may have already set through
// /admin/configuracoes — this suite must not destroy them. It snapshots
// whatever is there before running, clears it for a deterministic "no
// override configured" starting point, and restores the exact original rows
// in afterAll — never a blanket delete-and-leave-empty.
describe("lib/settings.ts", () => {
  const admin = adminClient();
  let originalRows: { key: string; value: Json }[] = [];

  beforeAll(async () => {
    const { data } = await admin.from("system_settings").select("key, value").in("key", KEYS);
    originalRows = data ?? [];
    await admin.from("system_settings").delete().in("key", KEYS);
  });

  afterEach(async () => {
    await admin.from("system_settings").delete().in("key", KEYS);
  });

  afterAll(async () => {
    if (originalRows.length > 0) {
      await admin.from("system_settings").upsert(originalRows);
    }
  });

  it("falls back to defaults when no row exists", async () => {
    expect(await getEventInfo()).toEqual(DEFAULT_EVENT_INFO);
    expect(await getUploadLimits()).toEqual(DEFAULT_UPLOAD_LIMITS);
    expect(await getReservationTtlMinutes()).toBe(DEFAULT_RESERVATION_TTL_MINUTES);
  });

  it("honors an admin-configured override once one exists", async () => {
    await admin.from("system_settings").upsert([
      { key: SETTINGS_KEYS.eventInfo, value: { name: "Formatura Teste", course: "ADS", className: "3A" } },
      { key: SETTINGS_KEYS.uploadLimits, value: { maxSizeBytes: 2_000_000, allowedMimeTypes: ["application/pdf"] } },
      { key: SETTINGS_KEYS.reservationTtlMinutes, value: 30 },
    ]);

    expect(await getEventInfo()).toEqual({ name: "Formatura Teste", course: "ADS", className: "3A" });
    expect(await getUploadLimits()).toEqual({
      maxSizeBytes: 2_000_000,
      allowedMimeTypes: ["application/pdf"],
    });
    expect(await getReservationTtlMinutes()).toBe(30);
  });

  it("ignores a malformed upload_limits row instead of returning broken limits", async () => {
    await admin
      .from("system_settings")
      .upsert([{ key: SETTINGS_KEYS.uploadLimits, value: { maxSizeBytes: 0, allowedMimeTypes: [] } }]);
    expect(await getUploadLimits()).toEqual(DEFAULT_UPLOAD_LIMITS);
  });
});
