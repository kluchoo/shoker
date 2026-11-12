"use strict";

const http = require("http");
const os = require("os");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const DEFAULT_PORT = 3000;
const MAX_PLAYERS = 8;
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : DEFAULT_PORT;
const REVEAL = [
  "Następna kolejka — odkryj pierwsze 3 karty",
  "Następna kolejka — odkryj 4. kartę",
  "Następna kolejka — odkryj 5. kartę",
];
const STREET_NAME = ["Karty rozdane", "Trzy karty na stole", "Czwarta karta", "Piąta karta"];

function labelDrinks(amount) {
  const rounded = Math.round(Number(amount) * 2) / 2;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  let word = "kieliszków";
  if (!Number.isInteger(rounded)) word = "kielicha";
  else if (rounded === 1) word = "kielich";
  else if (rounded % 10 >= 2 && rounded % 10 <= 4 && (rounded % 100 < 10 || rounded % 100 >= 20)) {
    word = "kieliszki";
  }
  return `${text} ${word}`;
}

function isNickChar(ch) {
  if (ch === " " || ch === "_" || ch === "." || ch === "-") return true;
  const cp = ch.codePointAt(0);
  // Avoid \\p{L}/\\p{N} — nodejs-mobile V8 rejects Unicode property escapes.
  if (cp >= 0x30 && cp <= 0x39) return true; // 0-9
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return true; // A-Z a-z
  if (cp >= 0x00c0 && cp <= 0x00d6) return true;
  if (cp >= 0x00d8 && cp <= 0x00f6) return true;
  if (cp >= 0x00f8 && cp <= 0x00ff) return true;
  if (cp >= 0x0100 && cp <= 0x024f) return true; // Latin Extended-A/B (PL diacritics)
  if (cp >= 0x1e00 && cp <= 0x1eff) return true; // Latin Extended Additional
  return false;
}

function cleanNick(nick) {
  const value = String(nick || "").trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 16) return null;
  for (const ch of value) {
    if (!isNickChar(ch)) return null;
  }
  return value;
}

function fail(message) {
  return { ok: false, message };
}

function createGame(random = Math.random, onChange = () => {}) {
  let seq = 1;
  let timer = null;
  let token = 0;
  const players = [];
  const table = {
    hostId: null,
    urls: [],
    phase: "lobby",
    settings: { entry: 1, allIn: 3, chambers: 5, soplica: 5 },
    street: 0,
    dealerId: null,
    turnId: null,
    allInActive: false,
    handAllIn: false,
    handNumber: 0,
    prompt: null,
    winnerId: null,
    log: [],
    roulette: null,
    rouletteQueue: [],
    afterRoulette: null,
  };

  function emit() {
    onChange();
  }

  function pushLog(text) {
    table.log.push(text);
    if (table.log.length > 20) table.log.shift();
  }

  function uid() {
    seq += 1;
    return `r${seq}`;
  }

  function alive() {
    return players.filter((player) => player.inHand && player.status !== "folded");
  }

  function arm(ms) {
    token += 1;
    const mine = token;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (mine !== token) return;
      finishRoulette();
    }, ms);
  }

  function stopTimer() {
    token += 1;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function makeStakeRoll(player) {
    const chambers = table.settings.chambers;
    const allIn = player.status === "allin";
    const loaded = allIn ? chambers : Math.min(player.riskStreet || 0, chambers);
    const hot = Array(chambers).fill(allIn);
    if (!allIn) {
      const order = shuffle([...Array(chambers).keys()]);
      for (let i = 0; i < loaded; i += 1) hot[order[i]] = true;
    }
    const landing = Math.floor(random() * chambers);
    const hit = hot[landing];
    const saved = allIn && random() * 100 < table.settings.soplica;
    let outcome = "safe";
    if (allIn) outcome = saved ? "soplica" : "drink";
    else if (hit) outcome = "drink";
    return {
      id: uid(),
      playerId: player.id,
      nick: player.nick,
      kind: allIn ? "allin" : "stake",
      chambers,
      hot,
      landing,
      loaded,
      drinks: player.stake || 0,
      outcome,
      soplicaPercent: allIn ? table.settings.soplica : 0,
      holdMs: allIn ? 7200 : loaded === 0 ? 4600 : 6200,
    };
  }

  function addStake(player, amount) {
    player.stake = Math.round(((player.stake || 0) + amount) * 2) / 2;
    player.riskStreet = table.street;
  }

  function resultLine(spin) {
    if (spin.outcome === "soplica") return `Tadeusz Soplica ratuje ${spin.nick}`;
    if (spin.outcome === "drink") return `${spin.nick} pije ${labelDrinks(spin.drinks)}`;
    return `${spin.nick} nic nie pije`;
  }

  function playQueueHead() {
    const next = table.rouletteQueue.shift();
    if (!next) return false;
    next.startedAt = Date.now();
    table.roulette = next;
    table.phase = "roulette";
    arm(next.holdMs);
    return true;
  }

  function firstToAct() {
    const count = players.length;
    if (!count) return null;
    let start = players.findIndex((player) => player.id === table.dealerId);
    if (start < 0) start = -1;
    for (let step = 1; step <= count; step += 1) {
      const player = players[(start + step) % count];
      if (player.inHand && player.status === "active" && !player.acted) return player.id;
    }
    return null;
  }

  function nextPending(fromId) {
    const count = players.length;
    if (!count) return null;
    let start = players.findIndex((player) => player.id === fromId);
    if (start < 0) start = -1;
    for (let step = 1; step <= count; step += 1) {
      const player = players[(start + step) % count];
      if (player.inHand && player.status === "active" && !player.acted) return player.id;
    }
    return null;
  }

  function openReveal() {
    if (table.street >= 3) {
      openShowdown();
      return;
    }
    table.phase = "reveal";
    table.turnId = null;
    table.prompt = REVEAL[table.street];
  }

  function openShowdown() {
    const left = alive();
    if (left.length <= 1) {
      endHand(left[0] || null);
      return;
    }
    table.turnId = null;
    table.phase = "showdown";
    table.prompt = "Pokażcie karty";
  }

  function endStreet() {
    const left = alive();
    if (left.length <= 1) {
      endHand(left[0] || null);
      return;
    }
    if (table.street >= 3) {
      openShowdown();
      return;
    }
    openReveal();
  }

  function endHand(winner) {
    table.turnId = null;
    table.allInActive = false;
    table.winnerId = winner ? winner.id : null;
    table.prompt = winner ? `Wygrywa ${winner.nick}` : "Koniec rozdania";
    if (winner) pushLog(`Wygrywa ${winner.nick}`);
    const losers = players.filter(
      (player) => player.inHand && (!winner || player.id !== winner.id) && (player.stake || 0) > 0
    );
    const spins = losers.map((player) => makeStakeRoll(player));
    players.forEach((player) => {
      if (player.inHand) player.stake = 0;
    });
    table.afterRoulette = "handEnd";
    table.rouletteQueue = spins;
    if (!playQueueHead()) {
      table.phase = "handEnd";
      table.afterRoulette = null;
    }
  }

  function continueAfterAction() {
    const left = alive();
    if (left.length <= 1) {
      endHand(left[0] || null);
      return;
    }
    const pending = players.filter((player) => player.inHand && player.status === "active" && !player.acted);
    if (pending.length === 0) {
      endStreet();
      return;
    }
    table.phase = "betting";
    table.prompt = null;
    table.turnId = nextPending(table.turnId) || pending[0].id;
  }

  function finishRoulette() {
    if (!table.roulette) return;
    stopTimer();
    const spin = table.roulette;
    table.roulette = null;
    if (spin.outcome === "drink") {
      const drinker = players.find((player) => player.id === spin.playerId);
      if (drinker) drinker.owed = Math.round(((drinker.owed || 0) + spin.drinks) * 2) / 2;
    }
    pushLog(resultLine(spin));
    if (playQueueHead()) {
      emit();
      return;
    }
    const mode = table.afterRoulette;
    table.afterRoulette = null;
    if (mode === "handEnd") {
      table.phase = "handEnd";
      table.turnId = null;
      table.allInActive = false;
    } else {
      continueAfterAction();
    }
    emit();
  }

  function startHand() {
    table.handNumber += 1;
    const order = players.map((player) => player.id);
    const index = order.indexOf(table.dealerId);
    table.dealerId = order[(index + 1) % order.length];
    table.street = 0;
    table.allInActive = false;
    table.handAllIn = false;
    table.winnerId = null;
    table.prompt = null;
    table.roulette = null;
    table.rouletteQueue = [];
    table.afterRoulette = null;
    players.forEach((player) => {
      player.inHand = true;
      player.status = "active";
      player.acted = false;
      player.stake = 0;
      player.riskStreet = 0;
    });
    table.phase = "betting";
    table.turnId = firstToAct();
    pushLog(`Rozdanie ${table.handNumber}. Rozdajcie karty.`);
  }

  function backToLobby(message) {
    stopTimer();
    table.phase = "lobby";
    table.prompt = message || null;
    table.turnId = null;
    table.roulette = null;
    table.rouletteQueue = [];
    table.afterRoulette = null;
    table.allInActive = false;
    table.handAllIn = false;
    table.winnerId = null;
    players.forEach((player) => {
      player.inHand = false;
      player.status = "waiting";
      player.acted = false;
    });
  }

  function stabilize() {
    if (table.phase === "lobby" || table.phase === "roulette" || table.phase === "handEnd") return;
    const left = alive();
    if (left.length <= 1) {
      endHand(left[0] || null);
      return;
    }
    if (table.phase === "betting") {
      const pending = players.filter((player) => player.inHand && player.status === "active" && !player.acted);
      if (pending.length === 0) endStreet();
      else if (!pending.some((player) => player.id === table.turnId)) {
        table.turnId = nextPending(table.turnId) || pending[0].id;
      }
    }
  }

  function addPlayer(clientId, nick) {
    const clean = cleanNick(nick);
    if (!clean) return fail("Nick musi mieć 2–16 znaków");
    const existing = players.find((player) => player.id === clientId);
    const taken = players.some(
      (player) => player.id !== clientId && player.nick.toLowerCase() === clean.toLowerCase()
    );
    if (taken) return fail("Nick zajęty");
    if (existing) {
      existing.nick = clean;
      existing.connected = true;
      return { ok: true };
    }
    if (players.length >= MAX_PLAYERS) return fail("Stół jest pełny");
    players.push({
      id: clientId,
      nick: clean,
      connected: true,
      inHand: false,
      status: "waiting",
      acted: false,
      owed: 0,
      stake: 0,
      riskStreet: 0,
    });
    pushLog(`${clean} siada do stołu`);
    return { ok: true };
  }

  function claimHost(clientId, options = {}) {
    if (table.hostId && table.hostId !== clientId) return fail("Stół ma już hosta");
    if (options.sit) {
      const seated = addPlayer(clientId, options.nick);
      if (!seated.ok) return seated;
    }
    table.hostId = clientId;
    emit();
    return { ok: true };
  }

  function join(clientId, nick) {
    const seated = addPlayer(clientId, nick);
    if (!seated.ok) return seated;
    emit();
    return { ok: true };
  }

  function setConnected(clientId, connected) {
    const player = players.find((item) => item.id === clientId);
    if (player) player.connected = connected;
    emit();
    return { ok: true };
  }

  function half(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const stepped = Math.round(number * 2) / 2;
    if (Math.abs(stepped - number) > 1e-6) return null;
    return stepped;
  }

  function updateSettings(clientId, input = {}) {
    if (clientId !== table.hostId) return fail("Tylko host");
    if (table.phase !== "lobby" && table.phase !== "handEnd") return fail("Stawkę zmienisz między rozdaniami");
    const entry = half(input.entry);
    const allIn = half(input.allIn);
    const chambers = Math.round(Number(input.chambers));
    const soplica = Math.round(Number(input.soplica));
    if (entry == null || entry < 0.5 || entry > 20) return fail("Wejście od 0,5 do 20 kieliszków");
    if (allIn == null || allIn < 0.5 || allIn > 20) return fail("All-in od 0,5 do 20 kieliszków");
    if (allIn + 1e-6 < entry) return fail("All-in nie może być mniejszy niż wejście");
    if (!Number.isInteger(chambers) || chambers < 2 || chambers > 12) return fail("Komory od 2 do 12");
    if (!Number.isInteger(soplica) || soplica < 0 || soplica > 100) return fail("Soplica od 0 do 100%");
    table.settings = { entry, allIn, chambers, soplica };
    emit();
    return { ok: true };
  }

  function reorder(clientId, playerId, direction) {
    if (clientId !== table.hostId) return fail("Tylko host");
    if (table.phase === "roulette") return fail("Poczekaj, aż ruletka się skończy");
    const index = players.findIndex((player) => player.id === playerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= players.length) return fail("Nie da się przesunąć");
    const [player] = players.splice(index, 1);
    players.splice(target, 0, player);
    emit();
    return { ok: true };
  }

  function kick(clientId, playerId) {
    if (clientId !== table.hostId) return fail("Tylko host");
    const index = players.findIndex((player) => player.id === playerId);
    if (index < 0) return fail("Nie ma takiego gracza");
    const [player] = players.splice(index, 1);
    pushLog(`${player.nick} wypada ze stołu`);
    table.rouletteQueue = table.rouletteQueue.filter((spin) => spin.playerId !== playerId);
    const spinningThem = table.roulette && table.roulette.playerId === playerId;
    if (spinningThem) {
      stopTimer();
      table.roulette = null;
      if (!playQueueHead()) {
        const mode = table.afterRoulette;
        table.afterRoulette = null;
        if (mode === "handEnd") {
          table.phase = "handEnd";
          table.turnId = null;
        } else {
          continueAfterAction();
        }
      }
    } else {
      stabilize();
    }
    if (players.length < 2 && table.phase !== "lobby") backToLobby("Za mało graczy.");
    emit();
    return { ok: true };
  }

  function start(clientId) {
    if (clientId !== table.hostId) return fail("Tylko host");
    if (table.phase !== "lobby") return fail("Gra już trwa");
    if (players.length < 2) return fail("Potrzeba co najmniej dwóch graczy");
    startHand();
    emit();
    return { ok: true };
  }

  function act(clientId, type) {
    if (table.phase !== "betting") return fail("Teraz nie ta chwila");
    const player = players.find((item) => item.id === clientId);
    if (!player || table.turnId !== clientId || player.status !== "active") return fail("To nie twoja kolej");
    if (type === "enter") {
      const amount = table.allInActive ? table.settings.allIn : table.settings.entry;
      if (table.allInActive) player.status = "allin";
      addStake(player, amount);
      player.acted = true;
      pushLog(`${player.nick} wchodzi, stawka ${labelDrinks(player.stake)}`);
      continueAfterAction();
      emit();
      return { ok: true };
    }
    if (type === "allin") {
      if (table.allInActive) return fail("All-in już leży");
      addStake(player, table.settings.allIn);
      player.status = "allin";
      player.acted = true;
      table.allInActive = true;
      table.handAllIn = true;
      players.forEach((item) => {
        if (item.inHand && item.status === "active") item.acted = false;
      });
      table.turnId = player.id;
      pushLog(`${player.nick} all-in, stawka ${labelDrinks(player.stake)}`);
      continueAfterAction();
      emit();
      return { ok: true };
    }
    if (type === "fold") {
      player.riskStreet = table.street;
      player.status = "folded";
      player.acted = true;
      table.turnId = player.id;
      pushLog(`${player.nick} pasuje`);
      continueAfterAction();
      emit();
      return { ok: true };
    }
    return fail("Nieznana akcja");
  }

  function reveal(clientId) {
    if (clientId !== table.hostId) return fail("Tylko host");
    if (table.phase !== "reveal") return fail("Nie teraz");
    table.street += 1;
    const bettors = players.filter((player) => player.inHand && player.status === "active");
    if (bettors.length === 0) {
      if (table.street >= 3) openShowdown();
      else openReveal();
      emit();
      return { ok: true };
    }
    bettors.forEach((player) => {
      player.acted = false;
    });
    table.phase = "betting";
    table.prompt = null;
    table.turnId = firstToAct();
    emit();
    return { ok: true };
  }

  function pickWinner(clientId, playerId) {
    if (clientId !== table.hostId) return fail("Tylko host");
    if (table.phase !== "showdown") return fail("Nie teraz");
    const left = alive();
    const winner = left.find((player) => player.id === playerId);
    if (!winner) return fail("Wybierz kogoś, kto został w rozdaniu");
    endHand(winner);
    emit();
    return { ok: true };
  }

  function nextHand(clientId) {
    if (clientId !== table.hostId) return fail("Tylko host");
    if (table.phase !== "handEnd") return fail("Rozdanie jeszcze trwa");
    if (players.length < 2) {
      backToLobby("Za mało graczy.");
      emit();
      return { ok: true };
    }
    startHand();
    emit();
    return { ok: true };
  }

  function skip(clientId) {
    if (clientId !== table.hostId) return fail("Tylko host");
    if (table.phase !== "betting" || !table.turnId) return fail("Nie ma kogo pominąć");
    return act(table.turnId, "fold");
  }

  function setUrls(urls) {
    table.urls = urls;
  }

  function view(clientId) {
    const settings = table.settings;
    const loaded = Math.min(table.street, settings.chambers);
    const left = alive().map((player) => ({ id: player.id, nick: player.nick }));
    return {
      urls: table.urls,
      phase: table.phase,
      settings,
      street: table.street,
      streetName: STREET_NAME[table.street] || STREET_NAME[0],
      handNumber: table.handNumber,
      allInActive: table.allInActive,
      handAllIn: table.handAllIn,
      prompt: table.prompt,
      winnerId: table.winnerId,
      log: table.log.slice(),
      roulette: table.roulette,
      risk: {
        num: loaded,
        den: settings.chambers,
        safeNum: settings.chambers - loaded,
        drinks: table.allInActive ? settings.allIn : settings.entry,
        soplica: settings.soplica,
        entry: settings.entry,
        allIn: settings.allIn,
        nextNum: table.phase === "reveal" ? Math.min(table.street + 1, settings.chambers) : null,
      },
      players: players.map((player) => ({
        id: player.id,
        nick: player.nick,
        connected: player.connected,
        status: player.status,
        inHand: player.inHand,
        dealer: player.id === table.dealerId,
        turn: table.phase === "betting" && player.id === table.turnId,
        winner: table.winnerId === player.id && (table.phase === "handEnd" || table.phase === "roulette"),
        owed: player.owed || 0,
        stake: player.stake || 0,
      })),
      alive: left,
      decision:
        table.phase === "betting" && table.turnId
          ? {
              playerId: table.turnId,
              canAllIn: !table.allInActive,
              allInLive: table.allInActive,
              addAmount: table.allInActive ? settings.allIn : settings.entry,
              safeNum: settings.chambers - loaded,
              safeDen: settings.chambers,
              soplica: settings.soplica,
            }
          : null,
      host: {
        start: table.phase === "lobby" && players.length >= 2,
        reveal: table.phase === "reveal",
        pick: table.phase === "showdown",
        next: table.phase === "handEnd",
        skip: table.phase === "betting" && !!table.turnId,
        settings: table.phase === "lobby" || table.phase === "handEnd",
        reorder: table.phase !== "roulette",
      },
      you: {
        isHost: clientId === table.hostId,
        seated: players.some((player) => player.id === clientId),
        nick: players.find((player) => player.id === clientId)?.nick || null,
      },
    };
  }

  function getStatus() {
    return {
      phase: table.phase,
      playerCount: players.length,
      connectedCount: players.filter((player) => player.connected).length,
    };
  }

  function dispose() {
    stopTimer();
    table.roulette = null;
    table.rouletteQueue = [];
    table.afterRoulette = null;
  }

  return {
    claimHost,
    join,
    setConnected,
    updateSettings,
    reorder,
    kick,
    start,
    act,
    reveal,
    pickWinner,
    nextHand,
    skip,
    setUrls,
    view,
    getStatus,
    dispose,
    finishRouletteNow: finishRoulette,
  };
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

async function buildUrls(port = PORT) {
  const ips = lanAddresses();
  const hosts = ips.length ? ips : ["localhost"];
  const urls = [];
  for (const ip of hosts) {
    const url = `http://${ip}:${port}`;
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

function getRuntimeStatus() {
  if (!runtime || !runtime.running || !runtime.game) {
    return {
      running: false,
      phase: null,
      playerCount: 0,
      connectedCount: 0,
      port: runtime ? runtime.port : resolvePort(),
    };
  }
  const gameStatus = runtime.game.getStatus();
  return {
    running: true,
    phase: gameStatus.phase,
    playerCount: gameStatus.playerCount,
    connectedCount: gameStatus.connectedCount,
    port: runtime.port,
  };
}

async function stopServer() {
  const current = runtime;
  if (!current) return { ok: true };
  current.running = false;
  if (current.game) {
    current.game.dispose();
    current.game = null;
  }
  if (current.io) {
    await new Promise((resolve) => {
      current.io.close(() => resolve());
    });
    current.io = null;
  }
  if (current.server) {
    await new Promise((resolve) => {
      current.server.close(() => resolve());
    });
    current.server = null;
  }
  if (current.sockets) current.sockets.clear();
  runtime = null;
  console.log("SHOKER_STOPPED");
  return { ok: true };
}

async function startServer(options = {}) {
  if (isRunning()) return { ok: true, already: true, port: runtime.port };

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
    if (result && result.ok === false) socket.emit("toast", { message: result.message });
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
      reply(socket, game.pickWinner(clientId, playerId));
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
    server,
    io,
    game,
    sockets,
  };

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      runtime = null;
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      runtime.running = true;
      console.log(`Shoker działa na porcie ${port}`);
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
  REVEAL,
  startServer,
  stopServer,
  isRunning,
  getRuntimeStatus,
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
