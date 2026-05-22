# Work modes (Chat · CoWork · Codex)

FIGHURAI Settings let you pick how the assistant behaves. These are **behavior presets** inspired by two major agent products—not live integrations with Anthropic or OpenAI’s separate apps.

## Chat (default)

Standard assistant: questions, drafting, analysis, and build requests when you ask. Same as a typical ChatGPT / Claude conversation.

## CoWork (Anthropic Claude Cowork)

**What Cowork is:** Anthropic’s agentic mode for **non-coding knowledge work** in Claude Desktop. Users describe an **outcome**; Claude works across local files, folders, and connectors and returns **finished deliverables** (documents, organized folders, research summaries)—not just one-off chat replies.

**Key ideas we mirror in FIGHURAI CoWork mode:**

- **Outcome over prompts** — break work into phases, then deliver a polished result.
- **Local / device context** — pair with **This device · folder** in Settings for file-organizing plans and scripts.
- **Multi-step execution** — checklists, file trees, drafts, and “when you’re back” summaries.
- **No terminal required** — unlike Claude Code; aimed at marketers, ops, and general knowledge work.
- **Human oversight** — propose actions; user runs sensitive steps unless real tools exist.

**Not included:** Claude Desktop, scheduled Cowork tasks, or Anthropic’s cloud sandboxes—we only adapt the *workflow style* in chat.

References: [Claude Cowork product](https://www.anthropic.com/product/claude-cowork), [Help Center](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork).

## Codex (OpenAI Codex)

**What Codex is:** OpenAI’s **software engineering agent**—CLI, desktop app, and ChatGPT sidebar. It reads repos, edits multiple files, runs tests/linters in sandboxes, and opens PRs. Recent versions (e.g. GPT‑5.3‑Codex) emphasize long-running tasks, parallel agents, and steering while the agent works.

**Key ideas we mirror in FIGHURAI Codex mode:**

- **Feature-level tasks** — treat requests as “implement X in this codebase.”
- **Multi-file diffs** — structured changes, not single snippets only.
- **Verify** — suggest tests, commands, and CI steps; iterate until green.
- **PR mindset** — summary, files touched, risks, and review notes.
- **Steer mid-flight** — ask clarifying questions, then continue in the same thread.

**Not included:** OpenAI’s cloud sandbox, `@openai/codex` CLI, or automatic GitHub PR creation—we adapt the *engineering agent style* in chat and the Build workspace.

References: [Introducing Codex](https://openai.com/index/introducing-codex/), [Codex product](https://openai.com/codex/), [openai/codex CLI](https://github.com/openai/codex).

## How to use in FIGHURAI

1. **Settings** → **Work mode** → choose **Chat**, **CoWork**, or **Codex**.
2. **CoWork** works best with **This device · folder** and connected Google/Microsoft accounts (for planning; live API tools may still be limited).
3. **Codex** works best when you ask to build, fix, or refactor software—use the Build panel for HTML/code previews.
