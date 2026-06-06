---
name: kimi-code-hooks
description: "How to write Kimi Code hooks (shell scripts triggered by lifecycle events). Covers config.toml setup, stdin JSON protocol, exit codes, stdout vs stderr, PreToolUse/PostToolUse/SessionStart events. Use when adding hooks to Kimi Code's config.toml."
---

# Kimi Code Hooks — Shell Script Lifecycle Handlers

Kimi Code hooks are shell scripts triggered by 13 lifecycle events. Configured in `~/.kimi-code/config.toml`.

## Configuration

```toml
[[hooks]]
event = "PreToolUse"
matcher = "Bash|WriteFile|StrReplaceFile|ReadFile"
command = "bash /path/to/hook.sh"
timeout = 3
```

## Communication Protocol

### Input (stdin JSON)

```json
{
  "session_id": "abc123",
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {"command": "grep -rn TODO src/"}
}
```

For Bash: `tool_input.command`  
For WriteFile/StrReplaceFile: `tool_input.file_path`  
For ReadFile: `tool_input.file_path`

### Output (exit codes)

| Exit code | Effect |
|-----------|--------|
| **0** | Allow. **stdout** content is added to LLM context. |
| **2** | Block. **stderr** content is fed to LLM as correction. |
| Other | Allow. stderr logged only. |

**Critical**: exit 0 + stdout gives guidance to LLM. exit 0 + stderr is silently logged.

### Structured JSON output (optional)

When exiting 0, output JSON to control behavior:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Please use shazam_codesearch instead"
  }
}
```

## Hook script template

```bash
#!/usr/bin/env bash
set -eu

INPUT=$(cat)
tool_name=$(echo "$INPUT" | jq -r '.tool_name // ""')

if [[ "$tool_name" == "Bash" ]]; then
  cmd=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
  if echo "$cmd" | grep -q "grep"; then
    echo "remember you have the shazam_codesearch MCP tool"
    exit 0
  fi
fi

if [[ "$tool_name" == "WriteFile" ]]; then
  echo "remember you have shazam_impact and shazam_verify"
  exit 0
fi

exit 0
```

## Events

| Event | Fires when |
|-------|-----------|
| `PreToolUse` | Before tool execution |
| `PostToolUse` | After tool execution |
| `SessionStart` | Session begins |
| `SessionEnd` | Session ends |
| `UserPromptSubmit` | User submits prompt |
| `Stop` | User stops agent |
| `Notification` | Permission prompt appears |

Matchers support regex: `"Bash|WriteFile|StrReplaceFile"`.

## Existing hooks for pi-shazam

| Event | Matcher | Script | Purpose |
|-------|---------|--------|---------|
| `SessionStart` | — | `shazam-start.sh` | List all 14 shazam MCP tools |
| `PreToolUse` | `Bash\|WriteFile\|StrReplaceFile\|ReadFile` | `shazam-guide.sh` | Suggest shazam alternatives |

Hooks are at `~/.A1/ai/.kimi-code/hooks/`, config at `~/.kimi-code/config.toml`.
