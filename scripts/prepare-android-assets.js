"use strict";

/**
 * Bundles the Node.js game into android/app assets and installs libnode.so
 * from nodejs-mobile v18.20.4.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");
const { createWriteStream } = require("fs");
const { pipeline } = require("stream/promises");

const ROOT = path.resolve(__dirname, "..");
const ANDROID_APP = path.join(ROOT, "android", "app", "src", "main");
const ASSETS_NODE = path.join(ANDROID_APP, "assets", "nodejs-project");
const JNILIBS = path.join(ANDROID_APP, "jniLibs");
const CPP_LIBNODE = path.join(ANDROID_APP, "cpp", "libnode");
const CACHE = path.join(ROOT, ".android-deps");
const NODE_MOBILE_VERSION = "18.20.4";
const ZIP_NAME = `nodejs-mobile-v${NODE_MOBILE_VERSION}-android.zip`;
const ZIP_URL = `https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${NODE_MOBILE_VERSION}/${ZIP_NAME}`;

const COPY_ROOT_FILES = ["server.js", "android-entry.js", "package.json", "package-lock.json"];

const SKIP_NAME = new Set([
  ".git",
  ".DS_Store",
  "Thumbs.db",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "LICENSE.md",
  "History.md",
  "HISTORY.md",
  ".npmignore",
  ".eslintrc",
  ".eslintrc.js",
  ".travis.yml",
  "tsconfig.json",
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function shouldSkip(name) {
  if (SKIP_NAME.has(name)) return true;
  if (name.endsWith(".md") || name.endsWith(".ts") || name.endsWith(".map")) return true;
  if (name.endsWith(".d.ts")) return true;
  return false;
}

function copyDirFiltered(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    if (entry.name === "test" || entry.name === "tests" || entry.name === "docs" || entry.name === "example" || entry.name === "examples") {
      continue;
    }
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      copyDirFiltered(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(dest));
    const file = createWriteStream(dest);
    const get = (currentUrl, redirects = 0) => {
      if (redirects > 5) {
        reject(new Error("Too many redirects"));
        return;
      }
      https
        .get(currentUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            get(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          pipeline(res, file).then(resolve).catch(reject);
        })
        .on("error", reject);
    };
    get(url);
  });
}

function extractZip(zipPath, outDir) {
  ensureDir(outDir);
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: "inherit" });
  }
}

function findLibNodeRoots(extractedRoot) {
  const hits = [];
  function walk(dir, depth = 0) {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "bin" || entry.name === "include") {
          hits.push(dir);
          return;
        }
        walk(full, depth + 1);
      }
    }
  }
  walk(extractedRoot);
  return [...new Set(hits)];
}

function installLibNode(extractedRoot) {
  const roots = findLibNodeRoots(extractedRoot);
  if (!roots.length) {
    throw new Error("Could not find libnode layout in extracted zip");
  }

  // Prefer a root that contains bin/<abi>/libnode.so
  let chosen = roots.find((root) => fs.existsSync(path.join(root, "bin"))) || roots[0];
  const binDir = path.join(chosen, "bin");
  const includeDir = path.join(chosen, "include");

  console.log("Using nodejs-mobile root:", chosen);

  rmrf(JNILIBS);
  ensureDir(JNILIBS);

  if (fs.existsSync(binDir)) {
    for (const abi of fs.readdirSync(binDir)) {
      const so = path.join(binDir, abi, "libnode.so");
      if (!fs.existsSync(so)) continue;
      const destDir = path.join(JNILIBS, abi);
      ensureDir(destDir);
      fs.copyFileSync(so, path.join(destDir, "libnode.so"));
      console.log("Installed", abi, "libnode.so");
    }
  }

  rmrf(CPP_LIBNODE);
  ensureDir(CPP_LIBNODE);
  if (fs.existsSync(includeDir)) {
    copyDirFiltered(includeDir, path.join(CPP_LIBNODE, "include"));
  } else {
    // Some zips put headers next to bin
    const alt = path.join(chosen, "include");
    if (fs.existsSync(alt)) copyDirFiltered(alt, path.join(CPP_LIBNODE, "include"));
  }

  // Also copy shared headers if present at top-level "libnode"
  const maybeHeaders = path.join(CPP_LIBNODE, "include", "node");
  if (!fs.existsSync(maybeHeaders)) {
    console.warn("Warning: node headers may be incomplete; CMake expects include/node/node.h");
  }
}

function bundleNodeProject() {
  rmrf(ASSETS_NODE);
  ensureDir(ASSETS_NODE);

  for (const file of COPY_ROOT_FILES) {
    const from = path.join(ROOT, file);
    if (!fs.existsSync(from)) throw new Error(`Missing ${file}`);
    fs.copyFileSync(from, path.join(ASSETS_NODE, file));
  }

  copyDirFiltered(path.join(ROOT, "public"), path.join(ASSETS_NODE, "public"));

  const serverDir = path.join(ROOT, "server");
  if (fs.existsSync(serverDir)) {
    copyDirFiltered(serverDir, path.join(ASSETS_NODE, "server"));
  }

  const nmSrc = path.join(ROOT, "node_modules");
  if (!fs.existsSync(nmSrc)) {
    console.log("Installing npm dependencies…");
    execSync("npm ci --omit=dev", { cwd: ROOT, stdio: "inherit" });
  }

  const nmDest = path.join(ASSETS_NODE, "node_modules");
  ensureDir(nmDest);

  for (const entry of fs.readdirSync(nmSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    copyDirFiltered(path.join(nmSrc, entry.name), path.join(nmDest, entry.name));
  }

  console.log("Bundled nodejs-project →", ASSETS_NODE);
}

async function ensureNodeMobile() {
  ensureDir(CACHE);
  const zipPath = path.join(CACHE, ZIP_NAME);
  const extractDir = path.join(CACHE, `nodejs-mobile-${NODE_MOBILE_VERSION}`);

  if (!fs.existsSync(zipPath)) {
    console.log("Downloading", ZIP_URL);
    await download(ZIP_URL, zipPath);
  } else {
    console.log("Using cached", zipPath);
  }

  rmrf(extractDir);
  ensureDir(extractDir);
  console.log("Extracting…");
  extractZip(zipPath, extractDir);
  installLibNode(extractDir);
}

async function main() {
  console.log("Preparing Android Node assets…");
  bundleNodeProject();
  await ensureNodeMobile();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
