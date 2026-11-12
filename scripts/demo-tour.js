"use strict";

/**
 * Walks a full Shoker hand with socket bots and pauses on each UI beat
 * so you can preview the table in a browser.
 *
 * Usage:
 *   1. npm start
 *   2. Open http://127.0.0.1:3000  (this tab = "Ania" / viewer)
 *   3. node scripts/demo-tour.js
 *
 * Env:
 *   DEMO_URL=http://127.0.0.1:3000
 *   DEMO_PAUSE_MS=2200          delay after each step
 *   DEMO_VIEWER_NICK=Ania       nick that YOU control in the browser
 *   DEMO_VIEWER_TIMEOUT_MS=45000
 */

const fs = require("fs");
const path = require("path");
const { io } = require("socket.io-client");
const { randomUUID } = require("crypto");

const URL = process.env.DEMO_URL || "http://127.0.0.1:3000";
const PAUSE = Math.max(400, Number(process.env.DEMO_PAUSE_MS) || 2200);
const VIEWER_NICK = process.env.DEMO_VIEWER_NICK || "Ania";
const VIEWER_TIMEOUT = Math.max(5000, Number(process.env.DEMO_VIEWER_TIMEOUT_MS) || 45000);
const AUTO_VIEWER = process.env.DEMO_AUTO_VIEWER === "1";
const OUT = path.join(__dirname, "..", ".demo-tour-status.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function uuid() {
  return randomUUID();
}

function writeStatus(payload) {
  fs.writeFileSync(
    OUT,
    JSON.stringify({ at: new Date().toISOString(), ...payload }, null, 2),
    "utf8"
  );
}

function logStep(title, detail = {}) {
  const line = `\n═══ ${title} ═══`;
  console.log(line);
  if (detail && Object.keys(detail).length) console.log(detail);
  writeStatus({ step: title, ...detail });
}

async function pause(title, detail) {
  logStep(title, detail);
  await sleep(PAUSE);
}

function connect(clientId) {
  const socket = io(URL, {
    transports: ["websocket"],
    autoConnect: false,
    forceNew: true,
  });
  const state = { value: null };
  socket.on("state", (next) => {
    state.value = next;
  });
  socket.on("toast", ({ message }) => {
    console.log(`  toast[${clientId.slice(0, 8)}]: ${message}`);
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`connect timeout ${clientId}`)), 8000);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.emit("hello", { clientId });
      resolve({ socket, clientId, state });
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  });
}

function waitFor(getState, pred, label, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const value = getState();
      if (value && pred(value)) return resolve(value);
      if (Date.now() - start > timeout) {
        return reject(new Error(`timeout waiting for ${label}`));
      }
      setTimeout(tick, 80);
    };
    tick();
  });
}

async function main() {
  console.log(`Demo tour → ${URL}`);
  console.log(`Viewer nick in browser must be: ${VIEWER_NICK}`);
  console.log(`Status file: ${OUT}`);

  const hostId = uuid();
  const botId = uuid();

  writeStatus({
    step: "boot",
    viewerNick: VIEWER_NICK,
    hint: `W przeglądarce usiądź jako ${VIEWER_NICK}. Host i Bartek dołączą automatycznie.`,
  });

  const host = await connect(hostId);
  const bot = await connect(botId);

  host.socket.emit("host", { sit: true, nick: "Hostek" });
  await waitFor(() => host.state.value, (s) => s.you.isHost && s.you.seated, "host seated");

  bot.socket.emit("join", { nick: "Bartek" });
  await waitFor(() => host.state.value, (s) => s.players.some((p) => p.nick === "Bartek"), "bartek seated");

  await pause("lobby-waiting-viewer", {
    players: host.state.value.players.map((p) => p.nick),
    message: `Usiądź w przeglądarce jako ${VIEWER_NICK}, potem tour ruszy dalej.`,
  });

  const withViewer = await waitFor(
    () => host.state.value,
    (s) => s.players.some((p) => p.nick === VIEWER_NICK),
    `viewer ${VIEWER_NICK}`,
    VIEWER_TIMEOUT
  );

  await pause("lobby-ready", {
    players: withViewer.players.map((p) => p.nick),
  });

  host.socket.emit("start");
  await waitFor(() => host.state.value, (s) => s.phase === "betting", "hand started");
  await pause("hand-start-street-0", snapshot(host.state.value));

  await playUntilShowdown(host, bot);
  await pause("showdown", snapshot(host.state.value));

  const alive = (host.state.value.alive || []).filter((p) => p.nick !== "Hostek");
  const winner = alive[0] || (host.state.value.alive || [])[0];
  if (winner) {
    host.socket.emit("winner", { playerId: winner.id });
    bot.socket.emit("winner", { playerId: winner.id });
  }

  await waitFor(
    () => host.state.value,
    (s) => s.phase === "roulette" || s.phase === "handEnd",
    "after winner vote"
  );

  if (host.state.value.phase === "roulette") {
    await pause("roulette", snapshot(host.state.value));
    await waitFor(() => host.state.value, (s) => s.phase === "handEnd", "hand end after roulette", 20000);
  }

  await pause("hand-end", snapshot(host.state.value));
  host.socket.emit("ready", { ready: true });
  bot.socket.emit("ready", { ready: true });
  // Viewer (Ania) may still be needed for unanimous ready — host force-start as fallback.
  await sleep(400);
  if (host.state.value && host.state.value.phase === "handEnd") {
    host.socket.emit("next");
  }
  await waitFor(
    () => host.state.value,
    (s) => s.phase === "betting" || s.phase === "lobby",
    "next hand after ready",
    8000
  ).catch(() => null);
  logStep("done", { message: "Tour finished. Odśwież / Install & Launch żeby zobaczyć to samo na Androidzie." });

  host.socket.close();
  bot.socket.close();
  process.exit(0);
}

function snapshot(state) {
  if (!state) return {};
  const turn = state.players.find((p) => p.turn);
  return {
    phase: state.phase,
    street: state.street,
    streetName: state.streetName,
    turn: turn ? turn.nick : null,
    allInActive: state.allInActive,
    players: state.players.map((p) => ({
      nick: p.nick,
      status: p.status,
      stake: p.stake,
      turn: p.turn,
    })),
  };
}

async function playUntilShowdown(host, bot) {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const state = host.state.value;
    if (!state) {
      await sleep(100);
      continue;
    }
    if (state.phase === "showdown" || state.phase === "roulette" || state.phase === "handEnd") {
      return;
    }

    if (state.phase === "reveal") {
      await pause(`reveal-prompt-street-${state.street}`, snapshot(state));
      host.socket.emit("reveal");
      await waitFor(
        () => host.state.value,
        (s) => s.phase !== "reveal" || s.street !== state.street,
        "after reveal"
      );
      await pause(`after-reveal-street-${host.state.value.street}`, snapshot(host.state.value));
      continue;
    }

    if (state.phase !== "betting" || !state.decision) {
      await sleep(120);
      continue;
    }

    const actorId = state.decision.playerId;
    const actor = state.players.find((p) => p.id === actorId);
    const nick = actor ? actor.nick : "?";

    if (nick === VIEWER_NICK) {
      await pause(`viewer-turn-${nick}`, {
        ...snapshot(state),
        message: AUTO_VIEWER
          ? `Auto Wejdź dla ${VIEWER_NICK}`
          : `Twoja kolej w przeglądarce (${VIEWER_NICK}) — kliknij Wejdź / Pas / All-in.`,
      });
      const beforeStake = actor.stake || 0;
      const beforeStatus = actor.status;
      if (AUTO_VIEWER) {
        const viewerSock =
          actorId === host.clientId ? host.socket : actorId === bot.clientId ? bot.socket : null;
        if (viewerSock) viewerSock.emit("act", { type: "enter" });
      }
      await waitFor(
        () => host.state.value,
        (s) => {
          const me = s.players.find((p) => p.id === actorId);
          if (!me) return true;
          if (me.status !== beforeStatus) return true;
          if ((me.stake || 0) !== beforeStake) return true;
          if (s.phase !== "betting") return true;
          if (!s.decision || s.decision.playerId !== actorId) return true;
          return false;
        },
        "viewer acted",
        VIEWER_TIMEOUT
      );
      await pause(`after-viewer-${nick}`, snapshot(host.state.value));
      continue;
    }

    const socket = actorId === host.clientId ? host.socket : actorId === bot.clientId ? bot.socket : null;
    if (!socket) {
      await pause(`unknown-actor-${nick}`, snapshot(state));
      await sleep(500);
      continue;
    }

    let type = "enter";
    // Scripted spice: Bartek all-in once on street 1 if possible; Hostek folds once late.
    if (nick === "Bartek" && state.street === 1 && state.decision.canAllIn && !state.allInActive) {
      type = "allin";
    } else if (nick === "Hostek" && state.street >= 2 && (actor.stake || 0) > 0 && Math.random() < 0.35) {
      type = "fold";
    }

    await pause(`wait-${nick}`, { ...snapshot(state), upcoming: type });
    socket.emit("act", { type });
    await waitFor(
      () => host.state.value,
      (s) => {
        if (s.phase !== "betting") return true;
        if (!s.decision) return true;
        return s.decision.playerId !== actorId;
      },
      `${nick} ${type}`
    );
    await pause(`acted-${nick}-${type}`, snapshot(host.state.value));
  }
  throw new Error("playUntilShowdown guard exceeded");
}

main().catch((error) => {
  console.error("\nDemo tour failed:", error.message);
  writeStatus({ step: "error", message: error.message });
  process.exit(1);
});
