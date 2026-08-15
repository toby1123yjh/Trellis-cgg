# Trellis CCG Lite（Codex 执行版）

Lite 只保留一条实现链路：Claude Code/Trellis 做控制，Codex 做执行。

```text
用户需求
  ↓
Claude Code：创建任务、写 PRD/design/implement、启动任务
  ↓
/trellis-ccg:codex-exec
  ↓
项目内 dispatch.py → codeagent-wrapper --lite --progress --backend codex
  ↓
Codex：读取任务、修改代码、运行测试、返回结构化报告
  ↓
Claude Code：检查报告 + Git diff + 验证结果，必要时恢复同一 Codex session
  ↓
Claude Code：更新文档、检查、结束任务、归档
```

## 安装

在目标项目中执行：

```bash
trellis init --claude -u your-name
```

除了正常的 Trellis 文件，还会生成：

```text
.trellis/
└── extensions/trellis-ccg-lite/
    ├── manifest.json
    ├── command.md
    ├── executor.md
    └── dispatch.py

.claude/
├── commands/trellis-ccg/codex-exec.md
└── hooks/trellis-ccg-lite-result.py

.codex/
├── hooks.json
└── hooks/
    ├── inject-workflow-state.py
    └── inject-subagent-context.py
```

Trellis 原生 hooks 仍然位于 `.claude/hooks/`，由 `.claude/settings.json`
注册；不要把这些注册入口移到 `.trellis`，否则 Claude Code 不会执行它们。

Claude 这条链路保留三项 Trellis 原生 hook：

- `session-start.py`：会话启动、`clear`、`compact` 时恢复工作流上下文；
- `inject-workflow-state.py`：每轮提示注入当前任务/阶段状态；
- `inject-subagent-context.py`：调用 Claude 的 `Task`/`Agent` 时注入子任务上下文。

Lite 只额外注册 `trellis-ccg-lite-result.py`。它不执行代码，只在下一轮提示中
报告最近一次 Codex 运行记录；真正的实现修改仍由
`.trellis/extensions/trellis-ccg-lite/dispatch.py` 启动的 Codex 完成。
`statusline.py` 仍是 Trellis 原有的显式可选项，只有使用
`trellis init --with-statusline` 才会安装。

Codex 侧的 Trellis hooks 也保留：

- `.codex/hooks/inject-workflow-state.py`：注入主会话的工作流状态；
- `.codex/hooks/inject-subagent-context.py`：在 Codex 支持的
  `SubagentStart` 事件中注入 Trellis 子任务上下文；
- `.codex/hooks.json`：注册 `UserPromptSubmit` 和
  `SubagentStart`。旧版 Codex 仍可使用 agent profile 中的 pull-based fallback。

Codex 0.129+ 需要在用户级 `~/.codex/config.toml` 开启
`features.hooks = true`，并按 Codex 提示通过一次 `/hooks` 审核；否则主流程仍能运行，
但自动 hook 注入不会生效。

## 使用

1. 让当前 Claude Code 会话完成需求澄清和任务文档：`prd.md`、可选的
   `design.md`、`implement.md` 以及 `implement.jsonl`。
2. 使用 Trellis 正常启动任务，确认 `task.json` 的状态是
   `in_progress`。
3. 执行 `/trellis-ccg:codex-exec`，可在命令后附加本轮补充要求。
4. Claude 会独立检查 Codex 的结构化报告和实际 Git diff。发现具体问题时，
   通过同一 session 让 Codex 修正，最多两轮。
5. 验证通过后，继续使用 Trellis 的 check、update-spec、finish-work 流程。

## Wrapper 配置

`.trellis/config.yaml` 中的 Lite 配置固定使用 Codex：

```yaml
trellis-ccg:
  wrapper_path: ~/.claude/bin/codeagent-wrapper
  executor: codex
  lite_mode: true
  max_correction_rounds: 2
```

`codeagent-wrapper` 不是 Trellis 分发的依赖，需要用户自行安装。找不到
wrapper 时，dispatcher 会明确报错，不会回退到 Claude 或其他模型直接改代码。

## 可审计运行记录

每次 Codex 执行都会写入：

```text
.trellis/.runtime/trellis-ccg-lite/
├── latest.json
└── runs/<run-id>.json
```

记录包括任务目录、Codex session ID、固定命令参数、stdout/stderr、返回码和
修正轮次。下一次 Claude 用户输入时，`trellis-ccg-lite-result.py` 会注入最新
运行状态；最终是否完成仍以任务状态、Git diff 和验证命令为准。

## 边界

- Lite 不安装旧 CCG 的 Gemini、多模型路由、Team/Agent Teams 命令和角色。
- Claude/Trellis 不编辑实现代码；所有实现和修正都必须回到 Codex。
- wrapper 成功退出不等于任务完成，必须经过 Claude 的独立检查和 Trellis 收尾。
