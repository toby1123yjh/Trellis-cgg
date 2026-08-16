# Trellis CCG Lite：codeagent-wrapper 安装说明

Trellis CCG Lite 只使用 Codex 作为代码执行者。Claude/Trellis 负责规划、任务状态、
hooks、验证和收尾，dispatcher 始终使用下面的固定命令调用 wrapper：

```text
codeagent-wrapper --lite --progress --backend codex
```

本项目不会捆绑或自动下载 `codeagent-wrapper`。使用 Lite 工作流前，请先安装并完成
Codex CLI 登录，再自行编译 wrapper。

## 从源码编译

需要 Go 1.21 或更高版本。

```bash
git clone https://github.com/fengshao1227/ccg-workflow.git
cd ccg-workflow/codeagent-wrapper
go build -o codeagent-wrapper .
```

当前使用的 wrapper 源码位于 `ccg-workflow` 仓库的
`codeagent-wrapper/` 目录。可以运行以下命令检查构建结果：

```bash
./codeagent-wrapper --version
./codeagent-wrapper --help
```

## 安装到项目的 `.trellis/bin`

推荐把二进制安装在使用 Trellis CCG Lite 的项目中，而不是写入用户主目录。
`.trellis/bin/` 默认已被该项目的 `.trellis/.gitignore` 忽略。

macOS/Linux：

```bash
mkdir -p /path/to/your-project/.trellis/bin
cp codeagent-wrapper /path/to/your-project/.trellis/bin/codeagent-wrapper
chmod +x /path/to/your-project/.trellis/bin/codeagent-wrapper
```

Windows PowerShell（先在 Windows 上执行 `go build`，产物名通常带 `.exe`）：

```powershell
New-Item -ItemType Directory -Force C:\path\to\your-project\.trellis\bin
Copy-Item .\codeagent-wrapper.exe C:\path\to\your-project\.trellis\bin\codeagent-wrapper.exe
```

在目标项目根目录验证：

```bash
.trellis/bin/codeagent-wrapper --version
.trellis/bin/codeagent-wrapper --help
```

Windows PowerShell 使用：

```powershell
.\.trellis\bin\codeagent-wrapper.exe --version
.\.trellis\bin\codeagent-wrapper.exe --help
```

## wrapper 查找顺序

dispatcher 按以下顺序查找可执行文件：

1. `.trellis/config.yaml` 中的 `trellis-ccg.wrapper_path`；
2. 项目内 `.trellis/bin/codeagent-wrapper`（Windows 也会识别 `.exe`）；
3. `PATH` 中的 `codeagent-wrapper`；
4. 兼容旧安装位置 `~/.claude/bin/codeagent-wrapper`。

默认配置无需修改：

```yaml
trellis-ccg:
  wrapper_path: .trellis/bin/codeagent-wrapper
  max_correction_rounds: 2
```

找不到 wrapper 时，dispatcher 会列出已搜索的位置并明确失败，不会改用 Claude、
Gemini、team 模式或其他执行后端。

## 没有 Go 环境

可以在另一台操作系统和 CPU 架构相同、装有 Go 1.21+ 的机器上编译，然后把二进制
复制到项目的 `.trellis/bin/`。目前不要假定存在可下载的公开 release；Lite 也不会
替用户下载或提交该二进制。

## 使用前检查

- Codex CLI 已安装，并已完成登录；
- wrapper 的 `--version` 和 `--help` 可正常运行；
- 从项目根目录能找到 `.trellis/bin/codeagent-wrapper`；
- `.trellis/config.yaml` 没有指向错误的自定义路径。

Lite 不需要 Gemini API key，也不提供多模型、review/debug/team fallback。Codex 的
认证由 Codex CLI 自身管理。
