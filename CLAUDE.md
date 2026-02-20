# CLAUDE.md

This file provides guidance to Claude when working with code in this repository.
It lives inside the project folder and is tracked by git, so it stays up to date with the code.

---

## What This Project Is

This is a **local MCP server** that connects Claude Desktop to Lever ATS (a recruiting tool).

MCP stands for Model Context Protocol — it's a standard way for Claude to talk to external tools
and services. This server acts as a bridge: Claude Desktop asks it to do things (like "search for
candidates" or "add a note"), and it calls the Lever API to make those things happen.

The user is a **complete beginner at coding**. All explanations should use plain English, define
technical terms when they're introduced, and explain the "why" behind things, not just the "what".

---

## How It Currently Works (Local Mode)

Claude Desktop runs this server as a background process on the user's computer. They communicate
via **stdio** — a pipe connecting their stdin/stdout streams. Claude Desktop sends JSON messages
in, and the server sends JSON messages back.

**Critical rule for stdio mode:** `console.log()` writes to stdout, which breaks the JSON protocol
and crashes Claude Desktop. Always use `console.error()` for any debug or info logging — it writes
to stderr, which Claude Desktop ignores safely.

The server reads the Lever API key from a `.env` file in the project root:
```
LEVER_API_KEY=your-key-here
```

---

## Entry Points — Which File Actually Runs

This project has two active entry point files depending on how it's being run:

| File | Status | Purpose |
|------|--------|---------|
| `src/server.ts` | ✅ **Active — Cloud Run HTTP server** | Deployed to Google Cloud Run, uses HTTP transport |
| `src/local.ts` | ✅ **Active — this is what Claude Desktop runs** | Local stdio transport for Claude Desktop |

When Claude Desktop starts the server, it runs:
```
node dist/local.js
```
...which is the compiled output of `src/local.ts`.

Both entry points load all the same tools via `registerAllTools()` in `src/tools.ts` — the only
difference is the transport layer (how Claude communicates with the server).

---

## Development Commands

```bash
# Compile TypeScript → JavaScript (REQUIRED after any code change)
# TypeScript is what you write; JavaScript is what the computer runs.
# Output goes into the dist/ folder.
npm run build

# Start the server locally (reads API key from .env file)
npm run start:local

# Start in dev mode — auto-restarts when you save changes (useful while developing)
npm run dev:local

# Check for TypeScript errors without building (faster than a full build)
npm run type-check

# Auto-fix code style/formatting issues
npm run lint:fix

# Run automated tests
npm run test
```

**After any code change:** run `npm run build`, then restart Claude Desktop for changes to take effect.

---

## File Structure

```
src/
  server.ts             ← ACTIVE entry point. Sets up the MCP server with Express HTTP.
                          Handles OAuth for cloud mode, stdio for local mode.
                          Calls registerAllTools() to load all the tools.

  local.ts              ← Entry point for Claude Desktop (local stdio transport).
                          Reads the API key from .env, creates the MCP server,
                          and connects it to stdio so Claude Desktop can talk to it.

  tools.ts              ← Registers all the "main" tools (search, candidate, utility).
                          Called by both server.ts and local.ts on startup.
                          Also calls into additional-tools.ts and interview-tools.ts.

  additional-tools.ts   ← Registers extra tools on top of what's in tools.ts.
                          Contains: search candidates, list files, list applications,
                          list/get requisitions, archive candidate, search archived
                          candidates, update candidate.

  interview-tools.ts    ← Registers interview-related tools.
                          Contains: get_interview_insights, manage_interview.

  lever/
    client.ts           ← The HTTP client that calls Lever's API.
                          All actual API requests go through here.
                          Think of it as the "phone" that dials Lever.

  auth/
    index.ts            ← Exports all auth-related functions
    middleware.ts       ← Validates OAuth tokens on incoming requests (cloud mode only)
    metadata.ts         ← Serves the OAuth metadata endpoint (required by OAuth spec)
    constants.ts        ← OAuth configuration values
    types.ts            ← TypeScript type definitions for auth objects

  types/
    lever.ts            ← TypeScript type definitions for Lever data structures.
                          Describes what a "candidate", "posting", "stage" etc. look like.

  utils/
    stage-helpers.ts    ← Helper functions for converting stage names to stage IDs.
                          Lever's API uses UUIDs for stages, not human-readable names.
                          These helpers let you say "Phone Screen" instead of a UUID.

dist/                   ← Auto-generated compiled JavaScript. Never edit manually.
                          Regenerated every time you run npm run build.

.env                    ← Your secret Lever API key. Never commit this to git.
.env.example            ← Template showing the format (safe to commit, no real key).
```

---

## All Available Tools (~18 total)

These are the capabilities Claude has through this server. Each "tool" is a function Claude
can call by name.

### Tools from `src/tools.ts` (registered via registerAllTools)

| Tool | What It Does |
|------|-------------|
| `lever_advanced_search` | Search all candidates by company, skills, location, stage, tags, name, or email. Supports pagination and "comprehensive" vs "quick" modes. |
| `lever_get_candidate` | Get full details for one candidate using their opportunity ID. |
| `lever_add_note` | Add a text note to a candidate's profile in Lever. |
| `lever_list_open_roles` | List all published job postings, with owner and hiring manager info. |
| `lever_get_stages` | Get all pipeline stages (e.g. "Phone Screen", "Offer", "Hired"). |
| `lever_get_archive_reasons` | Get all reasons a candidate can be archived (e.g. "Not a fit"). |
| `lever_find_postings_by_owner` | Find job postings assigned to a specific recruiter (by name or ID). |
| `lever_find_candidates_for_role` | Get all candidates who applied to a specific job posting. |

### Tools from `src/additional-tools.ts`

| Tool | What It Does |
|------|-------------|
| `lever_search_candidates` | Simpler/faster search by name or email. Good for quick lookups. |
| `lever_list_files` | List all files and resumes attached to a candidate. |
| `lever_list_applications` | List all job applications for a candidate (one person can apply to multiple roles). |
| `lever_list_requisitions` | List job requisitions (a requisition = an official approval to hire for a role). |
| `lever_get_requisition_details` | Get full details for a requisition — accepts either the Lever UUID or the HRIS code (e.g. "ENG-145"). |
| `lever_archive_candidate` | Archive a candidate (remove from active pipeline) with a specified reason. |
| `lever_search_archived_candidates` | Search through previously archived candidates, with optional interview data. |
| `lever_update_candidate` | Move a candidate to a new stage, assign an owner, or add/remove tags. |

### Tools from `src/interview-tools.ts`

| Tool | What It Does |
|------|-------------|
| `lever_get_interview_insights` | Get interview data for a candidate. Supports four views: dashboard (summary), detailed, analytics, and preparation. |
| `lever_manage_interview` | Schedule, reschedule, or cancel interviews. Note: interviews created in Lever's UI cannot be modified via API. |

---

## Architecture Notes

### How tools get registered

`src/local.ts` (or `src/server.ts` for cloud) calls `registerAllTools(server, apiKey)` on startup.
That function, defined in `src/tools.ts`, calls:
- `registerAdditionalTools()` from `additional-tools.ts`
- `registerInterviewTools()` from `interview-tools.ts`

Each tool is registered with `server.tool(name, schema, handler)` where:
- `name` = the tool name Claude uses to call it (e.g. `"lever_get_candidate"`)
- `schema` = a Zod schema defining what parameters the tool accepts and their types
  (Zod is a library that validates data — like saying "this must be a string, that must be a number")
- `handler` = the async function that runs when the tool is called

### How candidate data flows

1. Claude calls a tool (e.g. `lever_get_candidate`) with an ID
2. The tool handler calls a method on `LeverClient` (e.g. `client.getOpportunity(id)`)
3. `LeverClient` makes an HTTP request to `https://api.lever.co/v1/...`
4. Lever returns raw JSON data
5. The handler formats it using `formatOpportunity()` to clean it up
6. The formatted result is returned to Claude as a JSON string

### Stage name resolution

Lever's API requires stage UUIDs (e.g. `"a1b2c3d4-..."`) not human names. The helpers in
`src/utils/stage-helpers.ts` solve this by fetching all stages, building a name→ID lookup table,
and resolving names to IDs automatically. Partial matching is supported ("Phone" finds "Phone Screen").

---

## Known Limitations

1. **No full-text search in Lever API** — The Lever API doesn't support searching candidate
   profiles by keyword. Name searches work by fetching candidates in bulk and filtering locally,
   which means they only scan the first 500-1000 candidates.

2. **Files can't be downloaded** — Tools can list file metadata (name, size, upload date) but
   cannot download the actual file content. Users access files through Lever's web interface.

3. **Some interview operations are restricted** — Interviews created through Lever's UI are
   marked as "externally managed" and cannot be modified via the API.

4. **Owner updates not fully implemented** — `lever_update_candidate` notes that owner reassignment
   is not yet implemented in LeverClient (the method doesn't exist yet).

---

## History / Context

This project started as a **Cloudflare Workers** deployment. It was later adapted to run locally
on the user's computer using Node.js and stdio transport. The local version lives on the
`local-node` git branch. The `main` branch still contains the original Cloudflare version.
The legacy Cloudflare files (`src/index.ts`, `wrangler.jsonc`, `deploy.sh`) have since been
deleted from the `local-node` branch as part of a cleanup.

The key bug fixed during local adaptation: `console.log()` calls were crashing Claude Desktop
because stdout is reserved for JSON protocol messages in stdio mode. Fixed by switching all
debug logging to `console.error()`.
