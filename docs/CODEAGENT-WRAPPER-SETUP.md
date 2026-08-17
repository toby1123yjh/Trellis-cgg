# Trellis CCG Lite：wrapper 安装与排障

正常情况下无需单独安装 wrapper。运行下面一条命令即可：

```bash
npx trellis-ccg-lite@latest init --claude -u your-name
```

CLI 会按当前操作系统和 CPU 下载 `codeagent-wrapper` 5.14.0，校验后写入：

```text
.trellis/bin/codeagent-wrapper      # macOS/Linux
.trellis/bin/codeagent-wrapper.exe  # Windows
```

支持的平台为 macOS、Linux、Windows × x64、arm64。`.trellis/bin/` 默认被
Git 忽略。

## 下载和更新策略

下载顺序：

1. Cloudflare 镜像：`https://github.20031227.xyz/preset`
2. 上游 GitHub Release：`fengshao1227/ccg-workflow` 的 `preset` release

CLI 先写临时文件，在 Unix 设置 `755` 权限，再运行 `--version`。只有输出中的
版本精确等于 5.14.0 才替换正式文件。已有正确版本会直接跳过；任何下载或验证失败
都会保留旧 wrapper，并清理下载临时文件。

已有 Lite 项目可以运行以下任一命令修复缺失或过期版本：

```bash
npx trellis-ccg-lite@latest init --claude -u your-name
npx trellis-ccg-lite@latest update
```

## 验证

macOS/Linux：

```bash
.trellis/bin/codeagent-wrapper --version
```

Windows PowerShell：

```powershell
.\.trellis\bin\codeagent-wrapper.exe --version
```

预期版本为 `5.14.0`。

## 常见问题

### 两个下载源都失败

检查代理、防火墙和 GitHub 连通性，然后重跑 init 或 update。CLI 会使用 Trellis
已配置的代理，并在错误信息中分别列出镜像和 GitHub 的失败原因。

### Unsupported platform

目前只发布 macOS、Linux、Windows 的 x64/arm64 资产。其他系统或 CPU 架构不会
下载不匹配的二进制。

### 自定义 wrapper 路径

默认无需修改。确有需要时可在 `.trellis/config.yaml` 设置：

```yaml
trellis-ccg:
  wrapper_path: /absolute/path/to/codeagent-wrapper
  max_correction_rounds: 2
```

dispatcher 的查找顺序是显式配置、项目 `.trellis/bin/`、`PATH`、兼容旧位置
`~/.claude/bin/`。找不到时会明确失败，不会切换成其他模型执行实现。

### Codex 认证失败

wrapper 使用本机 Codex CLI 的认证状态。先在终端确认 Codex CLI 已安装并完成登录；
Lite 不需要 Gemini API key，也不会接入其他执行后端。
