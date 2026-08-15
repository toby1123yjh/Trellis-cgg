import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const python = process.platform === "win32" ? "python" : "python3";
const repoRoot = path.resolve(process.cwd(), "../..");
const dispatcher = path.join(
  repoRoot,
  "packages",
  "cli",
  "src",
  "templates",
  "common",
  "extensions",
  "trellis-ccg-lite",
  "dispatch.py",
);
const resultHook = path.join(
  repoRoot,
  "packages",
  "cli",
  "src",
  "templates",
  "common",
  "extensions",
  "trellis-ccg-lite",
  "inject-ccg-lite-result.py",
);
const trellisConfigHelper = path.join(
  repoRoot,
  "packages",
  "cli",
  "src",
  "templates",
  "trellis",
  "scripts",
  "common",
  "trellis_config.py",
);

const tempProjects: string[] = [];

function createFixture(): { root: string; wrapper: string; task: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-ccg-lite-dispatch-"));
  tempProjects.push(root);
  const commonDir = path.join(root, ".trellis", "scripts", "common");
  const extensionDir = path.join(
    root,
    ".trellis",
    "extensions",
    "trellis-ccg-lite",
  );
  const task = path.join(root, ".trellis", "tasks", "01-01-demo");
  fs.mkdirSync(commonDir, { recursive: true });
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.mkdirSync(task, { recursive: true });
  fs.writeFileSync(path.join(commonDir, "__init__.py"), "");
  fs.copyFileSync(trellisConfigHelper, path.join(commonDir, "trellis_config.py"));
  fs.writeFileSync(
    path.join(root, ".trellis", "config.yaml"),
    [
      "trellis-ccg:",
      "  wrapper_path: .trellis/test-wrapper.cmd",
      "  executor: codex",
      "  max_correction_rounds: 2",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(task, "task.json"),
    JSON.stringify({ id: "01-01-demo", status: "in_progress" }),
  );
  fs.writeFileSync(path.join(task, "prd.md"), "# Demo\n");
  fs.writeFileSync(path.join(extensionDir, "executor.md"), "# executor\n");

  const wrapper = path.join(root, ".trellis", "test-wrapper.cmd");
  if (process.platform === "win32") {
    fs.writeFileSync(
      wrapper,
      "@echo off\r\necho SESSION_ID: fake-session\r\nexit /b 0\r\n",
    );
  } else {
    const shellWrapper = wrapper.replace(/\.cmd$/u, ".sh");
    fs.writeFileSync(
      shellWrapper,
      "#!/bin/sh\nprintf 'SESSION_ID: fake-session\\n'\n",
    );
    fs.chmodSync(shellWrapper, 0o755);
    const configPath = path.join(root, ".trellis", "config.yaml");
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, "utf8")
        .replace("test-wrapper.cmd", "test-wrapper.sh"),
    );
  }
  return {
    root,
    wrapper: process.platform === "win32" ? wrapper : wrapper.replace(/\.cmd$/u, ".sh"),
    task,
  };
}

afterEach(() => {
  for (const root of tempProjects.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("trellis-ccg-lite dispatcher", () => {
  it("dispatches Codex with fixed flags and records the session", () => {
    const fixture = createFixture();
    const output = execFileSync(
      python,
      [
        dispatcher,
        "--cwd",
        fixture.root,
        "run",
        "--task-dir",
        fixture.task,
        "--addendum",
        "keep it small",
      ],
      { encoding: "utf8" },
    );
    expect(output).toContain("SESSION_ID: fake-session");
    const latestPath = path.join(
      fixture.root,
      ".trellis",
      ".runtime",
      "trellis-ccg-lite",
      "latest.json",
    );
    const record = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
      status: string;
      session_id: string;
      command: string[];
      correction_round: number;
    };
    expect(record.status).toBe("completed");
    expect(record.session_id).toBe("fake-session");
    expect(record.correction_round).toBe(0);
    expect(record.command).toEqual(
      expect.arrayContaining(["--lite", "--progress", "--backend", "codex"]),
    );
    const hookOutput = execFileSync(python, [resultHook], {
      cwd: fixture.root,
      input: JSON.stringify({ cwd: fixture.root }),
      encoding: "utf8",
    });
    expect(hookOutput).toContain("Codex run: completed");
    expect(hookOutput).toContain("fake-session");
  });

  it("rejects correction rounds above two before starting a wrapper", () => {
    const fixture = createFixture();
    expect(() =>
      execFileSync(
        python,
        [
          dispatcher,
          "--cwd",
          fixture.root,
          "resume",
          "--task-dir",
          fixture.task,
          "--session-id",
          "fake-session",
          "--correction-round",
          "3",
          "--issues",
          "failure",
        ],
        { encoding: "utf8" },
      ),
    ).toThrow();
    expect(
      fs.existsSync(
        path.join(fixture.root, ".trellis", ".runtime", "trellis-ccg-lite"),
      ),
    ).toBe(false);
  });

  it("preserves an early stderr session id when the wrapper fails", () => {
    const fixture = createFixture();
    if (process.platform === "win32") {
      fs.writeFileSync(
        fixture.wrapper,
        "@echo off\r\necho Session-ID: recoverable-session 1>&2\r\nexit /b 9\r\n",
      );
    } else {
      fs.writeFileSync(
        fixture.wrapper,
        "#!/bin/sh\nprintf 'Session-ID: recoverable-session\\n' >&2\nexit 9\n",
      );
      fs.chmodSync(fixture.wrapper, 0o755);
    }

    expect(() =>
      execFileSync(
        python,
        [
          dispatcher,
          "--cwd",
          fixture.root,
          "run",
          "--task-dir",
          fixture.task,
        ],
        { encoding: "utf8" },
      ),
    ).toThrow();

    const latestPath = path.join(
      fixture.root,
      ".trellis",
      ".runtime",
      "trellis-ccg-lite",
      "latest.json",
    );
    const record = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
      status: string;
      session_id: string;
      stderr: string;
    };
    expect(record.status).toBe("failed");
    expect(record.session_id).toBe("recoverable-session");
    expect(record.stderr).toContain("Session-ID: recoverable-session");
  });
});
