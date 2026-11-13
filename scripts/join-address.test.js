"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { io } = require("socket.io-client");
const {
  ANDROID_PORT,
  DEFAULT_PORT,
  FALLBACK_PORT,
  DHCP_PORT,
  formatHttpUrl,
  sanitizeAndroidPort,
  isPrivilegedBindError,
  normalizeAdvertisedHost,
  joinHosts,
  resolvePort,
  startServer,
  stopServer,
  updateAdvertisedHost,
  getRuntimeStatus,
} = require("../server");

const ROOT = path.resolve(__dirname, "..");

test("desktop default port stays 3000 and Android asks for 80", () => {
  assert.equal(DEFAULT_PORT, 3000);
  assert.equal(ANDROID_PORT, 80);
  assert.equal(FALLBACK_PORT, 8080);
  assert.notEqual(FALLBACK_PORT, DHCP_PORT);
  assert.equal(resolvePort({ port: 80 }), 80);
  assert.equal(resolvePort({ port: 8080 }), 8080);

  const cleanEnv = { ...process.env };
  delete cleanEnv.PORT;
  const desktop = spawnSync(
    process.execPath,
    ["-e", "const s=require('./server'); process.stdout.write(String(s.resolvePort()))"],
    { cwd: ROOT, encoding: "utf8", env: cleanEnv },
  );
  assert.equal(desktop.status, 0, desktop.stderr);
  assert.equal(desktop.stdout, "3000");

  const android = spawnSync(
    process.execPath,
    ["-e", "const s=require('./server'); process.stdout.write(String(s.resolvePort()))"],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, PORT: "80" } },
  );
  assert.equal(android.status, 0, android.stderr);
  assert.equal(android.stdout, "80");

  const entry = fs.readFileSync(path.join(ROOT, "android-entry.js"), "utf8");
  const portAssignment = entry.indexOf('process.env.PORT = "80"');
  const serverRequire = entry.indexOf('require("./server")');
  assert.ok(portAssignment !== -1 && portAssignment < serverRequire);
});

test("displayed URLs omit port 80 and keep every other port", () => {
  assert.equal(formatHttpUrl("shoker.local", 80), "http://shoker.local");
  assert.equal(formatHttpUrl("192.168.43.1", 80), "http://192.168.43.1");
  assert.equal(formatHttpUrl("10.1.2.3", 80), "http://10.1.2.3");
  assert.equal(formatHttpUrl("shoker.local", 8080), "http://shoker.local:8080");
  assert.equal(formatHttpUrl("192.168.1.20", 3000), "http://192.168.1.20:3000");
});

test("Android port choice never uses DHCP port 67", () => {
  assert.equal(sanitizeAndroidPort(undefined), 80);
  assert.equal(sanitizeAndroidPort(""), 80);
  assert.equal(sanitizeAndroidPort(67), 80);
  assert.equal(sanitizeAndroidPort("67"), 80);
  assert.equal(sanitizeAndroidPort(80), 80);
  assert.equal(sanitizeAndroidPort(3000), 3000);
  assert.equal(sanitizeAndroidPort(8080), 8080);
});

test("privileged bind failures fall back only below port 1024", () => {
  assert.equal(isPrivilegedBindError({ code: "EACCES" }, 80), true);
  assert.equal(isPrivilegedBindError({ code: "EPERM" }, 80), true);
  assert.equal(isPrivilegedBindError(new Error("listen EACCES: permission denied 0.0.0.0:80"), 80), true);
  assert.equal(isPrivilegedBindError({ code: "EACCES" }, 8080), false);
  assert.equal(isPrivilegedBindError({ code: "EADDRINUSE" }, 80), false);
  assert.equal(isPrivilegedBindError({ code: "EADDRINUSE" }, 3000), false);
});

test("join address prefers the mDNS host and keeps the IP fallback", () => {
  assert.equal(normalizeAdvertisedHost("shoker"), "shoker.local");
  assert.equal(normalizeAdvertisedHost("shoker.local."), "shoker.local");
  assert.equal(normalizeAdvertisedHost("Shoker-1.local"), "shoker-1.local");
  assert.equal(normalizeAdvertisedHost("192.168.43.1"), null);
  assert.equal(normalizeAdvertisedHost("not a host"), null);
  assert.equal(normalizeAdvertisedHost(""), null);

  assert.deepEqual(joinHosts("shoker.local", ["192.168.43.1", "10.0.0.8"]), [
    "shoker.local",
    "192.168.43.1",
    "10.0.0.8",
  ]);
  assert.deepEqual(
    joinHosts("shoker.local", ["192.168.43.1"]).map((host) => formatHttpUrl(host, 80)),
    ["http://shoker.local", "http://192.168.43.1"],
  );
  assert.deepEqual(
    joinHosts("shoker-1.local", ["10.0.0.8"]).map((host) => formatHttpUrl(host, 8080)),
    ["http://shoker-1.local:8080", "http://10.0.0.8:8080"],
  );
  assert.deepEqual(joinHosts(null, []), ["localhost"]);
});

test("server listens on 0.0.0.0, reports the requested port, and accepts Socket.IO", async () => {
  const port = 35123;
  try {
    await startServer({ port });
    const status = getRuntimeStatus();
    assert.equal(status.running, true);
    assert.equal(status.port, port);
    assert.equal(status.bindHost, "0.0.0.0");
    assert.equal(status.advertisedHost, null);

    const updated = await updateAdvertisedHost("shoker.local");
    assert.equal(updated.ok, true);
    assert.equal(updated.advertisedHost, "shoker.local");
    assert.equal(getRuntimeStatus().advertisedHost, "shoker.local");

    const same = await updateAdvertisedHost("shoker.local");
    assert.equal(same.unchanged, true);

    const rejected = await updateAdvertisedHost("192.168.43.1");
    assert.equal(rejected.advertisedHost, null);

    await new Promise((resolve, reject) => {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: ["polling", "websocket"],
        timeout: 4000,
      });
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("Socket.IO did not connect"));
      }, 5000);
      socket.on("connect", () => {
        clearTimeout(timer);
        socket.close();
        resolve();
      });
      socket.on("connect_error", (error) => {
        clearTimeout(timer);
        socket.close();
        reject(error);
      });
    });
  } finally {
    await stopServer();
  }
});
