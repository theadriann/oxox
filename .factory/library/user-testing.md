# User Testing

Testing surface, required testing tools, resource cost classification, and validation approach.

---

## Validation Surface

- **Primary surface:** Electron desktop app UI on macOS
- **Tool:** agent-browser v0.17.1 (confirmed functional at `/Users/brojbean/.factory/bin/agent-browser`)
- **Approach:** Launch Electron app in dev mode on port 3105, use agent-browser to navigate, interact, screenshot, and verify behavior
- **Session isolation:** Use `--session <name>` flag for isolated agent-browser sessions to avoid colliding with default sessions

## Validation Concurrency

- **Machine:** 32GB RAM, 10 CPU cores, macOS
- **Baseline usage:** ~24GB RAM used
- **Effective headroom (70%):** ~5.6GB
- **Per-validator cost:** Electron window (~400MB) + agent-browser (~300MB) = ~700MB
- **Max concurrent validators: 2** (conservative; 2 × 700MB = 1.4GB within 5.6GB budget, leaving headroom for dev server and system processes)

## Testing Approach

### Automated Tests (Vitest)
- Unit tests for integration layer, MobX stores, utilities, protocol parsing
- Component tests via React Testing Library for UI components
- Protocol fixture tests for wire-format compatibility with SDK

### User Testing (agent-browser)
- Launch app via `pnpm run dev` or `pnpm exec electron .`
- agent-browser connects to Electron renderer window
- Each assertion tested via agent-browser interaction flows
- Screenshots captured as evidence for each assertion

### Known Constraints
- Testing live Droid session interaction requires actual `droid` CLI and valid FACTORY_API_KEY
- Session creation/attach tests need real Droid process spawning
- Daemon-dependent features (search, archive) require daemon running
- Some assertions may need mock/stub transports for isolated testing
