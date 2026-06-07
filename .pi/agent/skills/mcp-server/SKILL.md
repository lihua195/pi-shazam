---
name: mcp-server
description: "How to wrap pi-shazam tools as MCP tools. Covers McpServer, StdioServerTransport, registerTool with Zod, withLogging wrapper, and MCP sync discipline."
---

# MCP Server

Wraps pi-shazam core tools as MCP server at `npx pi-shazam-mcp`.

## Entry (`mcp/entry.ts`)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "pi-shazam", version: "0.3.1" });
const graph = scanProject(projectRoot);
registerAllTools(server, graph, projectRoot);
await server.connect(new StdioServerTransport());
```

`package.json` must have: `"bin": { "pi-shazam-mcp": "dist/mcp/entry.js" }`

## Tool registration (`mcp/tools.ts`)

```typescript
server.registerTool("shazam_xxx", {
  description: "...",
  inputSchema: z.object({ param: z.string() }),
}, withLogging("shazam_xxx", async ({ param }) => {
  const text = executeXxx(graph, param);
  return { content: [{ type: "text", text }] };
}));
```

### Zod schemas (NOT TypeBox)

```typescript
import { z } from "zod";
z.object({
  name: z.string(),
  files: z.array(z.string()),
  mode: z.enum(["state"]).optional(),
  dryRun: z.boolean().optional().default(true),
});
```

### withLogging wrapper

Logs start/end/duration/error to `~/.kimi-code/audit/shazam-calls.log`. Every handler must be wrapped.

## Sync discipline (same PR)

| Pi change | MCP action |
|-----------|------------|
| New/delete tool | Add/remove `registerTool` |
| Schema changed | Update Zod schema |
| Description changed | Sync description |

## Client config

```json
{ "mcpServers": { "pi-shazam": { "command": "npx", "args": ["pi-shazam-mcp"] } } }
```
