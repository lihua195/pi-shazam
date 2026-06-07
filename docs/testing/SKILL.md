---
name: testing
description: "How to test pi-shazam tools and hooks. Covers vitest setup, mock graph pattern (getGraph/scanProject), tool output validation, schema testing, and Pi integration smoke tests."
---

# Testing Patterns

## Test framework

vitest, 208 tests across 18 test files. Run: `npm test`

## Graph mock pattern

```typescript
import { scanProject } from "../core/scanner.js";
import type { RepoGraph } from "../core/graph.js";

let _graph: RepoGraph | null = null;
function getGraph(): RepoGraph {
  if (!_graph) _graph = scanProject(".");
  return _graph;
}
```

Use `scanProject(".")` for real-project tests (cached after first call).

## Tool output tests

```typescript
it("should return project structure summary", async () => {
  const { executeOverview } = await import("../tools/overview.js");
  const result = executeOverview(getGraph(), ".");
  expect(result).toBeDefined();
  expect(typeof result).toBe("string");
  expect(result.length).toBeGreaterThan(0);
  expect(result).toMatch(/index\.ts|Top|PageRank/i);
});
```

## Schema tests (Zod / MCP)

```typescript
it("overview schema should accept optional filter", () => {
  const schema = z.object({ filter: z.string().optional() });
  expect(() => schema.parse({})).not.toThrow();
  expect(() => schema.parse({ filter: "index" })).not.toThrow();
});
```

## Pi integration smoke test

```bash
pi install npm:pi-shazam@latest
pi -p "call shazam_overview briefly"
pi -p "call shazam_verify"
pi -p "call shazam_hotspots"
```

Check: no `Extension error` in output, tools return meaningful results.

## MCP smoke test

```bash
printf '{"jsonrpc":"2.0","id":0,"method":"initialize",...}\n{"jsonrpc":"2.0","id":1,"method":"tools/call",...}\n' \
  | timeout 15 node dist/mcp/entry.js . 2>/dev/null | tail -1

# Verify: {"result":{"content":[...]}}
```

## Hook verification

```bash
# Verify hooks are registered in dist
grep "registerShazamGuide\|registerToolLogger\|registerBeforeStart\|registerAfterWrite" dist/index.js
```
