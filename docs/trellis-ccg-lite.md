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

需要 Node.js 18.17+、Python 3.9+、Claude Code 和 Codex CLI。进入要接入的项目
目录，直接通过 npx 初始化：

```bash
cd /path/to/your-project
npx trellis-ccg-lite init --claude -u your-name
```

自动化环境或不希望交互确认时使用：

```bash
npx --yes trellis-ccg-lite init --claude --yes --no-monorepo -u your-name
```

`trellis-ccg-lite` 是独立的 Lite 包，不是官方 `@mindfoldhq/trellis`。npx 会临时下载
CLI 并把内容写入当前项目，不需要全局安装，也不需要保留 `node_modules`。如果 npm
返回 `E404`，说明维护者还没有通过 Lite 发布工作流发布当前版本；在发布前可以使用
下面的源码构建方式。

### 从源码构建（开发者备用方案）

```bash
git clone --branch trellis-ccg-lite --single-branch https://github.com/toby1123yjh/Trellis-cgg.git
cd Trellis-cgg
pnpm install --frozen-lockfile
pnpm -C packages/core build
pnpm -C packages/cli build
```

源码构建额外需要 pnpm 10.32.1。构建完成后，进入目标项目，直接运行刚构建的
CLI；把 `/path/to/Trellis-cgg` 换成实际克隆目录：

```bash
cd /path/to/your-project
node /path/to/Trellis-cgg/packages/cli/dist/cli/index.js init --claude -u your-name
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
```

上面的 `--claude` 命令只安装 Claude Code 控制面。如果还希望在同一项目中
直接使用 Codex 的原生 Trellis 工作流，把初始化命令末尾改成
`init --claude --codex -u your-name`；这时才会额外生成：

```text
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
`init --claude --with-statusline` 才会安装。

Codex 侧的 Trellis hooks 也保留：

- `.codex/hooks/inject-workflow-state.py`：注入主会话的工作流状态；
- `.codex/hooks/inject-subagent-context.py`：在 Codex 支持的
  `SubagentStart` 事件中注入 Trellis 子任务上下文；
- `.codex/hooks.json`：注册 `UserPromptSubmit` 和
  `SubagentStart`。旧版 Codex 仍可使用 agent profile 中的 pull-based fallback。

当前 Codex 默认开启 hooks，不需要额外写 `features.hooks = true`。项目级 hooks
仍需在受信任项目中加载，并按 Codex 提示通过一次 `/hooks` 审核；审核前主流程仍能
运行，但自动 hook 注入不会生效。若用户曾在配置中显式写了
`[features] hooks = false`，需要删除该覆盖或改回 `true`。详见
[OpenAI 官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)。

## 使用

1. 让当前 Claude Code 会话完成需求澄清和任务文档：`prd.md`、可选的
   `design.md`、`implement.md` 以及 `implement.jsonl`。
2. 使用 Trellis 正常启动任务，确认 `task.json` 的状态是
   `in_progress`。
3. 执行 `/trellis-ccg:codex-exec`，可在命令后附加本轮补充要求。
4. Claude 会独立检查 Codex 的结构化报告和实际 Git diff。发现具体问题时，
   通过同一 session 让 Codex 修正，最多两轮。dispatcher 会读取历史运行记录，
   只接受顺序的第 1、2 轮，不能通过重复传入轮次编号绕过限制；恢复后返回的
   session ID 也必须保持一致。即使 wrapper 返回 0，只要缺少四个报告章节，
   本次运行仍会失败，不能进入完成流程。
5. 验证通过后，继续使用 Trellis 的 check、update-spec、finish-work 流程。

## Wrapper 配置

`.trellis/config.yaml` 中的 Lite 配置固定使用 Codex：

```yaml
trellis-ccg:
  wrapper_path: .trellis/bin/codeagent-wrapper
  executor: codex
  lite_mode: true
  max_correction_rounds: 2
```

`codeagent-wrapper` 不是 Trellis 分发的依赖，需要用户自行安装。推荐把对应平台的
二进制放到项目的 `.trellis/bin/`：Windows 使用
`.trellis/bin/codeagent-wrapper.exe`，macOS/Linux 使用
`.trellis/bin/codeagent-wrapper` 并赋予执行权限。这个目录由
`.trellis/.gitignore` 忽略，不会意外提交平台二进制。

dispatcher 的查找顺序是配置路径、项目内 `.trellis/bin/`、`PATH`，最后兼容旧的
`~/.claude/bin/codeagent-wrapper`。找不到 wrapper 时会明确报错，不会回退到
Claude 或其他模型直接改代码。获取或构建方式见
[CODEAGENT-WRAPPER-SETUP.md](./CODEAGENT-WRAPPER-SETUP.md)。

## 可审计运行记录

每次 Codex 执行都会写入：

```text
.trellis/.runtime/trellis-ccg-lite/
├── latest.json
└── runs/<run-id>.json
```

记录包括任务目录、请求与实际返回的 Codex session ID、固定命令参数、
stdout/stderr、返回码、父运行 ID、结构化报告校验结果和修正轮次。wrapper 即使
返回 0，只要缺少约定的
四个报告章节也会被标记为失败。下一次 Claude 用户输入时，
`trellis-ccg-lite-result.py` 会注入最新运行状态；最终是否完成仍以任务状态、
Git diff 和验证命令为准。

## 边界

- Lite 不安装旧 CCG 的 Gemini、多模型路由、Team/Agent Teams 命令和角色。
- Claude/Trellis 不编辑实现代码；所有实现和修正都必须回到 Codex。
- Codex 只读 Trellis 控制面，不编辑 `.trellis/tasks/**`、`.trellis/spec/**`、
  `.trellis/workflow.md`、`.trellis/workspace/**` 或运行时任务状态；需要更新时由
  Codex 在报告中提出，再由 Claude/Trellis 维护。
- wrapper 成功退出不等于任务完成，必须经过 Claude 的独立检查和 Trellis 收尾。
