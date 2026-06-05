# pi-shazam

> Pi 编程助手原生代码库感知扩展 —— "Shazam" 如同拥有多位神灵之力的超级英雄，统一多种分析引擎之力。

[![npm version](https://img.shields.io/npm/v/pi-shazam)](https://www.npmjs.com/package/pi-shazam)
[![CI](https://github.com/gjczone/pi-shazam/actions/workflows/ci.yml/badge.svg)](https://github.com/gjczone/pi-shazam/actions/workflows/ci.yml)

pi-shazam 将代码库结构分析（tree-sitter AST → 符号依赖图 → PageRank 评分）和 LSP 诊断整合为 Pi 的一等公民工具。LLM 看到它们就像看到 `read`/`write`/`bash` 一样自然。

## 安装

```bash
pi install npm:pi-shazam
```

或手动添加到 `~/.pi/agent/settings.json`：

```json
{
  "packages": ["npm:pi-shazam@0.1.0"]
}
```

> 需要 Node.js ≥ 18。

## 功能

### 16 个 LLM 工具

#### 查询工具（12 个）—— 只读，永不修改文件

| 工具 | 用途 |
|------|------|
| `shazam_overview` | 项目结构总览：模块依赖图、Top-10 PageRank 文件、入口点 |
| `shazam_codequery` | 统一符号/文件查询：`--symbol` 找定义、`--file` 列符号、`--query` 关键词搜索 |
| `shazam_codesearch` | BM25 符号搜索，跨全库排名 |
| `shazam_file_detail` | 单文件深度分析：所有符号、签名、可见性、进出引用数 |
| `shazam_symbol` | 单符号查找：定义位置、类型、调用计数 |
| `shazam_refs` | 引用查找：项目中所有使用位置（进出边） |
| `shazam_impact` | 修改影响分析：改动文件的波及范围、受影响符号、建议测试 |
| `shazam_call_chain` | 调用链追踪：上游调用者 → 下游被调者 |
| `shazam_routes` | HTTP 路由清单 |
| `shazam_state_map` | 状态定义发现：枚举/常量及其转换 |
| `shazam_orphan` | 死代码检测：零入度符号（置信度 ≥ 70） |
| `shazam_hotspots` | 复杂度热点排序 |

#### 写入/验证工具（4 个）

| 工具 | 用途 |
|------|------|
| `shazam_verify` | 编辑后诊断：git diff → 风险评估 → 孤儿符号 → 调用图一致性 |
| `shazam_check` | 编译/lint 诊断：tree-sitter 解析验证 + 符号统计 |
| `shazam_fix` | 自动格式化：检测 prettier/eslint/biome 配置，扫描格式问题，`--dry-run` 预览 |
| `shazam_ready` | 提交前就绪检查：verify + check 组合门禁 |

所有工具支持 `{ "json": true }` 结构化输出。

### 2 个自动 Hook

- **启动注入**：首次进入仓库时，自动将项目概览注入系统提示
- **编辑后验证**：每次 `write`/`edit` 后自动运行诊断并报告

### 2 个命令

- `/shazam-setup` — 检测 LSP 服务器可用性，输出安装指导
- `/shazam-doctor` — 健康检查：tree-sitter 语法、LSP 服务器、缓存

## 语言支持

### Tree-sitter 解析（18 种语言）

TypeScript/JavaScript、Python、Rust、Go、Java、C、C++、C#、Ruby、CSS、HTML、JSON、YAML、Bash、Lua、Kotlin、Swift、Scala

### LSP 服务器（6 种语言，自动检测并启动）

| 语言 | 服务器 |
|------|--------|
| TypeScript/JavaScript | typescript-language-server |
| Python | pyright |
| Rust | rust-analyzer |
| Go | gopls |
| JSON | vscode-json-languageserver |
| YAML | yaml-language-server |

LSP 不可用时自动降级为纯 tree-sitter，不会抛错。

## 编码

自适应编码读取：UTF-8 → GBK → GB2312。中文字符项目自动处理。

## JSON 输出格式

```json
{
  "schema_version": "1.0",
  "command": "<tool_name>",
  "project": "<absolute_path>",
  "status": "ok",
  "result": { }
}
```

## 开发

```bash
git clone https://github.com/gjczone/pi-shazam.git
cd pi-shazam
npm install --legacy-peer-deps

# 开发
npm run dev          # tsc --watch

# 检查
npm run typecheck    # tsc --noEmit
npm test             # vitest (98 tests)

# 构建
npm run build        # tsc → dist/
```

## 架构

```
index.ts                    ← Pi 扩展入口
├── core/                   ← 纯分析逻辑（零 Pi 依赖）
│   ├── treesitter.ts       ← AST 解析 + 符号提取
│   ├── graph.ts            ← 符号依赖图
│   ├── pagerank.ts         ← PageRank 评分
│   ├── scanner.ts          ← 项目扫描 + 图构建
│   ├── encoding.ts         ← UTF-8 → GBK → GB2312
│   └── cache.ts            ← 基线保存/对比
├── lsp/                    ← 语言服务器管理
│   ├── manager.ts          ← 生命周期（spawn/stdio/shutdown）
│   ├── client.ts           ← JSON-RPC over stdio
│   ├── servers.ts          ← 语言→服务器配置表
│   └── setup.ts            ← /shazam-setup
├── tools/                  ← 每个工具一个文件
└── hooks/                  ← 自动事件处理器
```

## License

MIT
