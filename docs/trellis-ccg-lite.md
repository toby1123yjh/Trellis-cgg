# Trellis CCG Lite（Codex 执行版）

Trellis CCG Lite 只保留一条实现链路：Claude Code 和 Trellis 负责需求、规划、
任务状态、验证与收尾，Codex 是唯一代码执行者。

```text
用户需求
  → Claude/Trellis 整理任务与上下文
  → /trellis-ccg:codex-exec
  → codeagent-wrapper --lite --progress --backend codex
  → Codex 修改代码、运行验证、返回结构化报告
  → Claude/Trellis 检查 diff、必要时恢复同一 Codex session 修正、完成任务
```

## 一步安装

前置条件：Node.js 18.17+、Python 3.9+、Claude Code、Codex CLI，并已完成
Codex CLI 登录。不需要安装 Go。

在要接入的项目根目录运行：

```bash
npx trellis-ccg-lite@latest init --claude -u your-name
```

非交互环境使用：

```bash
npx --yes trellis-ccg-lite@latest init --claude --yes --no-monorepo -u your-name
```

同一次命令会完成两部分工作：

1. 初始化 Trellis、Claude Code 命令、skills 和生命周期 hooks；
2. 下载并校验 `codeagent-wrapper` 5.14.0，安装到项目的 `.trellis/bin/`。

主要新增文件如下：

```text
.trellis/
├── bin/codeagent-wrapper[.exe]
└── extensions/trellis-ccg-lite/
    ├── manifest.json
    ├── command.md
    ├── executor.md
    └── dispatch.py

.claude/
├── commands/trellis-ccg/codex-exec.md
└── hooks/trellis-ccg-lite-result.py
```

wrapper 支持 macOS、Linux、Windows 的 x64 和 arm64。CLI 优先从国内友好的
镜像下载，失败后回退到上游 GitHub Release。下载内容先写入临时文件并执行
`--version`；只有精确匹配 5.14.0 才会替换现有文件，因此下载失败或文件异常不会
破坏已有 wrapper。macOS/Linux 会自动设置执行权限。

`.trellis/bin/` 被 Git 忽略，不会把不同平台的二进制提交到项目仓库。

## 已有项目更新

重新执行 init 或 update 都会检查项目内 wrapper：

```bash
npx trellis-ccg-lite@latest init --claude -u your-name
# 或只执行更新检查
npx trellis-ccg-lite@latest update
```

版本已经正确时不会重复下载；缺失、不可执行或版本过旧时会自动修复。
`npx trellis-ccg-lite@latest update --dry-run` 保持只读，不下载文件。

## 使用

1. 在 Claude Code 中按 Trellis 流程完成需求澄清和任务文档。
2. 任务进入 `in_progress` 后执行 `/trellis-ccg:codex-exec`，可附加本轮要求。
3. Codex 读取审核过的任务上下文，修改代码、执行验证并返回结构化报告。
4. Claude 检查报告和实际 Git diff；发现具体问题时，最多通过同一 Codex session
   修正两轮。
5. 验证通过后继续 Trellis 的 check、update-spec、finish-work 流程。

如果还希望在同一项目直接使用 Codex 原生 Trellis skills，可在初始化时加
`--codex`：

```bash
npx trellis-ccg-lite@latest init --claude --codex -u your-name
```

## Wrapper 配置

默认配置固定使用 Codex：

```yaml
trellis-ccg:
  wrapper_path: .trellis/bin/codeagent-wrapper
  executor: codex
  lite_mode: true
  max_correction_rounds: 2
```

dispatcher 依次检查显式配置路径、项目 `.trellis/bin/`、`PATH` 和兼容旧位置
`~/.claude/bin/`。找不到 wrapper 时会明确失败，不会回退到 Claude、Gemini 或
其他模型直接修改代码。

更多安装诊断见 [wrapper 安装与排障](./CODEAGENT-WRAPPER-SETUP.md)。

## Hooks 与运行记录

Claude 的 Trellis hooks 仍安装在 `.claude/hooks/` 并由
`.claude/settings.json` 注册。Lite 额外增加的
`trellis-ccg-lite-result.py` 只注入最近一次 Codex 运行状态，不执行代码。

每次执行记录写入：

```text
.trellis/.runtime/trellis-ccg-lite/
├── latest.json
└── runs/<run-id>.json
```

记录包括任务、Codex session、固定命令参数、stdout/stderr、返回码和结构化报告
校验结果。wrapper 返回 0 不等于任务完成，最终仍以任务状态、Git diff 和验证结果
为准。

## 边界

- Lite 不安装旧 CCG 的 Gemini、多模型路由、Team/Agent Teams 命令与角色。
- Claude/Trellis 不编辑实现代码；实现和修正都交给 Codex。
- Codex 不维护 `.trellis/tasks/**`、`.trellis/spec/**`、工作流和运行时任务状态；
  需要调整时在报告中提出，由 Claude/Trellis 处理。
