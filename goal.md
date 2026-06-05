你是我的编程代理，任务是把现有的 Python CLI 项目 repomap 完全重构为
一个原生 Pi coding agent 扩展包，命名为 pi-gewu。

## 第一步：读懂现有代码（必须先做，不能跳过）

1. 读 ~/.A1/repomap 的完整代码结构
2. 重点读以下模块的实现逻辑：
   - tree-sitter 解析 / 符号提取
   - LSP client（language server 进程管理、stdio 通信、诊断收集）
   - PageRank 符号图
   - 所有命令的输入/输出格式
3. 读 Pi extension API 文档：
   ~/.nvm/.../pi-coding-agent/docs/extensions.md
   重点掌握：registerTool、registerCommand、pi.on 事件系统、
   before_agent_start、after_tool_use、系统提示注入

## 项目定位

pi-gewu 是 Pi coding agent 的原生代码库感知扩展。
"格物致知"——agent 在动手之前先深度理解代码库的结构、影响、风险。
所有能力作为原生工具注册到 Pi，LLM 视角与 read/write/bash 无任何区别。

## 技术栈

- 语言：TypeScript（纯 TS，无 Python）
- 包管理：npm，发布名 pi-gewu
- tree-sitter：node-tree-sitter + 各语言 grammar 包
- LSP：vscode-languageserver-protocol（外置 language server，
  用户自行安装，pi-gewu 负责进程管理和通信）
- 图算法：纯 TS 实现 PageRank（原 Python 逻辑直接移植）
- Pi extension API：@earendil-works/pi-coding-agent 的 ExtensionAPI 类型

## 目录结构

```
pi-gewu/
├── package.json
├── tsconfig.json
├── index.ts                    # Pi extension 入口，default export
├── tools/                      # 每个文件对应一个 registerTool
│   ├── overview.ts
│   ├── impact.ts
│   ├── codequery.ts            # 原 query（改名避免与搜索类扩展冲突）
│   ├── codesearch.ts           # 原 search（同上）
│   ├── file_detail.ts
│   ├── call_chain.ts
│   ├── symbol.ts               # 原 query_symbol（简化）
│   ├── refs.ts
│   ├── routes.ts
│   ├── state_map.ts
│   ├── verify.ts
│   ├── fix.ts
│   ├── ready.ts
│   ├── check.ts
│   ├── orphan.ts
│   └── hotspots.ts
├── hooks/
│   ├── before-start.ts         # before_agent_start：注入 overview 摘要到系统提示
│   └── after-write.ts          # after write/edit：自动触发 verify + fix
├── lsp/
│   ├── manager.ts              # language server 进程生命周期管理
│   ├── client.ts               # LSP 协议通信（stdio）
│   ├── servers.ts              # 各语言 server 配置表（17种）
│   └── setup.ts                # /gewu-setup 命令：检测并提示安装缺失 server
├── core/
│   ├── treesitter.ts           # tree-sitter 解析 + 符号提取（18语言）
│   ├── pagerank.ts             # PageRank 符号重要性计算
│   ├── graph.ts                # 符号依赖图构建
│   ├── impact.ts               # 编辑影响范围分析
│   ├── encoding.ts             # UTF-8 / GBK / GB2312 自适应
├── └── cache.ts                # 图基线 save/diff

```

## 注册方式

### 查询类工具（LLM 主动调用）

```typescript
// index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerOverview } from "./tools/overview";
// ... 其他 import

export default function(pi: ExtensionAPI) {
  // 查询类：LLM 主动调用
  registerOverview(pi);
  registerImpact(pi);
  registerCodequery(pi);
  // ... 其余查询类工具

  // 验证类：hooks 自动触发，不注册为 LLM 可见工具
  registerAfterWriteHook(pi);   // verify + fix
  registerBeforeStartHook(pi);  // 注入 overview 到系统提示
  
  // slash command
  pi.registerCommand("gewu-setup", { ... }); // LSP 安装检测
  pi.registerCommand("gewu-doctor", { ... }); // 健康检查
}
```

### hooks（验证类，不经过 LLM 决策）

```typescript
// hooks/after-write.ts
export function registerAfterWriteHook(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.tool !== "write" && event.tool !== "edit") return;
    // 1. 运行 verify：LSP diagnostics + 漏改检测
    // 2. 运行 fix：ruff/eslint/gofmt/rustfmt 等 autofix
    // 3. 把结果注入到下一轮 LLM 上下文，不需要 LLM 主动调用
  });
}

// hooks/before-start.ts
export function registerBeforeStartHook(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    // 生成项目 overview 摘要（轻量版，不超过 500 token）
    // 注入到系统提示，LLM 一启动就有代码库结构认知
  });
}
```

## LSP 设计

外置模式：pi-gewu 不打包 language server，负责：
1. 检测系统上已安装的 server（pyright、tsserver、rust-analyzer 等 17 种）
2. 管理 server 进程（spawn、stdio 通信、保活）
3. 实现完整 LSP client（initialize、textDocument/didOpen、
   textDocument/definition、textDocument/references、
   textDocument/publishDiagnostics）
4. `/gewu-setup` 命令检测缺失 server 并输出安装指令

language server 进程在 extension 加载时按需启动，
pi 退出时统一 kill。

## SKILL.md 规则

只写查询类工具的调用时机，验证类工具一律不写（由 hooks 保证）。
在 SKILL.md 末尾加一行说明：
"verify / fix / check / ready 由 pi-gewu hooks 自动执行，
无需主动调用。如果你看到诊断输出，直接根据结果行动即可。"

## 实现要求

- 每个 tool 的输出格式：纯文本（适合 LLM 阅读），
  同时支持 { json: true } 参数输出结构化 JSON
- 所有工具支持 { dryRun: true } 参数（写操作类）
- 错误处理：LSP server 不可用时降级到 tree-sitter only，
  不报错，输出中标注 "(tree-sitter only, LSP unavailable)"
- 编码：UTF-8 → GBK → GB2312 自动回退（移植现有逻辑）
- 自适应搜索：关键词扩展 → 热点兜底，永不返回空结果

## 交付方式

先给我实现计划：
1. 各模块的 TypeScript 类型定义和主要函数签名
2. LSP client 和 tree-sitter 的集成点
3. hooks 和查询类工具的数据流

确认后再开始写代码，逐模块实现，每个模块写完后运行
tsc --noEmit 验证类型，再进入下一个。

最后那句"逐模块 + tsc 验证"很重要，防止 LLM 一口气生成几千行但类型全错。

tool description 需要写得足够清晰