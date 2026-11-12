"use strict";

/**
 * Android host entry: keeps the Node event loop alive so Express can
 * start/stop without a second node::Start() in the same process.
 * Control plane listens on 127.0.0.1:3010.
 */

const http = require("http");
const { startServer, stopServer, isRunning, getRuntimeStatus } = require("./server");

const CONTROL_PORT = 3010;
let busy = false;

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

async function handleStart(res) {
  if (busy) {
    sendJson(res, 409, { ok: false, message: "Trwa operacja" });
    return;
  }
  busy = true;
  try {
    const result = await startServer();
    sendJson(res, 200, result);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, message: error.message || String(error) });
  } finally {
    busy = false;
  }
}

async function handleStop(res) {
  if (busy) {
    sendJson(res, 409, { ok: false, message: "Trwa operacja" });
    return;
  }
  busy = true;
  try {
    const result = await stopServer();
    sendJson(res, 200, result);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, message: error.message || String(error) });
  } finally {
    busy = false;
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
    await startServer();
  } catch (error) {
    console.error("SHOKER_START_ERROR", error);
  }
  // Keep the event loop alive even when the game server is stopped.
  setInterval(() => {
    if (!isRunning()) {
      // no-op heartbeat for Android lifecycle
    }
  }, 15000);
}

boot().catch((error) => {
  console.error(error);
});
