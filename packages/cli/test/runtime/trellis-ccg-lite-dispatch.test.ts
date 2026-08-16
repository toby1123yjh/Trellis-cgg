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

const structuredReportLines = [
  "## CONTEXT_GATHERED",
  "- fixture context",
  "## CHANGES_MADE",
  "- fixture change",
  "## VERIFICATION_RESULTS",
  "- fixture check: PASS",
  "## REMAINING_ISSUES",
  "- none",
];

function writeSuccessfulWrapper(
  wrapper: string,
  sessionId = "fake-session",
): void {
  if (process.platform === "win32") {
    fs.writeFileSync(
      wrapper,
      [
        "@echo off",
        ...structuredReportLines.map((line) => `echo ${line}`),
        `echo SESSION_ID: ${sessionId}`,
        "exit /b 0",
        "",
      ].join("\r\n"),
    );
  } else {
    const output = [
      ...structuredReportLines,
      `SESSION_ID: ${sessionId}`,
      "",
    ].join("\\n");
    fs.writeFileSync(wrapper, `#!/bin/sh\nprintf '${output}'\n`);
    fs.chmodSync(wrapper, 0o755);
  }
}

function createFixture(): { root: string; wrapper: string; task: string } {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "trellis-ccg-lite-dispatch-"),
  );
  tempProjects.push(root);
  const commonDir = path.join(root, ".trellis", "scripts", "common");
  const extensionDir = path.join(
    root,
    ".trellis",
    "extensions",
    "trellis-ccg-lite",
  );
  const task = path.join(root, ".trellis", "tasks", "01-01-demo");
  const binDir = path.join(root, ".trellis", "bin");
  fs.mkdirSync(commonDir, { recursive: true });
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.mkdirSync(task, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(commonDir, "__init__.py"), "");
  fs.copyFileSync(
    trellisConfigHelper,
    path.join(commonDir, "trellis_config.py"),
  );
  fs.writeFileSync(
    path.join(root, ".trellis", "config.yaml"),
    [
      "trellis-ccg:",
      "  wrapper_path: .trellis/bin/codeagent-wrapper",
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

  const wrapperBase = path.join(binDir, "codeagent-wrapper");
  const wrapper =
    process.platform === "win32" ? `${wrapperBase}.cmd` : wrapperBase;
  writeSuccessfulWrapper(wrapper);
  return {
    root,
    wrapper,
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
      report_valid: boolean;
    };
    expect(record.status).toBe("completed");
    expect(record.session_id).toBe("fake-session");
    expect(record.correction_round).toBe(0);
    expect(record.report_valid).toBe(true);
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

  it("requires sequential correction history and enforces the two-round cap", () => {
    const fixture = createFixture();
    execFileSync(
      python,
      [dispatcher, "--cwd", fixture.root, "run", "--task-dir", fixture.task],
      { encoding: "utf8" },
    );

    const resume = (round: number): void => {
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
          String(round),
          "--issues",
          `verified issue ${round}`,
        ],
        { encoding: "utf8" },
      );
    };

    expect(() => resume(2)).toThrow();
    resume(1);
    expect(() => resume(1)).toThrow();
    resume(2);
    expect(() => resume(2)).toThrow();

    const runsDir = path.join(
      fixture.root,
      ".trellis",
      ".runtime",
      "trellis-ccg-lite",
      "runs",
    );
    expect(
      fs.readdirSync(runsDir).filter((name) => name.endsWith(".json")),
    ).toHaveLength(3);
  });

  it("rejects resume when the task has no initial record for that session", () => {
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
          "invented-session",
          "--correction-round",
          "1",
          "--issues",
          "failure",
        ],
        { encoding: "utf8" },
      ),
    ).toThrow();
  });

  it("fails a zero-exit wrapper result that omits the structured report", () => {
    const fixture = createFixture();
    if (process.platform === "win32") {
      fs.writeFileSync(
        fixture.wrapper,
        "@echo off\r\necho SESSION_ID: reportless-session\r\nexit /b 0\r\n",
      );
    } else {
      fs.writeFileSync(
        fixture.wrapper,
        "#!/bin/sh\nprintf 'SESSION_ID: reportless-session\\n'\n",
      );
      fs.chmodSync(fixture.wrapper, 0o755);
    }

    expect(() =>
      execFileSync(
        python,
        [dispatcher, "--cwd", fixture.root, "run", "--task-dir", fixture.task],
        { encoding: "utf8" },
      ),
    ).toThrow();

    const record = JSON.parse(
      fs.readFileSync(
        path.join(
          fixture.root,
          ".trellis",
          ".runtime",
          "trellis-ccg-lite",
          "latest.json",
        ),
        "utf8",
      ),
    ) as {
      status: string;
      session_id: string;
      report_valid: boolean;
      missing_report_sections: string[];
    };
    expect(record.status).toBe("failed");
    expect(record.session_id).toBe("reportless-session");
    expect(record.report_valid).toBe(false);
    expect(record.missing_report_sections).toEqual(
      structuredReportLines.filter((line) => line.startsWith("## ")),
    );
  });

  it("rejects a resume that reports a different session id", () => {
    const fixture = createFixture();
    execFileSync(
      python,
      [dispatcher, "--cwd", fixture.root, "run", "--task-dir", fixture.task],
      { encoding: "utf8" },
    );
    writeSuccessfulWrapper(fixture.wrapper, "replacement-session");

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
          "1",
          "--issues",
          "verified issue",
        ],
        { encoding: "utf8" },
      ),
    ).toThrow();

    const record = JSON.parse(
      fs.readFileSync(
        path.join(
          fixture.root,
          ".trellis",
          ".runtime",
          "trellis-ccg-lite",
          "latest.json",
        ),
        "utf8",
      ),
    ) as {
      status: string;
      session_id: string;
      reported_session_id: string;
      correction_round: number;
    };
    expect(record.status).toBe("failed");
    expect(record.session_id).toBe("fake-session");
    expect(record.reported_session_id).toBe("replacement-session");
    expect(record.correction_round).toBe(1);
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
        [dispatcher, "--cwd", fixture.root, "run", "--task-dir", fixture.task],
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
