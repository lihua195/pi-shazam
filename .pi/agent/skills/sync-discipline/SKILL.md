---
name: sync-discipline
description: "Rules for keeping Pi tools, MCP tools, hooks, and docs in sync. Covers what must be updated when tools/hooks/docs change, and the checklist for each change type."
---

# Sync Discipline

When one piece changes, others MUST follow in the same PR.

## Tool changes

| Change | AGENTS.md | SKILL.md | README.md | mcp/tools.ts | mcp/README.md |
|--------|-----------|----------|-----------|-------------|---------------|
| New tool | Add to table | Add full docs | Add if user-facing | Add registerTool | Add to table |
| Delete tool | Remove | Remove | Remove | Remove | Remove |
| Schema change | — | Update params | — | Update Zod | — |
| Description change | Sync | Sync | — | Sync | Sync |
| Rename | Update all | Update all | Update if listed | Update | Update |

## Hook changes

| Change | AGENTS.md | AGENTS.md Change Map |
|--------|-----------|---------------------|
| New hook | Add to hooks/ tree | Add to architecture |
| Hook event changed | Update description | — |
| Delete hook | Remove from tree | — |

## Doc changes

| Change | Must also update |
|--------|-----------------|
| Architecture | AGENTS.md tree + AGENTS.md |
| Languages supported | README + AGENTS.md + SKILL.md |
| Commands | README + SKILL.md |
| Release | README npm badge auto-updates |

## Before commit checklist

- [ ] Pi tools + MCP tools count matches
- [ ] Tool descriptions match between Pi and MCP
- [ ] AGENTS.md tool table synced
- [ ] SKILL.md has all tools documented
- [ ] README.md tool counts correct
- [ ] Architecture tree in AGENTS.md current
- [ ] Language counts verified against code
