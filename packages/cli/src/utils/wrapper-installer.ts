import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

export const WRAPPER_VERSION = "5.14.0";

const LITE_MANIFEST = path.join(
  ".trellis",
  "extensions",
  "trellis-ccg-lite",
  "manifest.json",
);

export interface WrapperSource {
  name: string;
  url: string;
  timeoutMs: number;
}

export const DEFAULT_WRAPPER_SOURCES: readonly WrapperSource[] = [
  {
    name: "Cloudflare CDN",
    url: "https://github.20031227.xyz/preset",
    timeoutMs: 30_000,
  },
  {
    name: "GitHub Release",
    url: "https://github.com/fengshao1227/ccg-workflow/releases/download/preset",
    timeoutMs: 120_000,
  },
];

export interface WrapperInstallerDependencies {
  platform?: string;
  arch?: string;
  fetch?: typeof globalThis.fetch;
  readVersion?: (wrapperPath: string) => string;
  sources?: readonly WrapperSource[];
}

export interface WrapperInstallResult {
  status: "not-lite" | "current" | "installed";
  wrapperPath?: string;
  source?: string;
}

export function getWrapperAssetName(platform: string, arch: string): string {
  const platformName = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  }[platform];

  if (!platformName || (arch !== "x64" && arch !== "arm64")) {
    throw new Error(
      `codeagent-wrapper does not support ${platform}-${arch}. ` +
        "Supported systems: macOS, Linux, and Windows on x64 or arm64.",
    );
  }

  const assetArch = arch === "x64" ? "amd64" : "arm64";
  const extension = platform === "win32" ? ".exe" : "";
  return `codeagent-wrapper-${platformName}-${assetArch}${extension}`;
}

export function parseWrapperVersion(output: string): string | null {
  const match = output.trim().match(/(?:^|\bversion\s+)(\d+\.\d+\.\d+)$/i);
  return match?.[1] ?? null;
}

function readInstalledVersion(wrapperPath: string): string {
  return execFileSync(wrapperPath, ["--version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
}

function hasExpectedVersion(
  wrapperPath: string,
  readVersion: (wrapperPath: string) => string,
): boolean {
  try {
    return parseWrapperVersion(readVersion(wrapperPath)) === WRAPPER_VERSION;
  } catch {
    return false;
  }
}

async function downloadToFile(
  source: WrapperSource,
  assetName: string,
  destination: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), source.timeoutMs);

  try {
    const response = await fetchImpl(`${source.url}/${assetName}`, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contents = Buffer.from(await response.arrayBuffer());
    if (contents.length === 0) {
      throw new Error("downloaded file is empty");
    }
    fs.writeFileSync(destination, contents);
  } finally {
    clearTimeout(timer);
  }
}

function uniqueSiblingPath(targetPath: string, kind: string): string {
  return `${targetPath}.${kind}-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

/**
 * Rename the verified download into place. Node normally replaces the target
 * atomically; the backup path handles filesystems that reject overwrite-by-
 * rename (notably some Windows configurations).
 */
function replaceWrapper(downloadPath: string, targetPath: string): void {
  try {
    fs.renameSync(downloadPath, targetPath);
    return;
  } catch (directRenameError) {
    if (!fs.existsSync(targetPath)) {
      throw directRenameError;
    }
  }

  const backupPath = uniqueSiblingPath(targetPath, "backup");
  fs.renameSync(targetPath, backupPath);

  try {
    fs.renameSync(downloadPath, targetPath);
  } catch (replaceError) {
    try {
      fs.renameSync(backupPath, targetPath);
    } catch (restoreError) {
      throw new Error(
        `Could not replace codeagent-wrapper or restore the previous file. ` +
          `The previous wrapper is preserved at ${backupPath}. ` +
          `Replacement error: ${String(replaceError)}; restore error: ${String(restoreError)}`,
      );
    }
    throw replaceError;
  }

  try {
    fs.rmSync(backupPath, { force: true });
  } catch (cleanupError) {
    // The verified wrapper is already installed. Do not report the install as
    // failed (or retry another source) only because the old backup is locked.
    console.warn(
      chalk.yellow(
        `Installed codeagent-wrapper, but could not remove the previous wrapper backup at ${backupPath}: ${String(cleanupError)}`,
      ),
    );
  }
}

/**
 * Ensure a Lite project has the supported project-local executor wrapper.
 * Non-Lite projects are a no-op.
 */
export async function ensureLiteWrapperForProject(
  cwd: string,
  dependencies: WrapperInstallerDependencies = {},
): Promise<WrapperInstallResult> {
  if (!fs.existsSync(path.join(cwd, LITE_MANIFEST))) {
    return { status: "not-lite" };
  }

  const platform = dependencies.platform ?? process.platform;
  const arch = dependencies.arch ?? process.arch;
  const assetName = getWrapperAssetName(platform, arch);
  const wrapperName =
    platform === "win32" ? "codeagent-wrapper.exe" : "codeagent-wrapper";
  const wrapperPath = path.join(cwd, ".trellis", "bin", wrapperName);
  const readVersion = dependencies.readVersion ?? readInstalledVersion;

  if (
    fs.existsSync(wrapperPath) &&
    hasExpectedVersion(wrapperPath, readVersion)
  ) {
    console.log(
      chalk.gray(`codeagent-wrapper ${WRAPPER_VERSION} is already installed.`),
    );
    return { status: "current", wrapperPath };
  }

  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "This Node.js runtime does not provide fetch; Node.js 18.17 or newer is required.",
    );
  }

  const binDir = path.dirname(wrapperPath);
  fs.mkdirSync(binDir, { recursive: true });
  const downloadPath = uniqueSiblingPath(wrapperPath, "download");
  const failures: string[] = [];

  console.log(
    chalk.blue(
      `Installing codeagent-wrapper ${WRAPPER_VERSION} for ${platform}-${arch}...`,
    ),
  );

  try {
    for (const source of dependencies.sources ?? DEFAULT_WRAPPER_SOURCES) {
      try {
        fs.rmSync(downloadPath, { force: true });
        await downloadToFile(source, assetName, downloadPath, fetchImpl);
        if (platform !== "win32") {
          fs.chmodSync(downloadPath, 0o755);
        }

        const downloadedVersion = parseWrapperVersion(
          readVersion(downloadPath),
        );
        if (downloadedVersion !== WRAPPER_VERSION) {
          throw new Error(
            `expected version ${WRAPPER_VERSION}, received ${downloadedVersion ?? "unrecognized output"}`,
          );
        }

        replaceWrapper(downloadPath, wrapperPath);
        console.log(
          chalk.green(
            `Installed codeagent-wrapper ${WRAPPER_VERSION} at ${path.relative(cwd, wrapperPath)}`,
          ),
        );
        return { status: "installed", wrapperPath, source: source.name };
      } catch (error) {
        failures.push(
          `${source.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    fs.rmSync(downloadPath, { force: true });
  }

  throw new Error(
    `Failed to install codeagent-wrapper ${WRAPPER_VERSION}. ` +
      `The existing wrapper was left unchanged. ${failures.join("; ")}`,
  );
}
