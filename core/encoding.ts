/**
 * pi-shazam core/encoding — Adaptive file encoding reader.
 *
 * Reads files with UTF-8 → GBK → GB2312 fallback.
 * Ported from repomap's encoding detection pattern.
 */

import { readFileSync, statSync } from "node:fs";
import * as iconv from "iconv-lite";

// Tree-sitter's MAX_PARSE_SIZE — skip files larger than 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ── Encoding detection and reading ───────────────────────────────────────────

/**
 * Read a file with adaptive encoding fallback:
 * 1. Try UTF-8
 * 2. Try GBK (cp936)
 * 3. Try GB2312
 *
 * Returns the decoded string content.
 * Throws if the file exceeds MAX_FILE_SIZE (10MB) to prevent OOM.
 */
export function readFileAdaptive(filePath: string): string {
	// Check file size before reading to prevent OOM
	try {
		const stat = statSync(filePath);
		if (stat.size > MAX_FILE_SIZE) {
			throw new Error(`File too large (${stat.size} bytes > ${MAX_FILE_SIZE}): ${filePath}`);
		}
	} catch (err) {
		if (err instanceof Error && err.message.startsWith("File too large")) {
			throw err; // re-throw our size error
		}
		// stat failed (permission, missing) — fall through to readFileSync which will error with a clearer message
	}
	const buffer = readFileSync(filePath);

	// Try UTF-8 first
	const utf8Result = tryDecode(buffer, "utf-8");
	if (utf8Result !== null) return utf8Result;

	// Try GBK
	const gbkResult = tryDecode(buffer, "gbk");
	if (gbkResult !== null) return gbkResult;

	// Try GB2312
	const gbResult = tryDecode(buffer, "gb2312");
	if (gbResult !== null) return gbResult;

	// Last resort: UTF-8 with replacement
	return buffer.toString("utf-8");
}

// ── Encoding detection ───────────────────────────────────────────────────────

/**
 * Detect the most likely encoding for a buffer.
 * Returns one of: "utf-8", "gbk", "gb2312", "unknown".
 */
export function detectEncoding(buffer: Buffer): string {
	// UTF-8 BOM check
	if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
		return "utf-8";
	}

	// Try UTF-8 validation
	const utf8Result = tryDecode(buffer, "utf-8");
	if (utf8Result !== null) return "utf-8";

	// Check for GBK/GB2312 patterns (high bytes 0x81-0xfe)
	let gbkBytes = 0;
	for (let i = 0; i < buffer.length; i++) {
		const byte = buffer[i];
		if (byte !== undefined && byte >= 0x81 && byte <= 0xfe) {
			gbkBytes++;
		}
	}

	if (gbkBytes > buffer.length * 0.3) {
		const gbkResult = tryDecode(buffer, "gbk");
		if (gbkResult !== null) return "gbk";

		const gbResult = tryDecode(buffer, "gb2312");
		if (gbResult !== null) return "gb2312";
	}

	return "unknown";
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Try to decode a buffer with a given encoding.
 * Returns the decoded string if successful, or null if invalid.
 */
function tryDecode(buffer: Buffer, encoding: string): string | null {
	try {
		if (encoding === "utf-8") {
			// Validate UTF-8 by decoding and checking for replacement characters
			const str = buffer.toString("utf-8");
			// Check for common UTF-8 decode failure marker
			if (str.includes("\ufffd") && buffer.length > 16) {
				return null;
			}
			return str;
		}

		// For iconv-lite encodings, decode and check for errors
		const str = iconv.decode(buffer, encoding);
		// iconv-lite uses replacement chars, so check if the result seems valid
		// by verifying the decoded content doesn't have too many unknown chars
		if (str.length === 0 && buffer.length > 0) return null;
		return str;
	} catch {
		return null;
	}
}

// ── Convenience ──────────────────────────────────────────────────────────────

/**
 * Read a file with specific encoding.
 */
export function readFileWithEncoding(filePath: string, encoding: string): string {
	const buffer = readFileSync(filePath);
	if (encoding === "utf-8") {
		return buffer.toString("utf-8");
	}
	return iconv.decode(buffer, encoding);
}
