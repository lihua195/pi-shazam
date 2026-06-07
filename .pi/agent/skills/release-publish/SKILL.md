---
name: release-publish
description: "How to release and publish pi-shazam to npm. Covers version bumping (npm version), git tag push, GitHub Release creation, publish CI verification, and post-release Pi install check."
---

# Release & Publish

## When to release

After any user-facing change: new tools, new hooks, bugfixes, significant doc updates.

Version strategy:
- **patch** (0.3.0 → 0.3.1): bugfixes, typos, minor tweaks
- **minor** (0.2.0 → 0.3.0): new features (tools, hooks, MCP)
- **major** (0.x → 1.0): breaking changes, API removals

## Steps

```bash
# 1. Verify everything passes
npm run typecheck
npm test
npm run build

# 2. Bump version (creates git tag)
npm version patch   # or minor / major

# 3. Push code + tags
git push origin main --tags

# 4. Create GitHub Release (triggers publish.yml)
gh release create v0.X.Y \
  --title "v0.X.Y — summary" \
  --notes "## Changes\n- ..."

# 5. Wait for publish CI
gh run watch $(gh run list --workflow publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# 6. Verify
npm view pi-shazam version  # should show new version

# 7. Test in Pi
cd project && pi install npm:pi-shazam@0.X.Y
pi -p "call shazam_overview briefly"
```

## Publish CI (.github/workflows/publish.yml)

Triggered by GitHub Release event. Runs:
1. `npm ci --legacy-peer-deps`
2. `npx tsc --noEmit` (typecheck)
3. `npm test`
4. `npm run build`
5. `npm publish` (with `secrets.NPM_TOKEN`)
6. Wait 15s → `npm view pi-shazam` verify

**Never run `npm publish` locally.** Always through CI.

## Pre-release checklist

- [ ] All tests pass locally (208 tests, 0 failures)
- [ ] Typecheck passes (0 errors)
- [ ] Build compiles
- [ ] `repomap verify` passes
- [ ] README / AGENTS.md / SKILL.md synced
- [ ] MCP tools synced with Pi tools
- [ ] No stale branches or worktrees

## Post-release

```bash
pi install npm:pi-shazam@latest   # update Pi
pi -p "call shazam_overview"      # smoke test
```
