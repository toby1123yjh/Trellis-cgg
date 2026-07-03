#!/usr/bin/env node
/**
 * Download codeagent-wrapper binary from GitHub release
 * This script is optional - users can also compile from source
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WRAPPER_VERSION = 'v1.0.0'; // Update this when new version is released
const REPO = 'your-org/codeagent-wrapper'; // Update with actual repo
const BASE_URL = `https://github.com/${REPO}/releases/download/${WRAPPER_VERSION}`;

function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-amd64';
  } else if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-amd64';
  } else if (platform === 'win32') {
    return arch === 'arm64' ? 'windows-arm64.exe' : 'windows-amd64.exe';
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  try {
    const platformSuffix = detectPlatform();
    const binaryName = `codeagent-wrapper-${platformSuffix}`;
    const url = `${BASE_URL}/${binaryName}`;

    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error('Cannot determine home directory');
    }

    const destDir = path.join(homeDir, '.claude', 'bin');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const destPath = path.join(destDir, 'codeagent-wrapper' + (platformSuffix.endsWith('.exe') ? '.exe' : ''));

    console.log(`Downloading codeagent-wrapper for ${platformSuffix}...`);
    console.log(`From: ${url}`);
    console.log(`To: ${destPath}`);

    await downloadFile(url, destPath);

    // Make executable on Unix
    if (process.platform !== 'win32') {
      fs.chmodSync(destPath, 0o755);
    }

    console.log('✓ codeagent-wrapper installed successfully!');
    console.log(`  Location: ${destPath}`);

  } catch (error) {
    console.error('✗ Failed to download codeagent-wrapper:', error.message);
    console.error('\nAlternative: You can compile from source:');
    console.error('  cd ccg-workflow/codeagent-wrapper && ./build-all.sh');
    console.error('  Then copy the binary to ~/.claude/bin/codeagent-wrapper');
    process.exit(1);
  }
}

main();
