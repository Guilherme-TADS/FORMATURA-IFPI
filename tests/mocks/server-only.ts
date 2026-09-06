// vitest runs plain Node, not Next's bundler, so it never sets the
// "react-server" export condition that makes the real "server-only" package
// a no-op (see node_modules/server-only/index.js — its default export
// throws unconditionally, by design, to catch server-only code leaking into
// a client bundle). Aliased in vitest.config.mts so integration tests can
// import server-only modules (lib/settings.ts, lib/supabase/admin.ts, etc.)
// without hitting that throw — it's irrelevant here since tests never go
// through a client bundle in the first place.
export {};
