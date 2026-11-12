"use strict";

const MAX_PLAYERS = 8;
const REVEAL = [
  "Czas odkryć — pierwsze 3",
  "Kolejna karta wlatuje",
  "Ostatnia karta, bez stresu",
];
const STREET_NAME = ["Przed flopem", "Flop na stole", "Turn", "River · pełny board"];
const VOTE_NEED = 0.6;

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

const ERRORS = {
  nickInvalid: "Nick musi mieć 2–16 znaków",
  nickTaken: "Nick zajęty",
  tableFull: "Stół jest pełny",
  hostTaken: "Stół ma już hosta",
  hostOnly: "Tylko host",
  settingsLocked: "Stawkę zmienisz między rozdaniami",
  entryRange: "Wejście od 0,5 do 20 kieliszków",
  finalEntryRange: "Następne wejście od 0,5 do 20 kieliszków",
  allInRange: "All-in od 0,5 do 60 kieliszków",
  chambersRange: "Komory od 5 do 12",
  soplicaRange: "Soplica od 0 do 100%",
  rouletteBusy: "Poczekaj, aż ruletka się skończy",
  reorderFail: "Nie da się przesunąć",
  playerMissing: "Nie ma takiego gracza",
  gameAlreadyStarted: "Gra już trwa",
  needTwoPlayers: "Potrzeba co najmniej dwóch graczy",
  wrongMoment: "Teraz nie ta chwila",
  notYourTurn: "To nie twoja kolej",
  allInAlready: "All-in już leży",
  unknownAct: "Nieznana akcja",
  notNow: "Nie teraz",
  seatFirst: "Najpierw usiądź",
  pickAlive: "Wybierz kogoś, kto został w rozdaniu",
  handStillGoing: "Rozdanie jeszcze trwa",
  nobodyToSkip: "Nie ma kogo pominąć",
  notEnoughPlayers: "Za mało graczy.",
};

function fail(code, params) {
  return { ok: false, code, message: ERRORS[code] || code, params: params || null };
}

function createGame(random = Math.random, onChange = () => {}) {
  let seq = 1;
  let timer = null;
  let token = 0;
  let revealTimer = null;
  const players = [];
  const table = {
    hostId: null,
    urls: [],
    phase: "lobby",
    settings: { entry: 1, finalEntry: 1, allIn: 3, chambers: 5, soplica: 5 },
    street: 0,
    dealerId: null,
    turnId: null,
    allInActive: false,
    handAllIn: false,
    handNumber: 0,
    prompt: null,
    promptKey: null,
    promptParams: null,
    winnerId: null,
    votes: {},
    summary: null,
    log: [],
    roulette: null,
    rouletteQueue: [],
    afterRoulette: null,
  };

  function streetEntryAmount() {
    // Street 3 = all five cards out → osobne „następne wejście”.
    if (table.street >= 3) return table.settings.finalEntry;
    return table.settings.entry;
  }

  function voteThreshold(voterCount) {
    return Math.max(1, Math.ceil(voterCount * VOTE_NEED));
  }

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

  function stopRevealTimer() {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;
  }

  function armRevealAuto(ms) {
    stopRevealTimer();
    const streetAt = table.street;
    revealTimer = setTimeout(() => {
      revealTimer = null;
      if (table.phase !== "reveal" || table.street !== streetAt) return;
      applyReveal();
      emit();
    }, ms);
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

  function setStake(player, amount) {
    player.stake = Math.round(Number(amount) * 2) / 2;
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
    table.promptKey = ["prompt.reveal0", "prompt.reveal1", "prompt.reveal2"][table.street] || "prompt.reveal0";
    table.promptParams = null;
    // Auto-advance after client cinema (lift → flip → settle). Host emit also works earlier.
    armRevealAuto(4200);
  }

  function openShowdown() {
    const left = alive();
    if (left.length <= 1) {
      endHand(left[0] || null);
      return;
    }
    table.turnId = null;
    table.votes = {};
    table.phase = "showdown";
    table.prompt = "Pokażcie układy — kto ma najmocniejszy?";
    table.promptKey = "prompt.showdown";
    table.promptParams = null;
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

  function buildSummary(winner) {
    const rows = players.map((player) => ({
      id: player.id,
      nick: player.nick,
      drank: player.handDrank || 0,
      owed: player.owed || 0,
      winner: !!(winner && player.id === winner.id),
      folded: player.status === "folded",
      allin: player.status === "allin",
      inHand: !!player.inHand,
    }));
    const totalDrank = rows.reduce((sum, row) => sum + (row.drank || 0), 0);
    return {
      handNumber: table.handNumber,
      winnerId: winner ? winner.id : null,
      winnerNick: winner ? winner.nick : null,
      totalDrank,
      players: rows,
    };
  }

  function enterHandEnd() {
    table.phase = "handEnd";
    table.turnId = null;
    table.allInActive = false;
    table.votes = {};
    players.forEach((player) => {
      player.ready = false;
    });
    const winner = players.find((p) => p.id === table.winnerId) || null;
    table.summary = buildSummary(winner);
    if (table.summary.winnerNick) {
      table.prompt = `${table.summary.winnerNick} bierze to rozdanie`;
      table.promptKey = "prompt.winnerTakes";
      table.promptParams = { nick: table.summary.winnerNick };
    } else {
      table.prompt = "Koniec rozdania";
      table.promptKey = "prompt.handEnd";
      table.promptParams = null;
    }
  }

  function endHand(winner) {
    table.turnId = null;
    table.allInActive = false;
    table.votes = {};
    table.winnerId = winner ? winner.id : null;
    if (winner) {
      table.prompt = `${winner.nick} W`;
      table.promptKey = "prompt.winnerShort";
      table.promptParams = { nick: winner.nick };
    } else {
      table.prompt = "Koniec rozdania";
      table.promptKey = "prompt.handEnd";
      table.promptParams = null;
    }
    if (winner) pushLog(`${winner.nick} wygrywa rozdanie`);
    const losers = players.filter(
      (player) => player.inHand && (!winner || player.id !== winner.id) && (player.stake || 0) > 0
    );
    const spins = losers.map((player) => makeStakeRoll(player));
    players.forEach((player) => {
      if (player.inHand) player.stake = 0;
    });
    table.summary = buildSummary(winner);
    table.afterRoulette = "handEnd";
    table.rouletteQueue = spins;
    if (!playQueueHead()) {
      table.afterRoulette = null;
      enterHandEnd();
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
    table.promptKey = null;
    table.promptParams = null;
    table.turnId = nextPending(table.turnId) || pending[0].id;
  }

  function finishRoulette() {
    if (!table.roulette) return;
    stopTimer();
    const spin = table.roulette;
    table.roulette = null;
    if (spin.outcome === "drink") {
      const drinker = players.find((player) => player.id === spin.playerId);
      if (drinker) {
        drinker.owed = Math.round(((drinker.owed || 0) + spin.drinks) * 2) / 2;
        drinker.handDrank = Math.round(((drinker.handDrank || 0) + spin.drinks) * 2) / 2;
        if (table.summary) {
          const row = table.summary.players.find((item) => item.id === drinker.id);
          if (row) {
            row.drank = drinker.handDrank;
            row.owed = drinker.owed;
          }
          table.summary.totalDrank = table.summary.players.reduce((sum, item) => sum + (item.drank || 0), 0);
        }
      }
    }
    pushLog(resultLine(spin));
    if (playQueueHead()) {
      emit();
      return;
    }
    const mode = table.afterRoulette;
    table.afterRoulette = null;
    if (mode === "handEnd") {
      enterHandEnd();
    } else {
      continueAfterAction();
    }
    emit();
  }

  function startHand() {
    stopRevealTimer();
    table.handNumber += 1;
    const order = players.map((player) => player.id);
    const index = order.indexOf(table.dealerId);
    table.dealerId = order[(index + 1) % order.length];
    table.street = 0;
    table.allInActive = false;
    table.handAllIn = false;
    table.winnerId = null;
    table.votes = {};
    table.summary = null;
    table.prompt = null;
    table.promptKey = null;
    table.promptParams = null;
    table.roulette = null;
    table.rouletteQueue = [];
    table.afterRoulette = null;
    players.forEach((player) => {
      player.inHand = true;
      player.status = "active";
      player.acted = false;
      player.stake = 0;
      player.riskStreet = 0;
      player.handDrank = 0;
      player.ready = false;
    });
    table.phase = "betting";
    table.turnId = firstToAct();
    pushLog(`Rozdanie ${table.handNumber}. Rozdajcie karty.`);
  }

  function backToLobby(message) {
    stopTimer();
    stopRevealTimer();
    table.phase = "lobby";
    table.prompt = message || null;
    table.promptKey = message ? "prompt.notEnoughPlayers" : null;
    table.promptParams = null;
    table.turnId = null;
    table.roulette = null;
    table.rouletteQueue = [];
    table.afterRoulette = null;
    table.allInActive = false;
    table.handAllIn = false;
    table.winnerId = null;
    table.votes = {};
    table.summary = null;
    players.forEach((player) => {
      player.inHand = false;
      player.status = "waiting";
      player.acted = false;
      player.ready = false;
      player.handDrank = 0;
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
    if (!clean) return fail("nickInvalid");
    const existing = players.find((player) => player.id === clientId);
    const taken = players.some(
      (player) => player.id !== clientId && player.nick.toLowerCase() === clean.toLowerCase()
    );
    if (taken) return fail("nickTaken");
    if (existing) {
      existing.nick = clean;
      existing.connected = true;
      return { ok: true };
    }
    if (players.length >= MAX_PLAYERS) return fail("tableFull");
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
      handDrank: 0,
      ready: false,
    });
    pushLog(`${clean} siada do stołu`);
    return { ok: true };
  }

  function claimHost(clientId, options = {}) {
    if (table.hostId && table.hostId !== clientId) return fail("hostTaken");
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
    if (!table.hostId) table.hostId = clientId;
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
    if (clientId !== table.hostId) return fail("hostOnly");
    if (table.phase !== "lobby" && table.phase !== "handEnd") return fail("settingsLocked");
    const entry = half(input.entry);
    const finalEntry = half(input.finalEntry != null ? input.finalEntry : input.entry);
    let allIn = half(input.allIn);
    const chambers = Math.round(Number(input.chambers));
    const soplica = Math.round(Number(input.soplica));
    if (entry == null || entry < 0.5 || entry > 20) return fail("entryRange");
    if (finalEntry == null || finalEntry < 0.5 || finalEntry > 20) {
      return fail("finalEntryRange");
    }
    // All-in covers three regular street entries (preflop + flop + turn).
    const minAllIn = Math.round(entry * 3 * 2) / 2;
    if (allIn == null || allIn < 0.5 || allIn > 60) return fail("allInRange");
    if (allIn + 1e-6 < minAllIn) {
      allIn = minAllIn;
    }
    if (!Number.isInteger(chambers) || chambers < 5 || chambers > 12) return fail("chambersRange");
    if (!Number.isInteger(soplica) || soplica < 0 || soplica > 100) return fail("soplicaRange");
    table.settings = { entry, finalEntry, allIn, chambers, soplica };
    emit();
    return { ok: true };
  }

  function reorder(clientId, playerId, direction) {
    if (clientId !== table.hostId) return fail("hostOnly");
    if (table.phase === "roulette") return fail("rouletteBusy");
    const index = players.findIndex((player) => player.id === playerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= players.length) return fail("reorderFail");
    const [player] = players.splice(index, 1);
    players.splice(target, 0, player);
    emit();
    return { ok: true };
  }

  function kick(clientId, playerId) {
    if (clientId !== table.hostId) return fail("hostOnly");
    const index = players.findIndex((player) => player.id === playerId);
    if (index < 0) return fail("playerMissing");
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
          enterHandEnd();
        } else {
          continueAfterAction();
        }
      }
    } else {
      stabilize();
    }
    if (players.length < 2 && table.phase !== "lobby") backToLobby(ERRORS.notEnoughPlayers);
    emit();
    return { ok: true };
  }

  function start(clientId) {
    if (clientId !== table.hostId) return fail("hostOnly");
    if (table.phase !== "lobby") return fail("gameAlreadyStarted");
    if (players.length < 2) return fail("needTwoPlayers");
    startHand();
    emit();
    return { ok: true };
  }

  function act(clientId, type) {
    if (table.phase !== "betting") return fail("wrongMoment");
    const player = players.find((item) => item.id === clientId);
    if (!player || table.turnId !== clientId || player.status !== "active") return fail("notYourTurn");
    if (type === "enter") {
      if (table.allInActive) {
        // All-in na stole = ustaw stawkę na pakiet all-in (nie doliczaj).
        setStake(player, table.settings.allIn);
        player.status = "allin";
      } else {
        addStake(player, streetEntryAmount());
      }
      player.acted = true;
      pushLog(`${player.nick} wchodzi, stawka ${labelDrinks(player.stake)}`);
      continueAfterAction();
      emit();
      return { ok: true };
    }
    if (type === "allin") {
      if (table.allInActive) return fail("allInAlready");
      // All-in ustawia pulę na konkretną ilość, nie dodaje do wcześniejszych wejść.
      setStake(player, table.settings.allIn);
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
    return fail("unknownAct");
  }

  function applyReveal() {
    if (table.phase !== "reveal") return false;
    stopRevealTimer();
    table.street += 1;
    const bettors = players.filter((player) => player.inHand && player.status === "active");
    if (bettors.length === 0) {
      if (table.street >= 3) openShowdown();
      else openReveal();
      return true;
    }
    bettors.forEach((player) => {
      player.acted = false;
    });
    table.phase = "betting";
    table.prompt = null;
    table.promptKey = null;
    table.promptParams = null;
    table.turnId = firstToAct();
    return true;
  }

  function reveal(clientId) {
    if (clientId !== table.hostId) return fail("hostOnly");
    if (table.phase !== "reveal") return fail("notNow");
    applyReveal();
    emit();
    return { ok: true };
  }

  function tallyVotes() {
    const counts = {};
    Object.values(table.votes).forEach((nomineeId) => {
      counts[nomineeId] = (counts[nomineeId] || 0) + 1;
    });
    return counts;
  }

  function castVote(clientId, playerId) {
    if (table.phase !== "showdown") return fail("notNow");
    const voter = players.find((item) => item.id === clientId);
    if (!voter) return fail("seatFirst");
    const left = alive();
    const nominee = left.find((player) => player.id === playerId);
    if (!nominee) return fail("pickAlive");
    table.votes[clientId] = playerId;
    const voterCount = players.length;
    const need = voteThreshold(voterCount);
    const counts = tallyVotes();
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= need) {
      const winner = left.find((player) => player.id === top[0]);
      if (winner) {
        endHand(winner);
        emit();
        return { ok: true };
      }
    }
    emit();
    return { ok: true };
  }

  function setReady(clientId, ready = true) {
    if (table.phase !== "handEnd") return fail("notNow");
    const player = players.find((item) => item.id === clientId);
    if (!player) return fail("seatFirst");
    player.ready = !!ready;
    const seated = players.filter((item) => item.connected);
    const crowd = seated.length ? seated : players;
    if (crowd.length >= 2 && crowd.every((item) => item.ready)) {
      startHand();
    }
    emit();
    return { ok: true };
  }

  function nextHand(clientId) {
    // Host override — normally wszyscy klikaą ready.
    if (clientId !== table.hostId) return fail("hostOnly");
    if (table.phase !== "handEnd") return fail("handStillGoing");
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
    if (clientId !== table.hostId) return fail("hostOnly");
    if (table.phase !== "betting" || !table.turnId) return fail("nobodyToSkip");
    return act(table.turnId, "fold");
  }

  function setUrls(urls) {
    table.urls = urls;
  }

  function view(clientId) {
    const settings = table.settings;
    const loaded = Math.min(table.street, settings.chambers);
    const left = alive().map((player) => ({ id: player.id, nick: player.nick }));
    const entryNow = streetEntryAmount();
    const safeNum = settings.chambers - loaded;
    const safePct = settings.chambers ? Math.round((safeNum / settings.chambers) * 100) : 0;
    const streetPct = settings.chambers ? Math.round((loaded / settings.chambers) * 100) : 0;
    const voteCounts = tallyVotes();
    const voterCount = players.length;
    const voteNeed = voteThreshold(voterCount);
    const voteTotal = Object.keys(table.votes).length;
    const myVote = table.votes[clientId] || null;
    const readyCount = players.filter((player) => player.ready).length;
    return {
      urls: table.urls,
      phase: table.phase,
      settings,
      street: table.street,
      streetName: STREET_NAME[table.street] || STREET_NAME[0],
      streetNameKey: ["street.0", "street.1", "street.2", "street.3"][table.street] || "street.0",
      handNumber: table.handNumber,
      allInActive: table.allInActive,
      handAllIn: table.handAllIn,
      prompt: table.prompt,
      promptKey: table.promptKey,
      promptParams: table.promptParams,
      winnerId: table.winnerId,
      summary: table.summary,
      log: table.log.slice(),
      roulette: table.roulette,
      risk: {
        num: loaded,
        den: settings.chambers,
        safeNum,
        safePct,
        streetPct,
        drinks: table.allInActive ? settings.allIn : entryNow,
        soplica: settings.soplica,
        entry: settings.entry,
        finalEntry: settings.finalEntry,
        allIn: settings.allIn,
        nextNum: table.phase === "reveal" ? Math.min(table.street + 1, settings.chambers) : null,
      },
      vote:
        table.phase === "showdown"
          ? {
              need: voteNeed,
              needPct: Math.round(VOTE_NEED * 100),
              total: voteTotal,
              voters: voterCount,
              counts: voteCounts,
              mine: myVote,
            }
          : null,
      ready:
        table.phase === "handEnd"
          ? {
              count: readyCount,
              total: players.length,
              mine: !!(players.find((player) => player.id === clientId) || {}).ready,
            }
          : null,
      players: players.map((player) => ({
        id: player.id,
        nick: player.nick,
        connected: player.connected,
        status: player.status,
        inHand: player.inHand,
        acted: !!player.acted,
        ready: !!player.ready,
        handDrank: player.handDrank || 0,
        dealer: player.id === table.dealerId,
        turn: table.phase === "betting" && player.id === table.turnId,
        winner: table.winnerId === player.id && (table.phase === "handEnd" || table.phase === "roulette"),
        owed: player.owed || 0,
        stake: player.stake || 0,
        votedFor: table.phase === "showdown" ? table.votes[player.id] || null : null,
      })),
      alive: left,
      decision:
        table.phase === "betting" && table.turnId
          ? {
              playerId: table.turnId,
              canAllIn: !table.allInActive,
              allInLive: table.allInActive,
              addAmount: table.allInActive ? settings.allIn : entryNow,
              isFinalStreet: table.street >= 3,
              safeNum,
              safeDen: settings.chambers,
              safePct,
              streetPct,
              soplica: settings.soplica,
            }
          : null,
      host: {
        start: table.phase === "lobby" && players.length >= 2,
        reveal: table.phase === "reveal",
        pick: false,
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
    stopRevealTimer();
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
    castVote,
    setReady,
    nextHand,
    skip,
    setUrls,
    view,
    getStatus,
    dispose,
    finishRouletteNow: finishRoulette,
  };
}


module.exports = { createGame, labelDrinks, MAX_PLAYERS, REVEAL, STREET_NAME, VOTE_NEED };
