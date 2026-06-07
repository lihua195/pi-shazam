---
name: architecture
description: "pi-shazam's 4-layer architecture: core (pure analysis), lsp (language servers), tools (Pi/MCP wrappers), hooks (auto event handlers). Layer dependency rules, file organization, and key design decisions."
---

# Architecture

## Layers (bottom-up)

```
core/         Pure analysis — zero Pi, LSP, or MCP imports
  treesitter.ts   AST parsing (14 languages)
  graph.ts        Symbol dependency graph
  pagerank.ts     PageRank scoring
  scanner.ts      Project walking + graph building
  encoding.ts     Adaptive encoding
  cache.ts        Baseline + graph diff

lsp/          Language server management
  manager.ts      Spawn, stdio, health, shutdown
  client.ts       JSON-RPC via vscode-jsonrpc
  servers.ts      6 language configs
  setup.ts        /shazam-setup command

tools/        Pi tool wrappers (one file per tool)
  _factory.ts     createTool() — json/maxTokens, scan, envelope
  _context.ts     Shared LspManager holder
  overview.ts, impact.ts, verify.ts, ... (14 tool files)

hooks/        Automatic event handlers
  before-start.ts   Inject overview into prompt
  after-write.ts    Auto-verify after edits
  shazam-guide.ts   Nudge agent to use tools
  tool-logger.ts    Usage analytics

mcp/          MCP server for non-Pi clients
  entry.ts          McpServer + StdioServerTransport
  tools.ts          13 registerTool calls + withLogging
```

## Dependency direction

```
hooks/ → tools/ → core/ + lsp/
mcp/   → core/ + lsp/
```

Core MUST NOT import from tools, hooks, lsp, or mcp.

## File organization

- One file = one business concept
- Tool files export `register*` function + `execute*` function
- Hook files export `register*` function only
- index.ts is the single registration coordinator
