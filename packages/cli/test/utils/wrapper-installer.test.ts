import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureLiteWrapperForProject,
  getWrapperAssetName,
  parseWrapperVersion,
  WRAPPER_VERSION,
  type WrapperSource,
} from "../../src/utils/wrapper-installer.js";

const TEST_SOURCES: readonly WrapperSource[] = [
  { name: "mirror", url: "https://mirror.example/preset", timeoutMs: 1_000 },
  { name: "github", url: "https://github.example/preset", timeoutMs: 1_000 },
];

describe("wrapper installer", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-wrapper-installer-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeLiteProject(): void {
    const manifest = path.join(
      root,
      ".trellis",
      "extensions",
      "trellis-ccg-lite",
      "manifest.json",
    );
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, "{}", "utf-8");
  }

  function linuxWrapperPath(): string {
    return path.join(root, ".trellis", "bin", "codeagent-wrapper");
  }

  function windowsWrapperPath(): string {
    return path.join(root, ".trellis", "bin", "codeagent-wrapper.exe");
  }

  it.each([
    ["darwin", "x64", "codeagent-wrapper-darwin-amd64"],
    ["darwin", "arm64", "codeagent-wrapper-darwin-arm64"],
    ["linux", "x64", "codeagent-wrapper-linux-amd64"],
    ["linux", "arm64", "codeagent-wrapper-linux-arm64"],
    ["win32", "x64", "codeagent-wrapper-windows-amd64.exe"],
    ["win32", "arm64", "codeagent-wrapper-windows-arm64.exe"],
  ])("maps %s-%s to %s", (platform, arch, expected) => {
    expect(getWrapperAssetName(platform, arch)).toBe(expected);
  });

  it("rejects unsupported platform and architecture combinations", () => {
    expect(() => getWrapperAssetName("freebsd", "x64")).toThrow(
      "does not support freebsd-x64",
    );
    expect(() => getWrapperAssetName("linux", "ia32")).toThrow(
      "does not support linux-ia32",
    );
  });

  it("parses only complete semantic version output", () => {
    expect(parseWrapperVersion(WRAPPER_VERSION)).toBe(WRAPPER_VERSION);
    expect(
      parseWrapperVersion(`codeagent-wrapper version ${WRAPPER_VERSION}\n`),
    ).toBe(WRAPPER_VERSION);
    expect(parseWrapperVersion(`${WRAPPER_VERSION} dirty`)).toBeNull();
  });

  it("skips non-Lite projects", async () => {
    const fetchMock = vi.fn();
    await expect(
      ensureLiteWrapperForProject(root, {
        platform: "linux",
        arch: "x64",
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ status: "not-lite" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a wrapper that already has the expected version", async () => {
    makeLiteProject();
    const wrapperPath = linuxWrapperPath();
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, "current", "utf-8");
    const fetchMock = vi.fn();

    await expect(
      ensureLiteWrapperForProject(root, {
        platform: "linux",
        arch: "x64",
        fetch: fetchMock as unknown as typeof fetch,
        readVersion: () => `codeagent-wrapper version ${WRAPPER_VERSION}`,
      }),
    ).resolves.toMatchObject({ status: "current", wrapperPath });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.readFileSync(wrapperPath, "utf-8")).toBe("current");
  });

  it("falls back from the mirror to GitHub and installs the verified file", async () => {
    makeLiteProject();
    const chmodSpy = vi.spyOn(fs, "chmodSync");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("verified-wrapper"));

    await expect(
      ensureLiteWrapperForProject(root, {
        platform: "linux",
        arch: "x64",
        fetch: fetchMock as unknown as typeof fetch,
        readVersion: () => `codeagent-wrapper version ${WRAPPER_VERSION}`,
        sources: TEST_SOURCES,
      }),
    ).resolves.toMatchObject({ status: "installed", source: "github" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://mirror.example/preset/codeagent-wrapper-linux-amd64",
      expect.objectContaining({ redirect: "follow" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://github.example/preset/codeagent-wrapper-linux-amd64",
      expect.objectContaining({ redirect: "follow" }),
    );
    expect(fs.readFileSync(linuxWrapperPath(), "utf-8")).toBe(
      "verified-wrapper",
    );
    expect(chmodSpy).toHaveBeenCalledWith(expect.any(String), 0o755);
  });

  it("uses the backup fallback when the platform cannot rename over the old wrapper", async () => {
    makeLiteProject();
    const wrapperPath = windowsWrapperPath();
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, "old-wrapper", "utf-8");

    const realRename = fs.renameSync.bind(fs);
    const renameSpy = vi
      .spyOn(fs, "renameSync")
      .mockImplementationOnce(() => {
        throw new Error("cannot rename over an existing file");
      })
      .mockImplementation(realRename);

    await expect(
      ensureLiteWrapperForProject(root, {
        platform: "win32",
        arch: "x64",
        fetch: vi
          .fn()
          .mockResolvedValue(
            new Response("verified-wrapper"),
          ) as unknown as typeof fetch,
        readVersion: (candidate) =>
          candidate === wrapperPath
            ? "codeagent-wrapper version 5.13.0"
            : `codeagent-wrapper version ${WRAPPER_VERSION}`,
        sources: [TEST_SOURCES[0]],
      }),
    ).resolves.toMatchObject({ status: "installed", wrapperPath });

    expect(renameSpy).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync(wrapperPath, "utf-8")).toBe("verified-wrapper");
    expect(
      fs
        .readdirSync(path.dirname(wrapperPath))
        .filter((entry) => entry.includes(".backup-")),
    ).toEqual([]);
  });

  it("preserves the old wrapper and removes temporary files on verification failure", async () => {
    makeLiteProject();
    const wrapperPath = linuxWrapperPath();
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, "old-wrapper", "utf-8");
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad-wrapper"));

    await expect(
      ensureLiteWrapperForProject(root, {
        platform: "linux",
        arch: "x64",
        fetch: fetchMock as unknown as typeof fetch,
        readVersion: (candidate) =>
          candidate === wrapperPath
            ? "codeagent-wrapper version 5.13.0"
            : "codeagent-wrapper version 5.12.0",
        sources: [TEST_SOURCES[0]],
      }),
    ).rejects.toThrow(`expected version ${WRAPPER_VERSION}`);

    expect(fs.readFileSync(wrapperPath, "utf-8")).toBe("old-wrapper");
    expect(
      fs
        .readdirSync(path.dirname(wrapperPath))
        .filter((entry) => entry.includes(".download-")),
    ).toEqual([]);
  });
});
