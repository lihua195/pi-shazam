# LLM Review Guide for pi-shazam

You are reviewing **pi-shazam**, a Pi coding agent native codebase awareness extension that unifies tree-sitter parsing, LSP diagnostics, and PageRank-based dependency graph analysis into LLM-callable tools. This guide focuses your review on real bugs and reliability issues only.

## Project Context

- **What it is**: TypeScript Pi extension providing 9 codebase analysis tools (overview, lookup, impact, verify, format, changes, find_tests, rename_symbol, safe_delete) plus hooks for agent lifecycle events.
- **Size**: 94 source files across 5 modules (core, tools, hooks, lsp, mcp), ~2833 symbols, ~6347 test lines across 35 test files.
- **Runtime**: Node.js >= 18, TypeScript compiled to ESM (`dist/`), runs inside Pi coding agent as an extension.
- **Dependencies**: tree-sitter (v0.22.4, pinned), vscode-jsonrpc + vscode-languageserver-protocol for LSP, @modelcontextprotocol/sdk for MCP, iconv-lite for encoding fallback, typebox for tool parameter schemas.
- **Key architecture facts**: 4 layers (hooks → tools → core + lsp). `core/` has zero Pi or LSP imports — this boundary is enforced and tested. Persistent disk cache with incremental scan: only re-parses files whose mtime changed. All tools return either plain text or structured JSON — never mixed.
- **Key LSP fact**: LSP clients are spawned as child processes over stdio JSON-RPC. Each language server is an independent `LspClient` instance managed by `LspManager`. When LSP is unavailable, tools degrade to tree-sitter only and annotate output with "(tree-sitter only, LSP unavailable)".
- **Key scan fact**: `scanProject()` has three code paths: in-memory cache hit (fastest), persistent disk cache with incremental update (medium), full scan from scratch (slowest). The `_scanSeenEdges` set guards against duplicate edges across scans.

## Review Rules

### DO report these (P0 — must fix)

1. **Logic errors**: conditions that can never be true, off-by-one errors in line/column math (0-based vs 1-based), inverted booleans, dead code that masks bugs.
2. **Type safety holes**: `any` casts that bypass TypeScript checks in critical paths (e.g., `as Record<string, unknown>` on LSP capabilities), missing null checks on `this.connection` / `this.process` before use in `LspClient`.
3. **Concurrency bugs**: re-entrant `scanProject()` calls (the `_scanning` boolean guard), `_scanSeenEdges` leaking across scans, `_inFlightRequests` Map modifications during iteration in `cancelInflight()`.
4. **Resource leaks**: LSP child processes not killed after `close()` (the fallback SIGKILL path), `CancellationTokenSource.dispose()` not called in error paths in `_sendRequest`, tree-sitter native `Tree` objects not deleted via `tree.delete?.()`.
5. **Security issues**: path traversal attacks in `validatePathInProject()` bypass via symlink or double-dot, command injection in LSP server spawn arguments, untrusted file content fed to tree-sitter without size/nesting checks.
6. **Data corruption**: disk cache written with stale symbols after partial incremental scan, `fileSymbols` entries with symbol IDs that don't exist in `graph.symbols`, `targetToSources` reverse index out of sync with `outgoing`/`incoming` after edge removal.

### DO report these (P1 — reliability risk)

1. **Missing error handling**: `parseFile()` catches parse errors but returns `null` silently for many failure modes — callers in `scanFull`/`scanIncremental` treat `null` as "skip file" without logging the reason.
2. **Silent failures**: `console.warn` used in 16+ files for error conditions that may never surface to the user — LSP server crashes, tree-sitter parse failures, encoding fallback exhaustion.
3. **Inconsistent state**: `removeFileData` and `removeEdgesForFile` have overlapping but slightly different cleanup logic — if one is updated and the other is not, graph state becomes inconsistent. (Note: `preserveIncoming` param was added to `removeEdgesForFile` to resolve the incremental scan edge-loss case — #448.)
4. **LLM-facing tool description issues**: tool `description` strings that promise capabilities not fully implemented (e.g., claiming LSP support for languages whose server is unavailable), `NEXT_RULES` recommendations that fire for irrelevant contexts.
5. **Settings/precedence bugs**: `_projectRootOverride` set but not respected by all paths; LSP timeout (8s default) too short for large project initialization but no per-language override.
6. **Edge cases**: empty project (0 source files) producing a graph with no symbols, scan of symlink-heavy projects hitting the `visitedSymlinks` cycle detection limit, `MAX_FILES` (20,000) exceeded silently dropping files.
7. **Performance**: `_extractStandardSymbols` O(N\*M) loop (names × definitions) for large files, `removeFileData` quadratic symbol ID lookup in `nameIndex` cleanup, `collectSourceFiles` directory walk with no `.gitignore` skipping (walks `node_modules` to depth 50).

### DO NOT report these (ignore — not useful)

- Code style, formatting, variable naming, line length, JSDoc completeness.
- Rename suggestions, function-split suggestions — unless there is a concrete bug caused by the structure.
- Test coverage percentages, missing test categories.
- Dependency version suggestions (unless there is a known CVE).
- Linting-level suggestions (`const` vs `let`, `===` vs `==`).
- TypeScript strictness flags.
- Missing docs, missing comments — the project manages docs separately.
- Architecture opinions ("use class instead of interface").
- Feature suggestions not currently implemented.

## Key Files to Review

### Tier 1 — Core Logic (highest risk)

| File                | What to check                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/scanner.ts`   | Re-entrancy guard correctness (concurrent `scanProject` calls). Incremental scan edge rebuild — does `dependentFiles` include all files whose edges might be stale? (Note: `preserveIncoming` param added to `removeEdgesForFile` for dependent files — #448.) `removeFileData` vs `removeEdgesForFile` consistency. `_scanSeenEdges` reset in finally block — any code path that skips the finally?                                                                                                                                           |
| `core/graph.ts`     | `deserializeGraphV2` — what happens with corrupted cache files (missing `fileCalls`, null `fileRefs`)? `compareGraphSnapshots` — does the stable-key reconciliation handle all edge cases (line-only drift vs rename)? `targetToSources` index maintenance — is it always updated in tandem with `outgoing`/`incoming`?                                                                                                                             |
| `lsp/client.ts`     | `_sendRequest` — `cts.dispose()` is in `finally` but `cts` creation is outside try — what if `createMessageConnection.sendRequest` throws synchronously before `cts` is created? `withTimeout` — if both `promise` and `timer` reject, does `reject` get called twice? `_cleanupAfterCrash` double-guard (`_closing` / `_cleanedUp`) — is there a race where `close()` sets `_closing=true` but the exit handler fires before `removeAllListeners`? (Note: `_cleanedUp` latch now resets on successful spawn and no longer set on empty command — #451.) |
| `tools/_factory.ts` | `validatePathInProject` — symlink realpath check catches escapes but what if `realpathSync` throws on a valid path? `customExecute` bypasses auto-scan and envelope wrapping — do all `customExecute` callers correctly return `AgentToolResult`? Missing `maxTokens` truncation in `customExecute` path.                                                                                                                                           |

### Tier 2 — State & Recovery

| File                    | What to check                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/cache.ts`         | Disk cache load — what if the JSON file is truncated or has a different `version` key? `saveGraphCache` — does it write atomically (write to temp then rename) or can a crash leave a partial file? `getProjectCacheDir` — permission errors when creating cache directory. |
| `core/baseline.ts`      | Baseline comparison accuracy — does it correctly detect the baseline commit on detached HEAD or shallow clones? What about worktrees?                                                                                                                                       |
| `hooks/verify-state.ts` | State persistence via `appendEntry` — what if the entry data exceeds the session file size limit? Is state recovery from a previous session validated before use?                                                                                                           |

### Tier 3 — Infrastructure

- No infrastructure tier for this project. pi-shazam has no team/collaboration infrastructure (mailbox, task graphs, supervisors).

### Tier 4 — TUI & Entry

| File           | What to check                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`     | Tool registration order — are all tools from all modules registered? Does a missing grammar module prevent the entire extension from loading? `setProjectRoot` — is it called before any tool accesses the graph? |
| `mcp/tools.ts` | MCP-Pi tool sync — does every Pi tool have a matching MCP registration? Are Zod schemas in sync with TypeBox schemas? Parameter names and descriptions must match exactly. (Note: MCP handlers now validate paths via `validatePathInProject` and pass `projectRoot` — #445, #446, #452. `recordCallChain` is called in symbol mode — #447.) |

### Tests — Reference only

| File                       | What to check                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tests/smoke.test.ts`      | End-to-end pipeline: scan → overview → lookup → impact → verify. Covers the critical user path.                         |
| `tests/tools.test.ts`      | Per-tool output format contracts. `shazam_overview` JSON envelope contract, `shazam_verify` verdict format.             |
| `tests/scanner.test.ts`    | `scanProject` correctness — Python `__all__` export detection, PageRank scores present, edge count non-zero after scan. |
| `tests/graph.test.ts`      | `compareGraphSnapshots` — added/removed/modified symbol detection, signature change detection, edge identity matching.  |
| `tests/lsp-client.test.ts` | Full mock of vscode-jsonrpc/node pipeline, LSP lifecycle (start → initialize → crash → close), diagnostic collection.   |

## How to Submit Findings

```
### [P0|P1] Short title

**File**: `src/path/to/file.ts:line`

**Problem**: Describe the bug or reliability risk in 2-3 sentences.

**Impact**: What actually goes wrong? When would it happen?

**Fix**: Suggest the minimal code change.
```

Skip any finding that does not meet the P0/P1 bar. Do not submit more than 15 findings total — prioritize the most impactful ones.

## Quick Sanity Checklist

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` produces `dist/index.js` and `dist/index.d.ts`
- [ ] `npm test` — all tests pass, 0 failures, 0 skipped
- [ ] `grep -r "TODO\|FIXME\|HACK\|XXX" core/ tools/ hooks/ lsp/ mcp/ index.ts` — any leftover markers?
- [ ] `grep -rn "\.only(" tests/` — any `.only()` calls that would skip other tests?
- [ ] `shazam_verify --preCommit` returns PASS verdict (not WARN/FAIL) — graph consistency + LSP diagnostics clean
- [ ] `shazam_verify` reports 0 orphans — no unreferenced symbols in the graph
- [ ] All MCP tools in `mcp/tools.ts` have matching Pi tool registrations in `index.ts` — no missing or extraneous entries
- [ ] `grep -r "console\.warn" core/scanner.ts` — all warns are intentional and not masking real errors that should propagate
- [ ] `shazam_lookup --file lsp/client.ts` — returns symbol table without errors (LSP server is healthy for TypeScript)
