# Agent Skills & App Management

FigHur **Skills** and an **App Management** registry.

## Settings panel

- **Header Settings** — quick Customize, Skills, Connectors, Apps, MCP (Tasks tab links out)
- **Full page** `/settings` — Behavior & Response instructions, Tasks (edit/run/results), Agents CRUD, Deep Research prefs

| Area | Purpose |
|------|---------|
| **Customize** (behavior + response) | Standing instructions for how FIGHURAI thinks and replies |
| **Agents** (`/settings?tab=agents`) | Custom agents |
| **Tasks** (`/settings?tab=tasks`) | Scheduled / recurring agent workflows |
| **Deep Research** | Multi-source research prefs + live web |
| **Skills** | Enable, import, and manage skill packs |
| **Connectors** | First-party mail / calendar / device links |
| **Apps** | Apps and Chrome extensions |
| **MCP** | MCP server configuration |

Model picker includes **Auto** — rules-based routing within the user’s plan.

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
