# LOCAL_CI.md

Local CI checklist for pi-shazam. Run ALL checks before committing or merging.
Replace `npm ci` with `npm install --legacy-peer-deps` when `node_modules/` already exists.

## Prerequisites

- Node.js >= 18
- npm

## Checklist

### 1. Install Dependencies

```bash
npm ci --legacy-peer-deps
```

**Pass**: "added N packages" or "up to date", exit code 0.
**Common fix**: `rm -rf node_modules && npm ci --legacy-peer-deps`

### 2. Type Check

```bash
npm run typecheck
```

**Pass**: no output, exit code 0.
**Common fix**: read the TypeScript error, fix the type mismatch, re-run.

### 3. Full Test Suite

```bash
npm test
```

**Pass**: all test files pass, 0 failures.
**Common fix**: read the failing test output, fix the code, re-run.

### 4. Build

```bash
npm run build
```

**Pass**: exit code 0, `dist/index.js` and `dist/index.d.ts` exist.
**Common fix**: fix TypeScript compilation errors, re-run.

### 5. Verify dist Output

```bash
test -f dist/index.js && test -f dist/index.d.ts && echo "OK" || echo "FAIL"
```

**Pass**: prints "OK".
**Common fix**: run `npm run build` first.

### 6. MCP Integration Tests

```bash
npx vitest run tests/mcp-integration.test.ts
```

**Pass**: all tests pass.
**Common fix**: ensure `dist/` is built (`npm run build`).

### 7. Benchmark Tests

```bash
npx vitest run tests/benchmark.test.ts
```

**Pass**: all benchmarks pass (within time thresholds).
**Common fix**: performance regressions may need investigation.

### 8. Security Audit (Informational)

```bash
npm audit --omit=dev
```

**Pass**: 0 vulnerabilities, or only non-critical known issues.
**Common fix**: `npm audit fix` for auto-fixable issues.

## Quick Run (All at Once)

```bash
npm run ci
```

This single command runs steps 2-8 in order. See `package.json` scripts for the exact command chain.

## Hook Verification (Post-Build)

```bash
grep -c "registerBeforeStartHook\|registerToolLogger\|registerShazamGuide\|registerPreEditGuard\|registerSafetyHooks\|registerStopVerify\|registerFailureRecovery\|registerIssueGuard\|registerAgentContextGuard" dist/index.js
```

**Pass**: output is `9`.
**Common fix**: if output is less than 9, a hook was not registered in `index.ts`.
