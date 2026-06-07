---
name: pi-hooks
description: "How to write Pi extension hooks that subscribe to lifecycle events. Covers pi.on() events, handler signatures, system prompt injection, tool_call/tool_result interception, logging patterns. Use when adding hooks to a Pi extension."
---

# Pi Hooks — Lifecycle Event Handlers

Hooks subscribe to Pi lifecycle events via `pi.on()`. They live in `hooks/` and are registered in `index.ts`.

## Event Reference

| Event | Fires when | Handler receives |
|-------|-----------|-----------------|
| `before_agent_start` | User submits prompt, before agent loop | `{ prompt, systemPrompt, images }` |
| `tool_call` | LLM decides to call a tool | `{ toolCallId, toolName, input }` |
| `tool_result` | Tool execution completes | `{ toolCallId, toolName, content, isError }` |
| `tool_execution_start` | Tool begins executing | `{ toolCallId, toolName, args }` |
| `tool_execution_end` | Tool finishes executing | `{ toolCallId, toolName, result, isError }` |
| `agent_end` | Agent loop ends | `{ messages }` |
| `session_start` | Session begins | — |
| `session_shutdown` | Session ends | — |

Full list in `types/pi-extension.d.ts`.

## Registration

```typescript
// hooks/my-hook.ts
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerMyHook(pi: ExtensionAPI): void {
  pi.on("tool_call", (event, ctx) => {
    // event.toolName, event.input, ctx.cwd, ctx.sendMessage(), etc.
  });
}
```

```typescript
// index.ts
import { registerMyHook } from "./hooks/my-hook.js";
// inside default export:
registerMyHook(pi);
```

## Handler signature

`(event: E, ctx: ExtensionContext) => R | void`

- `ctx.cwd` — working directory
- `ctx.ui?.notify?.(msg, type)` — show notification
- `pi.sendMessage(...)` — inject message into conversation
- Return `{ block: true, reason: "..." }` to block a tool call

## System prompt injection

```typescript
pi.on("before_agent_start", (_event, _ctx) => {
  const sp = Array.isArray(_event.systemPrompt)
    ? _event.systemPrompt.join("\n")
    : String(_event.systemPrompt ?? "");
  if (sp.includes("my-guide")) return; // avoid double injection

  return {
    systemPrompt: sp + "\n\nmy guidance text here",
  };
});
```

**Critical**: `systemPrompt` may be `string` or `string[]` at runtime. Always check with `Array.isArray()`.

## Logging pattern

Follow audit-guard.ts convention — write to `~/.pi/hooks/audit/`:

```typescript
import { appendFileSync, mkdirSync } from "node:fs";

const AUDIT_DIR = join(homedir(), ".pi", "hooks", "audit");
function write(line: string) {
  mkdirSync(AUDIT_DIR, { recursive: true });
  appendFileSync(join(AUDIT_DIR, "my-log.log"), line + "\n", "utf-8");
}
```

## Existing hooks in pi-shazam

| Hook | Event | Purpose |
|------|-------|---------|
| `before-start.ts` | `before_agent_start` | Inject project structure overview |
| `after-write.ts` | `tool_result` | Auto-verify after write/edit |
| `shazam-guide.ts` | `before_agent_start` + `tool_result` + `tool_call` | Nudge agent to use shazam tools |
| `tool-logger.ts` | `tool_call` + `tool_result` | Log shazam calls to audit dir |
