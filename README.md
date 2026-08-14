# Agentic Kanban

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.5-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-server-blueviolet)](https://modelcontextprotocol.io)

An open source, self-hosted kanban board — like a tiny Jira — built so that **humans and AI agents share the same board**. Humans get a polished drag-and-drop web app; agents get a first-class [MCP](https://modelcontextprotocol.io) server to read, create, move and comment on tasks.

```
┌────────────┐   REST API   ┌────────────────────┐
│  Web app   │ ───────────► │                    │
└────────────┘              │  Kanban server     │      SQLite
┌────────────┐   REST API   │  (Express)         │ ────────────►
│ MCP server │ ───────────► │                    │   kanban.db
└────────────┘              └────────────────────┘
      ▲
      │ stdio (MCP)
┌────────────┐
│ AI agents  │  Claude, opencode, any MCP client
└────────────┘
```

## Features

- **Boards, columns, tasks** — multiple boards, customizable columns, Jira-style task keys (`MB-1`, `MB-2`, …)
- **Shared boards** — invite anyone with an account by email (*Share* button); owners and members edit the same board, members can leave anytime
- **Live updates** — the web app refreshes in real time over Server-Sent Events when collaborators *or agents* change anything
- **Drag & drop** web UI with search, assignee filter, priorities, labels and comments
- **Fluid layout** — columns share the full width evenly and shrink as you add more; no horizontal scrolling
- **Agent-native**: MCP server with 11 tools; agents reference tasks by human keys (`move_task MB-3 → "In progress"`)
- **Assign to anyone** — people (`ana`) or agents (`agent:claude`), with distinct avatars in the UI
- **Zero external services** — SQLite storage via `node:sqlite` (no native modules, no database server)
- **MIT licensed**, TypeScript end to end

## Quick start

Requires Node.js **22.5+** (22.5–23.3 need `--experimental-sqlite`; 23.4+ works out of the box).

```bash
npm install
npm run dev        # API on :3001 + web dev server on :5173
```

Open http://localhost:5173 and start dragging tasks around.

### Production

```bash
npm run build
npm start          # serves API + built web app on http://localhost:3001
```

Configuration via environment variables:

| Variable          | Default                        | Purpose                          |
| ----------------- | ------------------------------ | -------------------------------- |
| `PORT`            | `3001`                         | HTTP port for API + web          |
| `KANBAN_DB`       | `server/data/kanban.db`        | SQLite database file             |
| `KANBAN_WEB_DIST` | `web/dist`                     | Built web app to serve           |

### Accounts and access control

Everyone needs an account: sign up from the sign-in screen, and your boards, tasks and API
tokens are private to you — unless you share a board: open *Share* in the top bar and invite
people by email. Owners keep admin rights (invite, remove members, delete the board); members
can edit everything and leave whenever they want. Board keys are still unique server-wide.
Session tokens last 30 days.

API access uses bearer tokens:

- **Web app**: logged-in sessions via `POST /api/auth/login` and `/api/auth/register`
- **Agents (MCP)**: long-lived API tokens you create in the UI under *API tokens*, sent as
  `Authorization: Bearer kt_…`

## Connect your agents (MCP)

Build once (`npm run build`), then point any MCP client at `mcp/dist/index.js`.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["/absolute/path/to/agentic-kanban/mcp/dist/index.js"],
      "env": {
        "KANBAN_API_URL": "http://localhost:3001/api",
        "KANBAN_AUTHOR": "agent:claude"
      }
    }
  }
}
```

**opencode** (`opencode.json`):

```json
{
  "mcp": {
    "kanban": {
      "type": "local",
      "command": ["node", "/absolute/path/to/agentic-kanban/mcp/dist/index.js"],
      "environment": { "KANBAN_API_URL": "http://localhost:3001/api" }
    }
  }
}
```

| MCP env var       | Default                       | Purpose                                |
| ----------------- | ----------------------------- | -------------------------------------- |
| `KANBAN_API_URL`  | `http://localhost:3001/api`   | Base URL of the Kanban API             |
| `KANBAN_AUTHOR`   | `agent`                       | Default author for agent comments      |
| `KANBAN_AUTH_TOKEN` | *(none)*                    | Your API token (create it in the web app under *API tokens*) |

### MCP tools

| Tool           | What it does                                                            |
| -------------- | ----------------------------------------------------------------------- |
| `list_boards`  | List boards with keys and task counts                                   |
| `get_board`    | Full board: columns + tasks, ordered as in the UI                       |
| `create_board` | Create a board with default columns (Backlog, To do, In progress, Done) |
| `list_tasks`   | Filter by board, column, assignee, label or free text                   |
| `get_task`     | Full task details                                                       |
| `create_task`  | Create a task (returns its key, e.g. `MB-4`)                            |
| `update_task`  | Change title, description, priority, assignee or labels                 |
| `move_task`    | Move between columns by name (`"Done"`) or id                           |
| `delete_task`  | Delete a task and its comments                                          |
| `add_comment`  | Report progress/results on a task                                       |
| `list_comments`| Read the task's activity                                                |

Typical agent flow: `list_boards` → `get_board` → pick a task assigned to itself → `move_task` to *In progress* → work → `add_comment` with results → `move_task` to *Done*.

Verify everything works with the smoke test (server must be running):

```bash
npm run build -w @agentic-kanban/mcp
node mcp/scripts/smoke-test.mjs
```

## REST API

Everything the MCP server can do, the API does directly. Base URL: `/api`.

```
GET    /api/health
POST   /api/auth/register           { "email", "password" } → session
POST   /api/auth/login              { "email", "password" } → session
POST   /api/auth/logout             revokes the current session
GET    /api/auth/me
GET    /api/tokens                  POST /api/tokens { "name" } → kt_… shown once
POST   /api/tokens/:id/revoke
GET    /api/boards                  POST /api/boards
GET    /api/boards/:id              PATCH|DELETE /api/boards/:id
GET    /api/boards/:id/members      POST /api/boards/:id/members { "email" }
DELETE /api/boards/:id/members/:userId
GET    /api/events                  SSE stream (accepts ?token= for EventSource)
POST   /api/boards/:id/columns      PATCH|DELETE /api/columns/:id
GET    /api/tasks?board=&column=&assignee=&label=&q=
POST   /api/tasks                   GET|PATCH|DELETE /api/tasks/:idOrKey
POST   /api/tasks/:idOrKey/move     { "column": "Done", "position?": 1234 }
GET    /api/tasks/:idOrKey/comments POST /api/tasks/:idOrKey/comments
```

Except for `/api/health`, `/api/auth/register` and `/api/auth/login`, every endpoint requires
`Authorization: Bearer <token>` — a session token for the web app or a `kt_…` API token for agents.
All data is scoped to the authenticated account and the boards shared with it.

Boards, tasks and columns can all be referenced by id **or** human key (`MB`, `MB-3`, `"In progress"`). Errors are JSON: `{ "error": "Task not found" }` with proper status codes.

## Project structure

```
agentic-kanban/
├── server/          # Express + node:sqlite — REST API, hosts the built web app
├── mcp/             # MCP stdio server (thin client over the REST API)
│   └── scripts/     # smoke-test.mjs — end-to-end MCP check
└── web/             # React + Vite + Tailwind + dnd-kit
```

## License

[MIT](LICENSE) © 2026 RchrdHndrcks
