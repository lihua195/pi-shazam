/**
 * Guide the agent to use shazam tools at appropriate moments.
 *
 * Injects context reminders at key lifecycle points:
 * - before_agent_start: inject shazam tool guidance into system prompt
 * - tool_result (write/edit): suggest running shazam_verify
 * - tool_call (read/grep): suggest using shazam tools instead
 */
import type { ExtensionAPI } from "../types/pi-extension.js";

export function registerShazamGuide(pi: ExtensionAPI): void {
	// ── Before agent starts: inject shazam usage guidance ──────────
	pi.on("before_agent_start", (_event, _ctx) => {
		// Append shazam guidance to system prompt so the agent always
		// knows these tools are available and when to use them.
		const guide = [
			"",
			"本会话你可以使用 pi-shazam 的 14 个代码分析工具:",
			"  记得你有 shazam_overview —— 进入项目先看整体结构、依赖和提交历史",
			"  记得你有 shazam_impact   —— 编辑多文件前看影响范围",
			"  记得你有 shazam_codesearch —— 搜代码比 grep 更精准",
			"  记得你有 shazam_symbol   —— 快速定位函数/类的定义和调用者",
			"  记得你有 shazam_hover     —— 查看类型签名和文档注释",
			"  记得你有 shazam_file_detail —— 读文件前先看符号和依赖结构",
			"  记得你有 shazam_call_chain —— 改函数签名前追踪所有调用者",
			"  记得你有 shazam_find_tests —— 找到模块对应的测试文件",
			"  记得你有 shazam_hotspots  —— 找项目中最复杂、风险最高的文件",
			"  记得你有 shazam_type_hierarchy —— 查看类的完整继承链",
			"  记得你有 shazam_verify    —— 每次编辑后检查有没有引入错误",
			"  记得你有 shazam_fix       —— 自动修复格式和 lint 问题",
			"  记得你有 shazam_rename_symbol  —— 安全重命名，先验证再执行",
			"  记得你有 shazam_safe_delete    —— 删除前确认没有引用",
			"",
		];

		const current = _event.systemPrompt;
		// Avoid double-injection
		if (current.some((s) => s.includes("pi-shazam tools available"))) return;

		current.push(...guide);
	});

	// ── After write/edit: nudge to verify ─────────────────────────
	pi.on("tool_result", (event, ctx) => {
		const name = event.toolName;
		if (name !== "write" && name !== "edit") return;
		if (event.isError) return;

		// Send a gentle reminder — non-blocking, informational
		ctx.ui?.notify?.("记得你有 shazam_verify，编辑后检查有没有引入错误", "info");
	});

	// ── When agent uses grep/find instead of shazam ────────────────
	pi.on("tool_call", (event, ctx) => {
		const name = event.toolName;
		if (name !== "search" && name !== "grep" && name !== "find") return;

		// Remind agent that shazam_codesearch exists
		ctx.ui?.notify?.("记得你有 shazam_codesearch，比 grep 搜索更精准", "info");
	});
}
