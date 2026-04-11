# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external dependencies, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Platform

- macOS only (no Windows/Linux support planned)
- Targets macOS 13+ (Ventura) for vibrancy and native notification APIs

## Required External Dependencies

- **Node.js v24+** (v24.11.1 confirmed via fnm)
- **pnpm v9+** (package manager of choice — faster than npm)
- **Droid CLI v0.84.0+** at `~/.local/bin/droid` (or anywhere on PATH)
- **Git** (v2.52.0 confirmed)

## Key Paths

- **Droid sessions:** `~/.factory/sessions/` (read-only, ~265 bucket directories, ~356 files)
- **Droid settings:** `~/.factory/settings.json` (read-only)
- **App data:** `~/Library/Application Support/oxox/` (Electron userData)
- **SQLite DB:** `~/Library/Application Support/oxox/oxox.db`

## Machine Resources (Development)

- 32GB RAM, 10 CPU cores
- ~24GB typically used at baseline
- Disk at ~97% — monitor during development

## Fonts

- Geist: Must be bundled (not a system font)
- Inter: Must be bundled
- SF Mono: System font on macOS, but bundle for consistency

## Native Dependencies

- `better-sqlite3`: Requires native rebuild for Electron (`electron-rebuild -f -w better-sqlite3`)
- pnpm v10 blocks dependency build scripts by default; keep `package.json` `pnpm.onlyBuiltDependencies` aligned so `electron`, `esbuild`, and other required native installers can run during `pnpm install`
- The repo carries a local `electron-rebuild` devDependency so `.factory/init.sh` and validation commands can rebuild `better-sqlite3` without relying on a global install
