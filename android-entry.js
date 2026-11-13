"use strict";

/**
 * Android host entry: keeps the Node event loop alive so Express can
 * start/stop without a second node::Start() in the same process.
 * Control plane listens on 127.0.0.1:3010.
 */

// Android listens on 80 unless PORT is set. Port 67 is DHCP — never use it.
// This must run before server.js reads process.env.PORT.
const earlyPort = Number(process.env.PORT);
if (earlyPort === 67) {
  console.error("SHOKER_PORT_REJECTED 67 is reserved for DHCP");
  process.env.PORT = "80";
} else if (!(earlyPort > 0)) {
  process.env.PORT = "80";
}

const http = require("http");
const {
  startServer,
  stopServer,
  isRunning,
  getRuntimeStatus,
  updateAdvertisedHost,
  isPrivilegedBindError,
  FALLBACK_PORT,
} = require("./server");

const CONTROL_PORT = 3010;
let chain = Promise.resolve();

function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function portDeniedWarning(requested, fallback) {
  return (
    `Android nie pozwala tej aplikacji nasłuchiwać na porcie ${requested} ` +
    `(porty poniżej 1024 wymagają uprawnień systemowych). ` +
    `Stół działa na ${fallback}. W adresie musi być :${fallback}.`
  );
}

async function startGameServer() {
  const requested = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 80;
  let port = requested;
  let portWarning = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await startServer({ port, portWarning });
    } catch (error) {
      lastError = error;
      console.error(`SHOKER_START_ATTEMPT_${attempt}`, error);
      if (isPrivilegedBindError(error, port)) {
        if (port === FALLBACK_PORT) throw error;
        portWarning = portDeniedWarning(port, FALLBACK_PORT);
        console.error(`SHOKER_PORT_DENIED ${port} -> ${FALLBACK_PORT}`);
        port = FALLBACK_PORT;
        continue;
      }
      const busy = error && (error.code === "EADDRINUSE" || /EADDRINUSE/.test(String(error)));
      if (!busy || attempt === 6) throw error;
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
  throw lastError || new Error("Start failed");
}

async function handleStart(res) {
  try {
    const result = await enqueue(async () => {
      // Small pause after stop so the port is fully released on Android.
      if (!isRunning()) await new Promise((r) => setTimeout(r, 150));
      return startGameServer();
    });
    sendJson(res, 200, result);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, message: error.message || String(error) });
  }
}

async function handleHost(req, res) {
  const raw = await readBody(req);
  let name = null;
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed.name === "string") name = parsed.name;
  } catch (_error) {
    sendJson(res, 400, { ok: false, message: "Bad JSON" });
    return;
  }
  try {
    const result = await enqueue(() => updateAdvertisedHost(name));
    sendJson(res, result && result.ok === false ? 409 : 200, result || { ok: false });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, message: error.message || String(error) });
  }
}

async function handleStop(res) {
  try {
    const result = await enqueue(async () => stopServer());
    sendJson(res, 200, result);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, message: error.message || String(error) });
  }
}

function startControlServer() {
  const server = http.createServer(async (req, res) => {
    const remote = req.socket && req.socket.remoteAddress;
    const loopback =
      remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    if (!loopback) {
      sendJson(res, 403, { ok: false, message: "Tylko localhost" });
      return;
    }

    const url = req.url || "/";
    if (req.method === "GET" && (url === "/status" || url === "/api/status")) {
      sendJson(res, 200, getRuntimeStatus());
      return;
    }
    if (req.method === "POST" && (url === "/start" || url === "/api/start")) {
      await readBody(req);
      await handleStart(res);
      return;
    }
    if (req.method === "POST" && (url === "/host" || url === "/api/host")) {
      await handleHost(req, res);
      return;
    }
    if (req.method === "POST" && (url === "/stop" || url === "/api/stop" || url === "/api/shutdown")) {
      await readBody(req);
      await handleStop(res);
      return;
    }
    sendJson(res, 404, { ok: false, message: "Not found" });
  });

  server.listen(CONTROL_PORT, "127.0.0.1", () => {
    console.log(`SHOKER_CONTROL ${CONTROL_PORT}`);
  });

  return server;
}

async function boot() {
  startControlServer();
  try {
    await enqueue(async () => startGameServer());
  } catch (error) {
    console.error("SHOKER_START_ERROR", error);
  }
  // Keep the event loop alive even when the game server is stopped.
  setInterval(() => {}, 15000);
}

boot().catch((error) => {
  console.error(error);
});
