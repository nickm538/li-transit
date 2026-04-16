# AGENTS.md

## Cursor Cloud specific instructions

### Overview
LI Transit Navigator — a React + Vite SPA for Long Island public transit (69 bus routes, 4,748 stops). Single `package.json`, no monorepo, no backend database.

### Dev environment
- **Package manager**: pnpm (version pinned via `packageManager` field — use `corepack enable && corepack install` first)
- **Dev server**: `pnpm dev` starts Vite on port 3000 with HMR
- **Type check**: `pnpm check` (runs `tsc --noEmit`)
- **Build**: `pnpm build` (Vite client build + esbuild server bundle)
- **Format**: `pnpm format` (Prettier)
- No test files exist yet; `vitest` is installed as a dev dependency

### Key env vars
The map requires `VITE_FRONTEND_FORGE_API_KEY` to load Google Maps via the Manus Forge proxy. Without it, the map shows a "Map failed to load" error with retry button. All transit data is fetched from a CloudFront CDN at runtime — no local data setup needed.

### Architecture gotchas
- **Google Maps container**: The `MapView` component's ref div (`data-map-canvas`) must have **no React children** — Google Maps takes exclusive DOM control of its container. Error/fallback UI must be rendered as a sibling overlay, not inside the map container div.
- The Express server (`server/index.ts`) is production-only static serving; not needed during development.
- All route/stop/schedule data comes from hardcoded CloudFront CDN URLs in `client/src/lib/transitData.ts`.
