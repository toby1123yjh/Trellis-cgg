import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import {
  getAllAgents,
  getAllCodexSkills,
  getAllHooks,
  getConfigTemplate,
  getHooksConfig,
} from "../templates/codex/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  applyPullBasedPreludeToml,
  writeSkills,
  writeSharedHooks,
  replacePythonCommandLiterals,
} from "./shared.js";

/**
 * Configure Codex by writing:
 * - .agents/skills/ — shared skills from common source
 * - .codex/skills/ — Codex-specific skills (platform-specific templates)
 * - .codex/agents/, hooks/, hooks.json, config.toml — platform-specific
 */
export async function configureCodex(cwd: string): Promise<void> {
  // Shared skills from common source → .agents/skills/
  // Uses the neutral placeholder resolver so the auto-triggered skill templates
  // from `common/skills/` render to the
  // same bytes regardless of which platform writes them — required because
  // Gemini CLI 0.40+ also targets `.agents/skills/` (last-writer-wins is
  // safe when both writers produce identical output).
  const sharedSkillsRoot = path.join(cwd, ".agents", "skills");
  await writeSkills(
    sharedSkillsRoot,
    resolveAllAsSkillsNeutral(AI_TOOLS.codex.templateContext),
    resolveBundledSkills(AI_TOOLS.codex.templateContext),
  );

  const codexRoot = path.join(cwd, ".codex");

  // Codex-specific skills (platform-specific) → .codex/skills/
  const codexSkillsRoot = path.join(codexRoot, "skills");
  ensureDir(codexSkillsRoot);

  for (const skill of getAllCodexSkills()) {
    const skillDir = path.join(codexSkillsRoot, skill.name);
    ensureDir(skillDir);
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      replacePythonCommandLiterals(skill.content),
    );
  }

  // Custom agents → .codex/agents/
  const codexAgentsRoot = path.join(codexRoot, "agents");
  ensureDir(codexAgentsRoot);

  // Codex is a hybrid: native SubagentStart injects context on current
  // runtimes, while this pull-based prelude keeps agent profiles usable before
  // project trust/hook approval and on older runtimes.
  for (const agent of applyPullBasedPreludeToml(getAllAgents())) {
    await writeFile(
      path.join(codexAgentsRoot, `${agent.name}.toml`),
      replacePythonCommandLiterals(agent.content),
    );
  }

  // Hooks → .codex/hooks/
  const hooksDir = path.join(codexRoot, "hooks");
  ensureDir(hooksDir);

  // Codex-specific hook files. hooks.json currently registers only
  // UserPromptSubmit; session-start.py is retained as a compact compatibility
  // template and regression surface.
  for (const hook of getAllHooks()) {
    await writeFile(
      path.join(hooksDir, hook.name),
      replacePythonCommandLiterals(hook.content),
    );
  }

  // Shared hooks include the main-session breadcrumb and, on Codex versions
  // that expose SubagentStart, native sub-agent context. Agent profiles still
  // carry the pull-based fallback for older Codex runtimes.
  await writeSharedHooks(hooksDir, "codex");

  // Hooks config → .codex/hooks.json
  await writeFile(
    path.join(codexRoot, "hooks.json"),
    resolvePlaceholders(getHooksConfig()),
  );

  // NOTE: Current Codex versions enable hooks by default. Project hooks still
  // require a trusted project layer and a one-time `/hooks` review. A user can
  // explicitly disable them with `[features] hooks = false`; in that case the
  // trellis-bootstrap fallback in inject-workflow-state.py still covers the
  // main workflow. Documented in spec/cli/backend/platform-integration.md.
  if (!process.env.VITEST && !process.env.TRELLIS_QUIET) {
    process.stderr.write(
      "⚠️  Codex hooks are enabled by default, but project hooks require " +
        "project trust and a one-time `/hooks` review. Approve the Trellis " +
        "UserPromptSubmit and SubagentStart hooks there. If `[features] " +
        "hooks = false` is set, automatic Trellis context injection stays " +
        "disabled. See Trellis docs for details.\n",
    );
  }

  // Config → .codex/config.toml
  const config = getConfigTemplate();
  await writeFile(
    path.join(codexRoot, config.targetPath),
    replacePythonCommandLiterals(config.content),
  );
}
