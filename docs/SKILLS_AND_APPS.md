# Agent Skills & App Management

FigHur mirrors Abacus-style **Skills** and an **App Management** registry.

## Settings panel (Abacus-aligned)

Open **Settings** in the header. Tabs map to Abacus surfaces:

| FigHur tab | Abacus equivalent |
|------------|-------------------|
| **Customize** | Customize & Add Skills → custom instructions + work mode |
| **Skills** | Customize & Add Skills → Agent tab (toggles, import, export) |
| **Connectors** | Profile → First Party Connectors |
| **Apps** | Apps Management Console |
| **MCP** | Settings → Connectors → MCP Server Configuration (config saved; runtime next) |

## Skills

- Built-ins live in `src/lib/skills/builtins.ts` (SKILL.md format).
- Per-user prefs: Blob/disk `skills.json` (disable builtins, import custom).
- Chat auto-matches skills from the user message and injects full skill bodies into the system prompt.
- Optional request field: `skillAllowlist: string[]` for conversation-level preselect.

### API

- `GET /api/skills` — list skills (anonymous sees builtins)
- `POST /api/skills` — `{ action: "toggle"|"import"|"export"|"delete", ... }` (signed-in)

## New agent tools

| Tool | Purpose |
|------|---------|
| `run_code` | Sandboxed JavaScript (no network/fs) |
| `generate_artifact` | Downloadable md/csv/json/html/txt |
| `save_app` | Persist Canvas files into App Management |

Tool loops run on **Anthropic and OpenAI-compatible** providers when needed.

## Apps

- `GET /api/apps` — list apps (signed-in)
- `GET /api/apps?id=` — app detail with files
- `POST /api/apps` — `{ action: "create"|"update"|"archive", ... }`

Live hosting / custom domains are **not** enabled yet — apps are stored for future deploy.
