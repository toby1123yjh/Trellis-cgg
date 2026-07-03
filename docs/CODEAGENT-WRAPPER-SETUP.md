# codeagent-wrapper 安装说明

## 什么是 codeagent-wrapper？

`codeagent-wrapper` 是一个多模型桥接二进制程序，让 trellis-ccg 能够调用 Codex、Gemini 等外部模型进行并行分析、审查和调试。

## 为什么需要它？

以下命令需要 codeagent-wrapper 才能工作：
- `/trellis-ccg:review` - 双模型代码审查
- `/trellis-ccg:debug` - 双模型并行调试
- `/trellis-ccg:analyze` - 双模型技术分析
- `/trellis-ccg:team-*` 系列 - 多模型 Agent Teams 工作流

如果你不使用这些多模型功能，可以跳过 wrapper 安装。

## 如何获取 codeagent-wrapper？

### 方案 A：从源码编译（推荐）

**前置条件**: 需要 Go 1.19+ 环境

```bash
# 1. Clone ccg-workflow 源码（如果还没有）
git clone https://github.com/your-org/ccg-workflow.git

# 2. 进入 wrapper 目录
cd ccg-workflow/codeagent-wrapper

# 3. 编译当前平台的二进制
go build -o codeagent-wrapper .

# 4. 复制到 ~/.claude/bin/
mkdir -p ~/.claude/bin
cp codeagent-wrapper ~/.claude/bin/
chmod +x ~/.claude/bin/codeagent-wrapper

# 验证安装
~/.claude/bin/codeagent-wrapper --version
```

### 方案 B：编译所有平台（用于分发）

```bash
cd ccg-workflow/codeagent-wrapper
./build-all.sh

# 编译结果在 ccg-workflow/bin/ 下：
# - codeagent-wrapper-darwin-amd64
# - codeagent-wrapper-darwin-arm64
# - codeagent-wrapper-linux-amd64
# - codeagent-wrapper-linux-arm64
# - codeagent-wrapper-windows-amd64.exe
# - codeagent-wrapper-windows-arm64.exe

# 复制对应平台的版本到 ~/.claude/bin/codeagent-wrapper
```

### 方案 C：从 release 下载（未来可用）

**注意**: 目前 codeagent-wrapper 还没有公开 release，请使用方案 A 或 B。

未来会提供预编译版本：
```bash
# 下载脚本（未来）
curl -sSL https://raw.githubusercontent.com/your-org/trellis-ccg/main/scripts/install-wrapper.sh | bash
```

## 配置 wrapper 路径

编辑项目的 `.trellis/config.yaml`：

```yaml
trellis-ccg:
  wrapper_path: ~/.claude/bin/codeagent-wrapper  # 修改为你的实际路径
  team:
    backend_primary: codex
    frontend_primary: gemini
```

## 验证安装

运行以下命令检查 wrapper 是否正常工作：

```bash
~/.claude/bin/codeagent-wrapper --help
```

如果看到帮助信息，说明安装成功。

## 没有 Go 环境怎么办？

如果你的机器没有 Go 环境，有以下选择：

1. **安装 Go**: https://go.dev/dl/
2. **找有 Go 环境的机器编译**，然后复制二进制文件
3. **等待未来的 release 版本**（会提供预编译二进制）
4. **暂时不使用多模型功能**，只用 Trellis 原生命令

## 常见问题

### Q: wrapper 是必须的吗？
A: 不是。如果你只使用 Trellis 原生功能，不需要 wrapper。只有用多模型命令（review/debug/analyze/team）时才需要。

### Q: wrapper 需要 API key 吗？
A: 是的。使用 Codex 需要 OpenAI API key，使用 Gemini 需要 Google API key。配置方法参考 wrapper 的文档。

### Q: 可以只用一个模型吗？
A: 可以。在 config.yaml 里把 `backend_primary` 和 `frontend_primary` 都设为同一个模型（如 codex），或者设为 `claude` 使用本地模型。

---

更新时间: 2024-07-03
