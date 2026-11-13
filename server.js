"use strict";

const http = require("http");
const os = require("os");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const { createGame, labelDrinks, REVEAL } = require("./server/game");

const DEFAULT_PORT = 3000;
const ANDROID_PORT = 80;
const FALLBACK_PORT = 8080;
const DHCP_PORT = 67;
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : DEFAULT_PORT;

function formatHttpUrl(host, port) {
  if (!host) return "";
  const numeric = Number(port);
  if (numeric === 80) return `http://${host}`;
  return `http://${host}:${numeric}`;
}

function sanitizeAndroidPort(raw) {
  const port = Number(raw);
  if (port === DHCP_PORT) return ANDROID_PORT;
  if (Number.isFinite(port) && port > 0 && port < 65536) return port;
  return ANDROID_PORT;
}

function isPrivilegedBindError(error, port) {
  const numeric = Number(port);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric >= 1024) return false;
  const code = error && error.code;
  if (code === "EACCES" || code === "EPERM") return true;
  const text = String((error && error.message) || error || "");
  return /\bEACCES\b/.test(text) || /\bEPERM\b/.test(text);
}

function normalizeAdvertisedHost(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().replace(/\.+$/g, "");
  if (!trimmed) return null;
  const withLocal = /\.local$/i.test(trimmed) ? trimmed : `${trimmed}.local`;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/i.test(withLocal)) return null;
  return withLocal.toLowerCase();
}

function joinHosts(advertisedHost, ips) {
  const hosts = [];
  const push = (host) => {
    if (!host || hosts.includes(host)) return;
    hosts.push(host);
  };
  push(advertisedHost);
  const list = ips && ips.length ? ips : ["localhost"];
  for (const ip of list) push(ip);
  return hosts;
}

function lanAddresses() {
  const found = [];
  const nets = os.networkInterfaces();
  for (const [name, list] of Object.entries(nets)) {
    if (/vEthernet|WSL|Bluetooth|Loopback|Pseudo/i.test(name)) continue;
    for (const net of list || []) {
      const v4 = net.family === "IPv4" || net.family === 4;
      if (!v4 || net.internal) continue;
      if (net.address.startsWith("169.254.")) continue;
      found.push(net.address);
    }
  }
  return [...new Set(found)].sort((a, b) => rank(a) - rank(b));
}

function rank(ip) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
  return 3;
}

async function buildUrls(port = PORT, advertisedHost = null) {
  const hosts = joinHosts(normalizeAdvertisedHost(advertisedHost), lanAddresses());
  const urls = [];
  for (const ip of hosts) {
    const url = formatHttpUrl(ip, port);
    let qr = "";
    try {
      qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 280,
        color: { dark: "#24140f", light: "#f6edd9" },
      });
    } catch (error) {
      qr = "";
    }
    urls.push({ url, qr });
  }
  return urls;
}

function validId(id) {
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
}

function resolvePublicDir(options = {}) {
  return process.env.SHOKER_PUBLIC || options.publicDir || path.join(__dirname, "public");
}

function resolveVendorDir(options = {}) {
  return (
    process.env.SHOKER_VENDOR ||
    options.vendorDir ||
    path.join(__dirname, "node_modules", "gsap", "dist")
  );
}

function resolvePort(options = {}) {
  const raw = options.port != null ? Number(options.port) : PORT;
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PORT;
}

function isLoopback(req) {
  const raw = req.socket && req.socket.remoteAddress;
  return raw === "127.0.0.1" || raw === "::1" || raw === "::ffff:127.0.0.1";
}

let runtime = null;

function isRunning() {
  return !!(runtime && runtime.running);
}

function describeBind(server) {
  try {
    const addr = server && typeof server.address === "function" ? server.address() : null;
    if (addr && typeof addr === "object") return addr.address || null;
  } catch (_error) {
    /* ignore */
  }
  return null;
}

function getRuntimeStatus() {
  if (!runtime || !runtime.running || !runtime.game) {
    return {
      running: false,
      phase: null,
      playerCount: 0,
      connectedCount: 0,
      port: runtime ? runtime.port : resolvePort(),
      portWarning: runtime && runtime.portWarning ? runtime.portWarning : null,
      advertisedHost: null,
      bindHost: null,
    };
  }
  const gameStatus = runtime.game.getStatus();
  return {
    running: true,
    phase: gameStatus.phase,
    playerCount: gameStatus.playerCount,
    connectedCount: gameStatus.connectedCount,
    port: runtime.port,
    portWarning: runtime.portWarning || null,
    advertisedHost: runtime.advertisedHost || null,
    bindHost: describeBind(runtime.server),
  };
}

function closeWithTimeout(closeFn, ms = 2000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, ms);
    try {
      closeFn(() => {
        clearTimeout(timer);
        finish();
      });
    } catch (_error) {
      clearTimeout(timer);
      finish();
    }
  });
}

async function stopServer() {
  const current = runtime;
  if (!current) return { ok: true };
  runtime = null;
  current.running = false;
  if (current.game) {
    try {
      current.game.dispose();
    } catch (_error) {
      /* ignore */
    }
    current.game = null;
  }
  if (current.sockets) {
    for (const socket of current.sockets.values()) {
      try {
        socket.disconnect(true);
      } catch (_error) {
        /* ignore */
      }
    }
    current.sockets.clear();
  }
  if (current.io) {
    try {
      current.io.disconnectSockets(true);
    } catch (_error) {
      /* ignore */
    }
    await closeWithTimeout((cb) => current.io.close(cb));
    current.io = null;
  }
  if (current.server) {
    try {
      if (typeof current.server.closeAllConnections === "function") {
        current.server.closeAllConnections();
      }
    } catch (_error) {
      /* ignore */
    }
    await closeWithTimeout((cb) => current.server.close(cb));
    current.server = null;
  }
  console.log("SHOKER_STOPPED");
  return { ok: true };
}

async function updateAdvertisedHost(name) {
  if (!runtime || !runtime.running || !runtime.game) return { ok: false };
  const host = normalizeAdvertisedHost(name);
  const urls = await buildUrls(runtime.port, host);
  const urlKey = urls.map((item) => item.url).join("|");
  if (urlKey === runtime.urlKey) {
    return { ok: true, advertisedHost: runtime.advertisedHost || null, unchanged: true };
  }
  runtime.advertisedHost = host;
  runtime.urlKey = urlKey;
  runtime.game.setUrls(urls);
  if (typeof runtime.broadcast === "function") runtime.broadcast();
  return { ok: true, advertisedHost: host, port: runtime.port };
}

async function startServer(options = {}) {
  if (isRunning()) {
    return {
      ok: true,
      already: true,
      port: runtime.port,
      portWarning: runtime.portWarning || null,
    };
  }

  const port = resolvePort(options);
  const publicDir = resolvePublicDir(options);
  const vendorDir = resolveVendorDir(options);
  const urls = await buildUrls(port);
  const sockets = new Map();

  let game;
  function broadcast() {
    if (!game) return;
    for (const [id, socket] of sockets) socket.emit("state", game.view(id));
  }
  game = createGame(Math.random, broadcast);
  game.setUrls(urls);

  const app = express();

  app.get("/api/status", (_req, res) => {
    res.json(getRuntimeStatus());
  });

  app.post("/api/shutdown", async (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ ok: false, message: "Tylko localhost" });
      return;
    }
    res.json({ ok: true });
    setImmediate(() => {
      stopServer().catch((error) => console.error(error));
    });
  });

  app.use(express.static(publicDir, { maxAge: 0 }));
  app.use("/vendor", express.static(vendorDir, { maxAge: "1d" }));

  const server = http.createServer(app);
  const io = new Server(server);

  function bind(socket, clientId) {
    const previous = sockets.get(clientId);
    if (previous && previous !== socket) {
      previous.data.replaced = true;
      previous.disconnect(true);
    }
    socket.data.clientId = clientId;
    sockets.set(clientId, socket);
  }

  function reply(socket, result) {
    if (result && result.ok === false) {
      socket.emit("toast", {
        code: result.code || null,
        message: result.message,
        params: result.params || null,
      });
    }
  }

  io.on("connection", (socket) => {
    socket.on("hello", ({ clientId } = {}) => {
      if (!validId(clientId)) return;
      bind(socket, clientId);
      game.setConnected(clientId, true);
    });

    socket.on("host", (payload = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.claimHost(clientId, payload));
    });

    socket.on("join", ({ nick } = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.join(clientId, nick));
    });

    socket.on("settings", (payload = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.updateSettings(clientId, payload));
    });

    socket.on("reorder", ({ playerId, direction } = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.reorder(clientId, playerId, Number(direction)));
    });

    socket.on("kick", ({ playerId } = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.kick(clientId, playerId));
    });

    socket.on("start", () => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.start(clientId));
    });

    socket.on("act", ({ type } = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.act(clientId, type));
    });

    socket.on("reveal", () => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.reveal(clientId));
    });

    socket.on("winner", ({ playerId } = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.castVote(clientId, playerId));
    });

    socket.on("ready", (payload = {}) => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.setReady(clientId, payload.ready !== false));
    });

    socket.on("next", () => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.nextHand(clientId));
    });

    socket.on("skip", () => {
      const clientId = socket.data.clientId;
      if (!clientId) return;
      reply(socket, game.skip(clientId));
    });

    socket.on("disconnect", () => {
      if (socket.data.replaced) return;
      const clientId = socket.data.clientId;
      if (!clientId) return;
      if (sockets.get(clientId) === socket) {
        sockets.delete(clientId);
        game.setConnected(clientId, false);
      }
    });
  });

  runtime = {
    running: false,
    port,
    portWarning: typeof options.portWarning === "string" && options.portWarning ? options.portWarning : null,
    advertisedHost: null,
    urlKey: urls.map((item) => item.url).join("|"),
    server,
    io,
    game,
    sockets,
    broadcast,
  };

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      try {
        io.close();
      } catch (_error) {
        /* ignore */
      }
      try {
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
        server.close();
      } catch (_error) {
        /* ignore */
      }
      try {
        game.dispose();
      } catch (_error) {
        /* ignore */
      }
      runtime = null;
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      runtime.running = true;
      console.log(`Shoker działa na porcie ${port}`);
      if (runtime.portWarning) console.error("SHOKER_PORT_WARNING", runtime.portWarning);
      console.log("SHOKER_READY");
      urls.forEach((item) => console.log(item.url));
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "0.0.0.0");
  });

  return { ok: true, port };
}

module.exports = {
  createGame,
  labelDrinks,
  PORT,
  DEFAULT_PORT,
  ANDROID_PORT,
  FALLBACK_PORT,
  DHCP_PORT,
  REVEAL,
  formatHttpUrl,
  sanitizeAndroidPort,
  isPrivilegedBindError,
  normalizeAdvertisedHost,
  joinHosts,
  resolvePort,
  startServer,
  stopServer,
  updateAdvertisedHost,
  isRunning,
  getRuntimeStatus,
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
