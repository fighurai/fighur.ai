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
| **Tasks** | Scheduled / recurring agent prompts |
| **MCP** | Settings → Connectors → MCP — remote HTTP/SSE tools run in chat |

Model picker includes **Auto (RouteLLM)** — rules-based routing to coding / research / creative / quick / chat models within the user’s plan.

## Skills

- Built-ins live in `src/lib/skills/builtins.ts` (SKILL.md format).
- Per-user prefs: Blob/disk `skills.json` (disable builtins, import custom).
- Chat auto-matches skills from the user message and injects full skill bodies into the system prompt.
- Optional request field: `skillAllowlist: string[]` for conversation-level preselect.

### API

- `GET /api/skills` — list skills (anonymous sees builtins)
- `POST /api/skills` — `{ action: "toggle"|"import"|"export"|"delete", ... }` (signed-in)

## MCP

- Config: Settings → **MCP** (`mcpServers` JSON). Signed-in users persist via `PUT /api/mcp`; browser always keeps a local copy for chat.
- Runtime: hosted FigHur connects to **remote** servers (`url` — Streamable HTTP, with SSE fallback). Tools appear as `mcp__server__tool` in the agent loop.
- Stdio (`command` / `args`) is stored for desktop hosts but is not executed on Vercel.
- `POST /api/mcp` with `{ action: "probe", config? }` lists tools / connection errors (signed-in).

## New agent tools

| Tool | Purpose |
|------|---------|
| `run_code` | Sandboxed JavaScript (no network/fs) |
| `generate_artifact` | Downloadable md/csv/json/html/txt |
| `save_app` | Persist Canvas files into App Management |
| `publish_app` / `unpublish_app` | Live URL at `/a/<slug>` |
| `create_task` / `list_tasks` / `delete_task` | Scheduled prompts (hourly/daily/weekly) |
| `mcp__…` | User-configured remote MCP tools |

Tool loops run on **Anthropic and OpenAI-compatible** providers when needed.

## Apps

- `GET /api/apps` — list apps (signed-in)
- `GET /api/apps?id=` — app detail with files
- `POST /api/apps` — `{ action: "create"|"update"|"publish"|"unpublish"|"archive", ... }`

### Hosting

1. Save files (need `index.html` or another `.html` entry).
2. **Publish** → public URL `{site}/a/{slug}` (also via `publish_app` tool).
3. **Unpublish** / **Archive** takes the URL offline.

Static HTML/CSS/JS (and common assets) are served from the app registry. Custom `*.fighur.app` subdomains are not enabled yet.

## Tasks

- Settings → **Tasks**: create hourly / daily / weekly prompts; enable/disable; view last result.
- `GET/POST /api/tasks` — session-authed CRUD.
- `GET|POST /api/cron/tasks` — Vercel Cron (daily via `vercel.json` on Hobby; Pro can use `*/15 * * * *`); requires `Authorization: Bearer $CRON_SECRET` in production.
- Durable schedules need Blob (`BLOB_READ_WRITE_TOKEN`) — `/tmp` alone will not survive deploys.
- Agent tools: `create_task`, `list_tasks`, `delete_task`. Runs are text-only (no tool loop).
