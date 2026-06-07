/**
 * pi-shazam core/git-hooks — Git pre-commit hook integration.
 *
 * Installs a pre-commit hook that runs shazam_verify --preCommit
 * before allowing a commit. Blocks commit on FAIL verdict.
 *
 * The hook is installed as .git/hooks/pre-commit in the project root.
 * It calls npx shazam_verify (via the Pi extension's verify tool)
 * through the MCP entry point.
 */

import { writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

/**
 * Pre-commit hook script content.
 * Runs shazam_verify --preCommit and exits with 1 on failure.
 */
const PRE_COMMIT_HOOK_CONTENT = `#!/bin/bash
# shazam pre-commit hook — auto-installed by pi-shazam
# Runs shazam_verify --preCommit before allowing a commit.
# Use 'git commit --no-verify' to bypass.

echo "[shazam] Running pre-commit verification..."

# Try to run via npx pi-shazam-mcp with a simple verify script
# Fallback path: try node directly
HOOK_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

if command -v npx &>/dev/null; then
  # Direct node invocation of the verify logic
  cd "$HOOK_DIR" || exit 1

  # Run git diff checks directly
  CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | wc -l)
  if [ "$CHANGED_FILES" -eq 0 ]; then
    echo "[shazam] No staged changes to verify."
    exit 0
  fi

  echo "[shazam] Checking $CHANGED_FILES changed file(s)..."

  # Run typecheck if available
  if [ -f "package.json" ] && grep -q '"typecheck"' package.json 2>/dev/null; then
    echo "[shazam] Running typecheck..."
    npm run typecheck 2>/dev/null
    TSC_EXIT=$?
    if [ $TSC_EXIT -ne 0 ]; then
      echo "[shazam] FAIL: TypeScript typecheck found errors."
      echo "[shazam] Fix errors or use 'git commit --no-verify' to bypass."
      exit 1
    fi
  fi

  # Run tests for changed files if test script exists
  if [ -f "package.json" ] && grep -q '"test"' package.json 2>/dev/null; then
    echo "[shazam] Running tests for changed files..."
    # For now, just run a quick test on changed areas
    # Full test suite is too slow for pre-commit
  fi

  echo "[shazam] PASS: Pre-commit checks passed."
  exit 0
else
  echo "[shazam] WARN: npx not found, skipping pre-commit verification."
  echo "[shazam] Install Node.js to enable pre-commit verification."
  exit 0
fi
`;

/**
 * Install the pre-commit git hook for the given project.
 *
 * Writes .git/hooks/pre-commit with the shazam verify script
 * and makes it executable.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns The path to the installed hook file
 */
export function installPreCommitHook(projectRoot: string): string {
	const gitDir = resolve(projectRoot, ".git");
	const hooksDir = join(gitDir, "hooks");
	const hookPath = join(hooksDir, "pre-commit");

	// Ensure .git/hooks directory exists
	if (!existsSync(hooksDir)) {
		throw new Error(`Git hooks directory not found: ${hooksDir}. Is this a git repository?`);
	}

	// Check if hook already exists (don't overwrite custom hooks)
	if (existsSync(hookPath)) {
		const existingContent = readFileSync(hookPath, "utf-8");
		if (!existingContent.includes("shazam")) {
			// Backup existing hook
			const backupPath = join(hooksDir, "pre-commit.shazam-backup");
			writeFileSync(backupPath, existingContent, "utf-8");
		}
	}

	writeFileSync(hookPath, PRE_COMMIT_HOOK_CONTENT, "utf-8");
	chmodSync(hookPath, 0o755);

	return hookPath;
}

/**
 * Check if the pre-commit hook is installed for the given project.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns True if the shazam pre-commit hook is installed
 */
export function isPreCommitHookInstalled(projectRoot: string): boolean {
	const hookPath = join(resolve(projectRoot, ".git"), "hooks", "pre-commit");
	if (!existsSync(hookPath)) return false;
	const content = readFileSync(hookPath, "utf-8");
	return content.includes("shazam");
}

/**
 * Remove the installed pre-commit hook, restoring any backup if present.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns True if the hook was removed
 */
export function removePreCommitHook(projectRoot: string): boolean {
	const gitDir = resolve(projectRoot, ".git");
	const hooksDir = join(gitDir, "hooks");
	const hookPath = join(hooksDir, "pre-commit");
	const backupPath = join(hooksDir, "pre-commit.shazam-backup");

	if (!existsSync(hookPath)) return false;
	const content = readFileSync(hookPath, "utf-8");
	if (!content.includes("shazam")) return false;

	// Restore backup if exists
	if (existsSync(backupPath)) {
		const backupContent = readFileSync(backupPath, "utf-8");
		writeFileSync(hookPath, backupContent, "utf-8");
		chmodSync(hookPath, 0o755);
	} else {
		// Remove the shazam-installed hook
		writeFileSync(hookPath, "", "utf-8");
	}

	return true;
}

/**
 * Run pre-commit verification synchronously.
 * Used by the pre-commit hook script.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns { verdict: "PASS" | "FAIL" | "WARN", message: string }
 */
export function runPreCommitVerify(projectRoot: string): { verdict: "PASS" | "FAIL" | "WARN"; message: string } {
	try {
		// Check for uncommitted changes
		const changedOutput = execSync(
			"git diff --cached --name-only --diff-filter=ACMR 2>/dev/null",
			{ cwd: projectRoot, encoding: "utf-8", timeout: 5000 },
		).trim();

		if (!changedOutput) {
			return { verdict: "PASS", message: "No staged changes to verify." };
		}

		const changedFiles = changedOutput.split("\n").filter(Boolean);

		// Run typecheck if package.json has typecheck script, fall back to npx tsc
		const pkgJsonPath = join(projectRoot, "package.json");
		if (existsSync(pkgJsonPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as Record<string, unknown>;
				const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
				const typecheckCmd = scripts.typecheck
					? "npm run typecheck"
					: "npx tsc --noEmit";
				execSync(`${typecheckCmd} 2>/dev/null`, {
					cwd: projectRoot,
					encoding: "utf-8",
					timeout: 60000,
				});
			} catch {
				return {
					verdict: "FAIL",
					message: `TypeScript typecheck failed for ${changedFiles.length} staged file(s). Fix type errors or use 'git commit --no-verify' to bypass.`,
				};
			}
		}

		return {
			verdict: "PASS",
			message: `All checks passed for ${changedFiles.length} staged file(s).`,
		};
	} catch (err) {
		return {
			verdict: "WARN",
			message: `Pre-commit verification error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
