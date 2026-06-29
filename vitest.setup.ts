// Suppress ERR_STREAM_DESTROYED from vscode-jsonrpc during vitest worker
// teardown. When lsp-client.test.ts runs in the same worker pool, mocked
// StreamMessageWriter instances may trigger async writes to destroyed
// streams during cleanup. This is a test-environment artifact.
process.on("unhandledRejection", (reason: unknown) => {
	const err = reason as NodeJS.ErrnoException;
	if (err?.code === "ERR_STREAM_DESTROYED") return;
	throw reason;
});
