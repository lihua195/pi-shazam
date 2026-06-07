---
name: pi-extension
description: "How to register native Pi tools as a Pi package. Covers registerTool(), createTool() factory, TypeBox schemas, customExecute for async tools, and index.ts entry point. Use when creating or modifying Pi tools."
---

# Pi Extension — Native Tool Registration

Register tools as a Pi package. Tools appear alongside `read`/`bash`.

## Entry Point

`index.ts` — default export receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "./types/pi-extension.js";

export default function (pi: ExtensionAPI): void {
  // register tools, hooks, commands here
}
```

## Tool via factory (recommended)

```typescript
import { createTool } from "./_factory.js";
import { Type } from "typebox";

createTool(pi, {
  name: "shazam_mytool",
  label: "My Tool",
  description: "When to use this tool...",
  params: Type.Object({
    query: Type.String(),
    limit: Type.Optional(Type.Number()),
  }),
  execute(graph, params) {
    return "output string";
  },
});
```

Factory auto-handles: `json`/`maxTokens` params, `scanProject(".")`, envelope, truncation.

## Async / LSP tools

```typescript
createTool(pi, {
  // ...
  customExecute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const graph = scanProject(".");
    // async + LSP logic
    return { content: [{ type: "text", text: "result" }] };
  },
});
```

## TypeBox schemas

```typescript
import { Type } from "typebox";  // NOT pi.typebox

Type.Object({
  name: Type.String(),
  files: Type.Array(Type.String()),
  dryRun: Type.Optional(Type.Boolean()),
  mode: Type.Optional(Type.Union([Type.Literal("state")])),
});
```

## Description style rotation

Vary across 5 styles: Scenario trigger, Prerequisite, Consequence hint, Action binding, Anti-pattern warning.

## Registration checklist

1. Create `tools/<name>.ts` with `register*` function
2. Import + call in `index.ts`
3. Update tool table in `AGENTS.md`
4. Add docs to `SKILL.md`
5. Update `README.md` if user-facing
6. Sync `mcp/tools.ts` in same PR
