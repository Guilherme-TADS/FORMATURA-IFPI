import { config } from "dotenv";
import path from "node:path";
import { vi } from "vitest";

config({ path: path.resolve(__dirname, "../.env.local") });

// "use cache" functions call cacheLife()/cacheTag() at module scope. Those
// only work inside Next.js's own request/build runtime (cacheComponents),
// which vitest never provides — so calling them here throws. Tests exercise
// the underlying business logic, not Next's caching behavior (that's what
// `next build` + browser verification cover instead), so no-op them.
vi.mock("next/cache", async () => {
  const actual = await vi.importActual<typeof import("next/cache")>("next/cache");
  return {
    ...actual,
    cacheLife: () => {},
    cacheTag: () => {},
  };
});
