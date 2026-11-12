"use strict";

const root = document.getElementById("root");
const overlay = document.getElementById("overlay");
const sheet = document.getElementById("sheet");
const toast = document.getElementById("toast");
const net = document.getElementById("net");
const live = document.getElementById("live");
const muteBtn = document.getElementById("mute");
const queueHud = document.getElementById("queue-hud");

const WAIT_LINES = [
  (nick) => `${nick} still loading…`,
  (nick) => `hold up — ${nick} ma move`,
  (nick) => `${nick} denkt hard rn`,
  (nick) => `czekamy aż ${nick} kliknie coś real`,
  (nick) => `${nick} · main character moment`,
  (nick) => `buffering ${nick}…`,
];

const REVEAL_LINES = ["Odkrywamy karty", "Flip incoming", "Board update"];
const VOTE_LINES = ["Kto ma najostrzejszy układ?", "Vote for the bag", "Kto bierze ten pot?"];

const clientId = loadId();
let state = null;
let mounted = "";
let shownSpin = null;
let toastTimer = null;
let audioOn = localStorage.getItem("shoker-mute") !== "1";
let audioCtx = null;
let glassSeq = 0;
let lastWho = "";
let lastPrompt = "";
let lastStake = "";
let owedMap = {};
let spinTl = null;
let verdictTw = null;
let cardTl = null;
let reduceMotion = false;
let lastBoardKey = "";
let lastRevealed = -1;
let lastOddsPct = null;
let rosterTimer = null;
let sheetOpen = false;
let watchFlash = null;
let watchFlashTimer = null;
let pourTl = null;
let lastPourKey = "";
let revealTl = null;
let lastRevealKey = "";
let lastTableDomKey = "";

if (window.gsap) {
  gsap.defaults({ ease: "power3.out", overwrite: "auto" });
  gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => {
    reduceMotion = true;
    return () => {
      reduceMotion = false;
    };
  });
}

const socket = io({ autoConnect: false });

muteBtn.textContent = audioOn ? "Dźwięk włączony" : "Dźwięk wyłączony";
muteBtn.addEventListener("click", () => {
  audioOn = !audioOn;
  localStorage.setItem("shoker-mute", audioOn ? "0" : "1");
  muteBtn.textContent = audioOn ? "Dźwięk włączony" : "Dźwięk wyłączony";
  unlockAudio();
});

socket.on("connect", () => {
  net.hidden = true;
  socket.emit("hello", { clientId });
});

socket.on("disconnect", () => {
  net.hidden = false;
});

socket.on("state", (next) => {
  const had = state;
  const wasTurn = had && had.decision && had.decision.playerId === clientId && had.phase === "betting";
  captureWatchAction(had, next);
  state = next;
  if (state.phase !== "betting") clearWatchFlash(false);
  const nowTurn = state.decision && state.decision.playerId === clientId && state.phase === "betting";
  if (had && nowTurn && !wasTurn) {
    if (navigator.vibrate) navigator.vibrate(40);
    chime(660, 0.08, "triangle", 0.05);
  }
  render();
});

socket.on("toast", ({ message }) => showToast(message));
socket.connect();

root.addEventListener("click", onClick);
root.addEventListener("submit", (event) => {
  event.preventDefault();
  sendJoin();
});
root.addEventListener("input", (event) => {
  if (event.target.id !== "soplica") return;
  const readout = document.getElementById("soplica-readout") || sheet.querySelector("#soplica-readout");
  if (readout) readout.textContent = `Soplica ${event.target.value}%`;
});
root.addEventListener("change", (event) => {
  if (event.target.id !== "soplica") return;
  sendSettings({ soplica: Number(event.target.value) });
});
root.addEventListener("pointerdown", onRosterPointerDown);
root.addEventListener("pointerup", onRosterPointerUp);
root.addEventListener("pointercancel", onRosterPointerUp);
root.addEventListener("pointerleave", onRosterPointerUp);
root.addEventListener("contextmenu", (event) => {
  if (event.target.closest("[data-roster]")) event.preventDefault();
});
sheet.addEventListener("click", onSheetClick);
sheet.addEventListener("input", (event) => {
  if (event.target.id !== "soplica") return;
  const readout = sheet.querySelector("#soplica-readout");
  if (readout) readout.textContent = `Soplica ${event.target.value}%`;
});
sheet.addEventListener("change", (event) => {
  if (event.target.id !== "soplica") return;
  sendSettings({ soplica: Number(event.target.value) });
});

function loadId() {
  const key = "shoker-id";
  let id = localStorage.getItem(key);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = uuid();
    localStorage.setItem(key, id);
  }
  return id;
}

function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

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

function drinkNumber(amount) {
  const rounded = Math.round(Number(amount) * 2) / 2;
  if (!Number.isFinite(rounded)) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

function shotSvg(level) {
  glassSeq += 1;
  const id = `cup${glassSeq}`;
  const y = level >= 1 ? 16 : level >= 0.5 ? 26 : 42;
  return `<svg class="shot" viewBox="0 0 32 44" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="M8 6h16l-1.4 24.4A6.4 6.4 0 0 1 16.2 36h-.4a6.4 6.4 0 0 1-6.4-5.6z"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect class="liquid" x="6" y="${y}" width="20" height="32"/></g>
    <path class="cup" d="M7 4.5h18l-1.6 25.2a7 7 0 0 1-7 6.2h-.8a7 7 0 0 1-7-6.2z"/>
  </svg>`;
}

function glassesHtml(amount, max = 6) {
  const rounded = Math.max(0, Math.round(Number(amount) * 2) / 2 || 0);
  const full = Math.floor(rounded);
  const half = rounded - full >= 0.5;
  const shots = [];
  if (rounded === 0) shots.push(shotSvg(0));
  for (let i = 0; i < full && shots.length < max; i += 1) shots.push(shotSvg(1));
  if (half && shots.length < max) shots.push(shotSvg(0.5));
  return `<span class="glasses" aria-label="${esc(labelDrinks(rounded))}">${shots.join("")}<em>${drinkNumber(rounded)}</em></span>`;
}

function motion(duration) {
  return reduceMotion ? 0 : duration;
}

function chooseView(current) {
  if (!current) return "wait";
  if (!current.you.isHost && !current.you.seated) return "menu";
  return current.phase === "lobby" ? "lobby" : "table";
}

function render() {
  const view = chooseView(state);
  const viewChanged = view !== mounted;
  document.body.classList.toggle(
    "your-turn",
    !!(state && state.phase === "betting" && state.decision && state.decision.playerId === clientId)
  );
  if (view !== mounted) {
    mounted = view;
    if (view === "menu") root.innerHTML = menuHtml();
    if (view === "wait") root.innerHTML = `<p class="wait">Łączenie ze stołem…</p>`;
  }
  if (view === "menu") updateMenuNote();
  if (view === "lobby") {
    lastTableDomKey = "";
    const field = document.getElementById("seat-nick");
    const typing = field && document.activeElement === field;
    const draft = field ? field.value : "";
    root.innerHTML = lobbyHtml();
    const again = document.getElementById("seat-nick");
    if (again && draft) {
      again.value = draft;
      if (typing) again.focus();
    }
  }
  if (view === "table") {
    const key = tableDomKey(state);
    const revealBusy =
      state.phase === "reveal" &&
      !!revealTl &&
      lastTableDomKey.startsWith(`reveal|${state.street}|${state.handNumber}|`);
    if (key !== lastTableDomKey && !revealBusy) {
      lastTableDomKey = key;
      root.innerHTML = tableHtml();
    }
  } else if (view !== "lobby") {
    lastTableDomKey = "";
  }
  document.body.classList.toggle("table-view", view === "table");
  document.body.classList.toggle("watching", view === "table" && isWatchingOthers());
  document.body.classList.toggle("is-revealing", view === "table" && state && state.phase === "reveal");
  document.body.classList.toggle("is-voting", view === "table" && state && state.phase === "showdown");
  document.body.classList.toggle("is-summary", view === "table" && state && state.phase === "handEnd");
  syncQueueHud();
  syncSheet();
  syncRoulette();
  syncLive();
  animate(viewChanged);
}

function tableDomKey(current) {
  if (!current) return "";
  const watch = isWatchingOthers() ? watchSubject().key : "play";
  const people = current.players
    .map(
      (player) =>
        `${player.id}:${player.status}:${player.acted ? 1 : 0}:${player.turn ? 1 : 0}:${player.ready ? 1 : 0}:${player.votedFor || ""}:${player.stake}:${player.owed}:${player.handDrank || 0}:${player.connected ? 1 : 0}`
    )
    .join(",");
  const vote = current.vote ? `${current.vote.total}:${current.vote.mine || ""}` : "";
  const ready = current.ready ? `${current.ready.count}:${current.ready.mine ? 1 : 0}` : "";
  return [
    current.phase,
    current.street,
    current.handNumber || 0,
    current.allInActive ? 1 : 0,
    current.prompt || "",
    current.decision ? current.decision.playerId : "",
    current.decision && current.decision.allInLive ? 1 : 0,
    watch,
    people,
    current.winnerId || "",
    vote,
    ready,
    current.summary ? current.summary.totalDrank : "",
  ].join("|");
}

function pickLine(list, seed) {
  if (!list.length) return "";
  let hash = 0;
  const key = String(seed || "");
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return list[hash % list.length];
}

function waitLineFor(nick, seed) {
  const factory = pickLine(WAIT_LINES, seed);
  return typeof factory === "function" ? factory(nick) : `czekamy na ${nick}`;
}

function menuHtml() {
  return `
    <section class="menu">
      <div class="menu-card">
        <h1 class="logo">Shoker</h1>
        <p class="tag">Karty IRL. Kieliszki tu.</p>
        <form id="enter-form">
          <input id="nick" class="nick" maxlength="16" autocomplete="nickname" placeholder="Nick" />
          <div class="menu-actions">
            <button class="btn solid" type="submit">Siadam</button>
          </div>
        </form>
        <p id="menu-note" class="note"></p>
      </div>
    </section>
  `;
}

function updateMenuNote() {
  const note = document.getElementById("menu-note");
  if (!note || !state) return;
  if (state.phase !== "lobby" && state.phase !== "handEnd") {
    note.textContent = "Gra już trwa. Jak usiądziesz, wejdziesz od następnego rozdania.";
    return;
  }
  if (state.phase === "handEnd") {
    note.textContent = "Rozdanie się kończy. Usiądziesz w następnym.";
    return;
  }
  note.textContent = state.players.length
    ? state.players.map((player) => player.nick).join(", ")
    : "Wpisz nick, jeśli też grasz.";
}

function lobbyHtml() {
  const host = state.you.isHost;
  const chambers = state.settings.chambers;
  const curve = [0, 1, 2, 3]
    .map((step) => `${Math.round(((chambers - Math.min(step, chambers)) / chambers) * 100)}%`)
    .join(" · ");
  return `
    <section class="lobby">
      <div class="panel">
        <p class="kicker">Stół</p>
        <h2 class="word">Shoker</h2>
        <div class="urls">
          ${state.urls.map((item) => `
            <div class="url-card">
              ${item.qr ? `<img alt="Kod QR" src="${item.qr}" />` : "<div></div>"}
              <div>
                <a href="${esc(item.url)}">${esc(item.url)}</a>
                      </div>
            </div>
          `).join("")}
        </div>
        <p class="hint">Ten sam Wi-Fi. Jak telefon nie wchodzi, zezwól Node w zaporze sieci prywatnej.</p>
      </div>
      <div class="panel">
        <p class="kicker">${host ? "Prowadzisz" : "Czekasz na hosta"}</p>
        <h2>${state.players.length} przy stole</h2>
        <div class="people">
          ${state.players.map((player, index) => `
            <div class="person">
              <div class="seat-head">
                <div class="avatar">${esc(player.nick.slice(0, 1))}</div>
                <div>
                  <b>${esc(player.nick)}</b>
                  <small>${player.connected ? "na miejscu" : "offline"}${player.id === clientId ? " · ty" : ""}</small>
                </div>
                ${host ? `
                  <div class="icon-row">
                    <button type="button" data-act="up" data-id="${esc(player.id)}" ${index === 0 || !state.host.reorder ? "disabled" : ""}>▲</button>
                    <button type="button" data-act="down" data-id="${esc(player.id)}" ${index === state.players.length - 1 || !state.host.reorder ? "disabled" : ""}>▼</button>
                    <button type="button" data-act="kick" data-id="${esc(player.id)}">Wyrzuć</button>
                  </div>
                ` : ""}
              </div>
              ${drinkBlock(player)}
            </div>
          `).join("") || `<p class="hint">Nikt jeszcze nie usiadł.</p>`}
        </div>
        ${host && !state.you.seated ? `
          <form id="seat-form" class="stack">
            <input id="seat-nick" class="nick" maxlength="16" placeholder="Nick, jeśli też grasz" />
            <button class="btn ghost" type="submit">Też siadam</button>
          </form>
        ` : ""}
        ${host ? settingsHtml() : stakesHtml()}
        <p class="curve">Safe exit: ${curve}. All-in = full cylinder, potem Soplica ${state.settings.soplica}% clutch save.</p>
        ${host ? `<button class="btn solid" type="button" data-act="start" ${state.host.start ? "" : "disabled"}>Start</button>` : `<p class="hint">Czekamy na start.</p>`}
        ${host && state.players.length < 2 ? `<p class="hint">Potrzeba co najmniej dwóch graczy.</p>` : ""}
      </div>
    </section>
  `;
}

function minAllInForEntry(entry) {
  return Math.round(Number(entry) * 3 * 2) / 2;
}

function settingsHtml() {
  const settings = state.settings;
  const minAllIn = minAllInForEntry(settings.entry);
  const finalEntry = settings.finalEntry != null ? settings.finalEntry : settings.entry;
  return `
    <div class="stack" style="margin-top:16px">
      ${stepper("entry", "Wejście", glassesHtml(settings.entry, 5), settings.entry <= 0.5, settings.entry >= 20)}
      ${stepper("finalEntry", "Na pełnym boardzie", glassesHtml(finalEntry, 5), finalEntry <= 0.5, finalEntry >= 20)}
      ${stepper("allIn", "All-in", glassesHtml(settings.allIn, 5), settings.allIn <= minAllIn, settings.allIn >= 60)}
      ${stepper("chambers", "Komory", String(settings.chambers), settings.chambers <= 5, settings.chambers >= 12)}
      <label>
        <span id="soplica-readout">Soplica ${settings.soplica}%</span>
        <input id="soplica" class="slider" type="range" min="0" max="100" value="${settings.soplica}" ${state.host.settings ? "" : "disabled"} />
      </label>
    </div>
  `;
}

function stepper(field, title, value, minusOff, plusOff) {
  const plusDisabled = plusOff || !state.host.settings;
  const minusDisabled = minusOff || !state.host.settings;
  return `
    <div class="stepper">
      <button type="button" data-act="minus" data-field="${field}" ${minusDisabled ? "disabled" : ""}>−</button>
      <span class="step-mid"><b>${esc(title)}</b>${value}</span>
      <button type="button" data-act="plus" data-field="${field}" ${plusDisabled ? "disabled" : ""}>+</button>
    </div>
  `;
}

function stakesHtml() {
  const finalEntry = state.settings.finalEntry != null ? state.settings.finalEntry : state.settings.entry;
  return `
    <div class="stakes">
      <div><span>Wejście</span>${glassesHtml(state.settings.entry, 5)}</div>
      <div><span>Pełny board</span>${glassesHtml(finalEntry, 5)}</div>
      <div><span>All-in</span>${glassesHtml(state.settings.allIn, 5)}</div>
    </div>
    <p class="hint">${state.settings.chambers} komór · street risk rośnie z kartami · Soplica ${state.settings.soplica}% na all-in.</p>
  `;
}

function boardRevealed(street) {
  const step = Math.max(0, Math.min(3, Number(street) || 0));
  if (step <= 0) return 0;
  if (step === 1) return 3;
  if (step === 2) return 4;
  return 5;
}

function drinkOdds() {
  const den = state.settings.chambers;
  const streetLoaded = Math.min(state.street || 0, den);
  const streetPct = den ? Math.round((streetLoaded / den) * 100) : 0;
  const allInPct = Math.max(0, Math.min(100, Math.round(100 - state.settings.soplica)));
  const mine = state.decision && state.decision.playerId === clientId;
  // All-in already on table: big % stays street risk (fold); WEJDŹ shows all-in %.
  const decidingIntoAllIn = !!(mine && state.decision.allInLive);
  const useAllIn = !!(state.allInActive && !decidingIntoAllIn);
  const pct = useAllIn ? allInPct : streetPct;
  let note = "drink chance";
  if (useAllIn && state.settings.soplica > 0) {
    note = `drink chance · Soplica ${state.settings.soplica}%`;
  } else if (useAllIn) {
    note = "drink chance · all-in";
  }
  return {
    pct,
    streetPct,
    allInPct,
    useAllIn,
    decidingIntoAllIn,
    note,
    revealed: boardRevealed(state.street),
    hidden: 5 - boardRevealed(state.street),
  };
}

function revealLine() {
  return pickLine(REVEAL_LINES, `${state.handNumber}:${state.street}:reveal`);
}

function boardHtml() {
  const revealed = boardRevealed(state.street);
  const revealTo =
    state.phase === "reveal" ? boardRevealed(Math.min(3, (state.street || 0) + 1)) : revealed;
  const cards = [];
  for (let i = 0; i < 5; i += 1) {
    const open = i < revealed;
    cards.push(`
      <div class="card${open ? " is-open" : ""}" data-card="${i}" data-open="${open ? "1" : "0"}">
        <div class="card-inner">
          <div class="card-face card-back" aria-hidden="true">
            <span class="card-mark">S</span>
          </div>
          <div class="card-face card-front" aria-hidden="true">
            <span class="card-gleam"></span>
          </div>
        </div>
      </div>
    `);
  }
  return `
    <div class="board" data-revealed="${revealed}" data-reveal-to="${revealTo}" data-hand="${state.handNumber || 0}">
      <div class="board-row" aria-label="${revealed} odkryte, ${5 - revealed} zakryte">
        ${cards.join("")}
      </div>
      <p class="board-count"><b>${revealed}</b> odkryte · <b>${5 - revealed}</b> zakryte</p>
    </div>
  `;
}

function oddsHtml(odds) {
  return `
    <div class="odds" data-pct="${odds.pct}" aria-label="${esc(odds.note)}: ${odds.pct}%">
      <span class="odds-num">${odds.pct}<small>%</small></span>
      <span class="odds-note">${esc(odds.note)}</span>
    </div>
  `;
}

function myStakeHtml() {
  const me = state.players.find((player) => player.id === clientId);
  const stake = me ? me.stake || 0 : 0;
  return `
    <div class="my-stake" data-owed-id="mine-stake" data-owed="${stake}">
      <span class="my-stake-label">Twoja pula</span>
      ${glassesHtml(stake)}
    </div>
  `;
}

function playerStatus(player) {
  if (player.winner) return "wygrywa";
  if (!player.inHand) return "od następnego";
  if (player.status === "folded") return "pas";
  if (player.status === "allin") return "all-in";
  if (player.turn) return "kolej";
  if (player.status === "waiting") return "czeka";
  return "w grze";
}

function rosterSheetHtml() {
  return `
    <div class="sheet-backdrop" data-sheet="close"></div>
    <div class="sheet-card" role="dialog" aria-label="Gracze przy stole">
      <div class="sheet-handle"></div>
      <div class="sheet-top">
        <div>
          <p class="kicker">Przy stole</p>
          <h2>${state.players.length} graczy</h2>
        </div>
        <button class="sheet-close" type="button" data-sheet="close" aria-label="Zamknij">✕</button>
      </div>
      <div class="sheet-list">
        ${state.players.map((player, index) => {
          const live = player.inHand && state.phase !== "lobby" && state.phase !== "handEnd";
          const amount = live ? player.stake || 0 : player.owed || 0;
          const amountLabel = live ? "stawka" : "wypite";
          let meta = playerStatus(player);
          if (!player.connected) meta += " · offline";
          if (player.dealer) meta += " · rozdaje";
          if (player.id === clientId) meta += " · ty";
          return `
            <div class="sheet-row${player.turn ? " is-turn" : ""}${player.status === "folded" ? " is-folded" : ""}${state.you.isHost ? " has-host" : ""}">
              <div class="avatar">${esc(player.nick.slice(0, 1))}</div>
              <div class="sheet-row-main">
                <b>${esc(player.nick)}</b>
                <small>${esc(meta)}</small>
              </div>
              <div class="sheet-row-stake" data-owed-id="sheet-${esc(player.id)}" data-owed="${amount}">
                <span>${esc(amountLabel)}</span>
                ${glassesHtml(amount)}
              </div>
              ${state.you.isHost ? `
                <div class="icon-row">
                  <button type="button" data-act="up" data-id="${esc(player.id)}" ${index === 0 || !state.host.reorder ? "disabled" : ""}>▲</button>
                  <button type="button" data-act="down" data-id="${esc(player.id)}" ${index === state.players.length - 1 || !state.host.reorder ? "disabled" : ""}>▼</button>
                  <button class="text-btn" type="button" data-act="kick" data-id="${esc(player.id)}">Wyrzuć</button>
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
      ${state.you.isHost && state.host.settings ? settingsHtml() : ""}
    </div>
  `;
}

function syncSheet() {
  if (!sheet) return;
  if (chooseView(state) !== "table") {
    sheetOpen = false;
    sheet.hidden = true;
    sheet.innerHTML = "";
    return;
  }
  if (!sheetOpen) {
    sheet.hidden = true;
    return;
  }
  sheet.hidden = false;
  sheet.innerHTML = rosterSheetHtml();
}

function openSheet() {
  if (!state || chooseView(state) !== "table") return;
  sheetOpen = true;
  syncSheet();
  if (navigator.vibrate) navigator.vibrate(18);
  if (window.gsap) {
    const card = sheet.querySelector(".sheet-card");
    if (card) {
      gsap.from(card, {
        y: 48,
        autoAlpha: 0,
        duration: motion(0.35),
        clearProps: "transform,opacity,visibility",
      });
    }
  }
}

function closeSheet() {
  sheetOpen = false;
  if (!sheet) return;
  sheet.hidden = true;
  sheet.innerHTML = "";
}

function clearRosterTimer() {
  if (rosterTimer) {
    clearTimeout(rosterTimer);
    rosterTimer = null;
  }
}

function onRosterPointerDown(event) {
  const btn = event.target.closest("[data-roster]");
  if (!btn) return;
  clearRosterTimer();
  rosterTimer = setTimeout(() => {
    rosterTimer = null;
    openSheet();
  }, 320);
}

function onRosterPointerUp() {
  clearRosterTimer();
}

function onSheetClick(event) {
  const close = event.target.closest("[data-sheet='close']");
  if (close) {
    closeSheet();
    return;
  }
  const button = event.target.closest("[data-act]");
  if (!button || button.disabled) return;
  onClick(event);
}

function isWatchingOthers() {
  if (!state || state.phase !== "betting") return false;
  if (watchFlash) return true;
  return !!(state.decision && state.decision.playerId !== clientId);
}

function clearWatchFlash(rerender) {
  if (watchFlashTimer) {
    clearTimeout(watchFlashTimer);
    watchFlashTimer = null;
  }
  const had = !!watchFlash;
  watchFlash = null;
  if (had && rerender) render();
}

function captureWatchAction(prev, next) {
  if (!prev || !next) return;
  if (prev.phase !== "betting" || !prev.decision) return;
  const actorId = prev.decision.playerId;
  if (!actorId || actorId === clientId) return;
  const before = prev.players.find((player) => player.id === actorId);
  const after = next.players.find((player) => player.id === actorId);
  if (!before || !after) return;
  const turnMoved = !next.decision || next.decision.playerId !== actorId || next.phase !== "betting";
  const folded = before.status !== "folded" && after.status === "folded";
  const wentAllIn = before.status !== "allin" && after.status === "allin";
  const entered = (after.stake || 0) > (before.stake || 0);
  if (!turnMoved && !folded && !wentAllIn && !entered) return;
  let action = "enter";
  if (folded) action = "fold";
  else if (wentAllIn) action = "allin";
  else if (entered) action = "enter";
  else return;
  if (watchFlashTimer) clearTimeout(watchFlashTimer);
  watchFlash = {
    playerId: actorId,
    nick: after.nick,
    action,
    stake: after.stake || 0,
    id: `${actorId}:${action}:${Date.now()}`,
  };
  watchFlashTimer = setTimeout(() => {
    watchFlashTimer = null;
    watchFlash = null;
    render();
  }, reduceMotion ? 700 : 1700);
}

function watchActionLabel(action) {
  if (action === "fold") return "Fold";
  if (action === "allin") return "All-in";
  return "In";
}

function pourSvg() {
  glassSeq += 1;
  const clip = `pour-shot-${glassSeq}`;
  // Kieliszek ~15% mniejszy: rant przy podstawie butelki, trochę bardziej w prawo.
  const cup = "M98 100h24l-2 29a8.5 8.5 0 0 1-8.5 7.5h-3a8.5 8.5 0 0 1-8.5-7.5z";
  return `
    <div class="pour" aria-hidden="true">
      <svg class="pour-svg" viewBox="0 0 148 148">
        <defs>
          <clipPath id="${clip}">
            <path d="${cup}"/>
          </clipPath>
        </defs>
        <g class="pour-bottle" transform="translate(8 2)">
          <rect class="pour-bottle-body" x="8" y="32" width="38" height="78" rx="10"/>
          <rect class="pour-bottle-neck" x="17" y="10" width="20" height="28" rx="4"/>
          <rect class="pour-bottle-lip" x="13" y="2" width="28" height="12" rx="4"/>
          <rect class="pour-bottle-fill" x="13" y="54" width="28" height="46" rx="5"/>
        </g>
        <g class="pour-glass">
          <g clip-path="url(#${clip})">
            <rect class="pour-liquid" x="96" y="126" width="28" height="34"/>
          </g>
          <path class="pour-cup" d="${cup}"/>
        </g>
      </svg>
      <p class="pour-label">pouring thoughts…</p>
    </div>
  `;
}

function watchPanelHtml(subject) {
  const waiting = subject.mode === "wait";
  const line = waiting
    ? waitLineFor(subject.nick, subject.key)
    : pickLine(["locked in", "move dropped", "that's a wrap"], subject.key);
  return `
    <div class="watch" data-watch-mode="${esc(subject.mode)}" data-watch-key="${esc(subject.key)}">
      <p class="watch-kicker">${waiting ? "Czekamy" : "Decyzja"}</p>
      <h2 class="watch-nick">${esc(subject.nick)}</h2>
      <p class="watch-line">${esc(line)}</p>
      <div class="watch-stake" data-owed-id="watch-stake-${esc(subject.playerId || "x")}" data-owed="${subject.stake}">
        <span>W puli</span>
        ${glassesHtml(subject.stake)}
      </div>
      <div class="watch-stage">
        ${waiting ? pourSvg() : `
          <div class="watch-verdict watch-verdict-${esc(subject.action)}">
            <p class="watch-verdict-label">${esc(watchActionLabel(subject.action))}</p>
            ${subject.action === "fold" ? "" : `<div class="watch-verdict-glasses">${glassesHtml(subject.stake)}</div>`}
          </div>
        `}
      </div>
      ${state.you.isHost && state.host.skip && waiting ? `<button class="btn ghost watch-skip" type="button" data-act="skip">Skipnij</button>` : ""}
    </div>
  `;
}

function watchSubject() {
  if (watchFlash) {
    return {
      mode: "done",
      key: watchFlash.id,
      nick: watchFlash.nick,
      stake: watchFlash.stake,
      action: watchFlash.action,
      playerId: watchFlash.playerId,
    };
  }
  const turn =
    state.players.find((player) => player.turn) ||
    state.players.find((player) => state.decision && player.id === state.decision.playerId);
  return {
    mode: "wait",
    key: `wait:${turn ? turn.id : "none"}:${state.street}:${state.handNumber}`,
    nick: turn ? turn.nick : "…",
    stake: turn ? turn.stake || 0 : 0,
    playerId: turn ? turn.id : null,
  };
}

function tableMeta() {
  return `
    <div class="meta">
      <span class="pill">Rozdanie ${state.handNumber || "—"}</span>
      <span class="pill">${esc(state.streetName)}</span>
      <button class="roster-btn" type="button" data-roster aria-label="Przytrzymaj, żeby zobaczyć graczy">
        <span class="roster-dots" aria-hidden="true"></span>
        Stół
      </button>
    </div>
  `;
}

function streetQueue() {
  if (!state || state.phase !== "betting") return [];
  const turnId =
    (state.decision && state.decision.playerId) ||
    (state.players.find((player) => player.turn) || {}).id;
  if (!turnId) return [];
  const start = state.players.findIndex((player) => player.id === turnId);
  if (start < 0) return [];
  const pending = [];
  for (let step = 0; step < state.players.length; step += 1) {
    const player = state.players[(start + step) % state.players.length];
    if (!player.inHand || player.status === "folded") continue;
    if (player.status === "active" && !player.acted) pending.push(player);
  }
  return pending;
}

function syncQueueHud() {
  if (!queueHud) return;
  if (!state || chooseView(state) !== "table") {
    queueHud.hidden = true;
    queueHud.innerHTML = "";
    return;
  }
  if (state.phase === "reveal") {
    queueHud.hidden = false;
    queueHud.innerHTML = `
      <div class="queue-chip is-break" aria-label="Nowa kolejka">
        <span class="queue-chip-now">↻ reset kolejki</span>
      </div>
    `;
    return;
  }
  const pending = streetQueue();
  if (!pending.length) {
    queueHud.hidden = true;
    queueHud.innerHTML = "";
    return;
  }
  const now = pending[0];
  const rest = pending.slice(1, 3);
  const more = Math.max(0, pending.length - 3);
  queueHud.hidden = false;
  queueHud.innerHTML = `
    <div class="queue-chip" aria-label="Kolejka">
      <span class="queue-chip-label">now</span>
      <span class="queue-chip-now">${esc(now.nick)}${now.id === clientId ? " · ty" : ""}</span>
      ${rest.length || more
        ? `<span class="queue-chip-next">${rest.map((p) => esc(p.nick)).join(" · ")}${more ? ` +${more}` : ""}</span>`
        : ""}
    </div>
  `;
}

function votePanelHtml() {
  const vote = state.vote || { need: 1, needPct: 60, total: 0, voters: state.players.length, counts: {}, mine: null };
  const title = pickLine(VOTE_LINES, `${state.handNumber}:vote`);
  return `
    <div class="end-panel vote-panel">
      <p class="end-kicker">showdown</p>
      <h2 class="end-title">${esc(title)}</h2>
      <p class="end-sub">Trzeba ≈${vote.needPct}% stołu · teraz ${vote.total}/${vote.voters} · próg ${vote.need}</p>
      <div class="vote-list">
        ${(state.alive || [])
          .map((player) => {
            const count = (vote.counts && vote.counts[player.id]) || 0;
            const mine = vote.mine === player.id;
            const pct = vote.voters ? Math.round((count / vote.voters) * 100) : 0;
            return `
              <button class="vote-card${mine ? " is-mine" : ""}" type="button" data-act="winner" data-id="${esc(player.id)}">
                <span class="vote-nick">${esc(player.nick)}</span>
                <span class="vote-meta">${count} · ${pct}%</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function summaryPanelHtml() {
  const summary = state.summary;
  const ready = state.ready || { count: 0, total: state.players.length, mine: false };
  const me = summary
    ? summary.players.find((player) => player.id === clientId)
    : state.players.find((player) => player.id === clientId);
  const myDrank = me ? me.drank || me.handDrank || 0 : 0;
  const myOwed = me ? me.owed || 0 : 0;
  const total = summary ? summary.totalDrank : state.players.reduce((sum, p) => sum + (p.handDrank || 0), 0);
  const rows = summary ? summary.players : state.players;
  const champ = summary && summary.winnerNick ? summary.winnerNick : "nikt";
  return `
    <div class="end-panel summary-panel">
      <p class="end-kicker">recap</p>
      <h2 class="end-title">${esc(champ)} W</h2>
      <p class="end-sub">Rozdanie ${summary ? summary.handNumber : state.handNumber} · stół wypił ${esc(drinkNumber(total))}</p>
      <div class="summary-hero" data-owed-id="summary-mine" data-owed="${myDrank}">
        <span class="summary-hero-label">Ty w tym rozdaniu</span>
        <div class="summary-hero-num">${glassesHtml(myDrank)}</div>
        <span class="summary-hero-owed">łącznie do wypicia: ${esc(drinkNumber(myOwed))}</span>
      </div>
      <div class="summary-list">
        ${rows
          .map((player) => {
            const drank = player.drank != null ? player.drank : player.handDrank || 0;
            const owed = player.owed || 0;
            const flags = [];
            if (player.winner) flags.push("W");
            if (player.folded) flags.push("pas");
            if (player.allin) flags.push("all-in");
            const readyPlayer = state.players.find((item) => item.id === player.id);
            if (readyPlayer && readyPlayer.ready) flags.push("ready");
            return `
              <div class="summary-row${player.id === clientId ? " is-you" : ""}${player.winner ? " is-winner" : ""}">
                <div>
                  <b>${esc(player.nick)}</b>
                  <small>${flags.length ? esc(flags.join(" · ")) : "clean"}</small>
                </div>
                <div class="summary-row-stats">
                  <span>teraz ${esc(drinkNumber(drank))}</span>
                  <span>łącznie ${esc(drinkNumber(owed))}</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="summary-ready">
        <p class="end-sub">${ready.count}/${ready.total} ready — jak wszyscy dadzą zielone, lecimy dalej</p>
        <button class="btn solid" type="button" data-act="ready" ${ready.mine ? "disabled" : ""}>
          ${ready.mine ? "Jesteś ready" : "Jestem ready"}
        </button>
        ${state.you.isHost ? `<button class="btn ghost" type="button" data-act="next">Force start</button>` : ""}
      </div>
    </div>
  `;
}

function tableHtml() {
  const turn = state.players.find((player) => player.turn);
  const mine = state.decision && state.decision.playerId === clientId;
  const watching = isWatchingOthers();
  const revealing = state.phase === "reveal";
  const voting = state.phase === "showdown";
  const summarizing = state.phase === "handEnd";
  const headline = headlineHtml(turn, mine);
  const odds = drinkOdds();
  const showBoard =
    state.phase === "betting" ||
    state.phase === "reveal" ||
    state.phase === "showdown" ||
    state.phase === "roulette" ||
    state.phase === "handEnd";
  const showPlayBits = showBoard && !revealing && !watching && !voting && !summarizing;
  const body = summarizing
    ? summaryPanelHtml()
    : voting
      ? `
        ${showBoard ? boardHtml() : ""}
        ${votePanelHtml()}
      `
      : `
        ${showBoard ? boardHtml() : ""}
        ${revealing ? `<p class="reveal-line">${esc(revealLine())}</p>` : ""}
        ${showPlayBits ? oddsHtml(odds) : ""}
        ${showPlayBits ? myStakeHtml() : ""}
        ${watching ? watchPanelHtml(watchSubject()) : revealing ? "" : headline}
        ${watching || revealing ? "" : hostControls()}
      `;
  const layoutClass = [
    "table-layout",
    watching ? "is-watching" : "",
    revealing ? "is-reveal" : "",
    voting ? "is-vote" : "",
    summarizing ? "is-summary" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <section class="${layoutClass}">
      <div class="stage${watching ? " stage-watch" : ""}${revealing ? " stage-reveal" : ""}${voting ? " stage-vote" : ""}${summarizing ? " stage-summary" : ""}">
        ${tableMeta()}
        <div class="stage-main">${body}</div>
      </div>
      ${mine && state.phase === "betting" ? actionDock(odds) : ""}
    </section>
  `;
}

function drinkBlock(player) {
  const stake = player.stake || 0;
  const owed = player.owed || 0;
  const live = player.inHand && state.phase !== "lobby" && state.phase !== "handEnd";
  if (live) {
    return `
      <div class="owed" data-owed-id="stake-${esc(player.id)}" data-owed="${stake}">
        ${glassesHtml(stake)}
        <small class="sipped">stawka${owed > 0 ? ` · wypite ${esc(drinkNumber(owed))}` : ""}</small>
      </div>
    `;
  }
  return `<div class="owed" data-owed-id="${esc(player.id)}" data-owed="${owed}">${glassesHtml(owed)}</div>`;
}

function seatHtml(player, index) {
  const classes = ["seat"];
  if (player.turn) classes.push("turn");
  if (player.status === "folded") classes.push("folded");
  if (player.winner) classes.push("winner");
  let status = "w grze";
  if (player.winner) status = "wygrywa";
  else if (!player.inHand) status = "od następnego";
  else if (player.status === "folded") status = "pas";
  else if (player.status === "allin") status = "all-in";
  else if (player.status === "waiting") status = "czeka";
  if (!player.connected) status += " · offline";
  if (player.dealer) status += " · rozdaje";
  return `
    <div class="${classes.join(" ")}">
      <div class="seat-head">
        <div class="avatar">${esc(player.nick.slice(0, 1))}</div>
        <div>
          <b>${esc(player.nick)}</b>
          <small>${esc(status)}</small>
        </div>
        ${state.you.isHost ? `
          <div class="icon-row">
            <button type="button" data-act="up" data-id="${esc(player.id)}" ${index === 0 || !state.host.reorder ? "disabled" : ""}>▲</button>
            <button type="button" data-act="down" data-id="${esc(player.id)}" ${index === state.players.length - 1 || !state.host.reorder ? "disabled" : ""}>▼</button>
            <button class="text-btn" type="button" data-act="kick" data-id="${esc(player.id)}">Wyrzuć</button>
          </div>
        ` : ""}
      </div>
      ${drinkBlock(player)}
    </div>
  `;
}

function headlineHtml(turn, mine) {
  if (state.phase === "reveal" || state.phase === "showdown" || state.phase === "handEnd") {
    return `<h2 class="prompt">${esc(state.prompt || "")}</h2>`;
  }
  if (state.phase === "roulette" && state.roulette) {
    return `<p class="who">Spin</p><h2 class="name">${esc(state.roulette.nick)}</h2>`;
  }
  if (!turn) return `<h2 class="prompt">Chill a sec</h2>`;
  if (mine) {
    return `
      <p class="who">Twój move</p>
      <h2 class="name">${esc(turn.nick)}</h2>
    `;
  }
  return `
    <p class="who">Kolejka</p>
    <h2 class="name">${esc(turn.nick)}</h2>
    <p class="hint">${esc(waitLineFor(turn.nick, `${turn.id}:${state.street}:${state.handNumber}`))}</p>
  `;
}

function actionDock(odds) {
  const decision = state.decision;
  const safePct =
    decision.safePct != null
      ? decision.safePct
      : decision.safeDen
        ? Math.round((decision.safeNum / decision.safeDen) * 100)
        : 0;
  const enter = decision.allInLive ? "full cylinder" : decision.isFinalStreet ? "pełny board" : "do stawki";
  const enterPct = decision.allInLive ? odds.allInPct : odds.streetPct;
  return `
    <div class="dock">
      <div class="actions ${decision.canAllIn ? "has-allin" : "two"}">
        <button class="act enter" type="button" data-act="enter">
          <span class="act-top">Wejdź</span>
          <span class="act-mid">${glassesHtml(decision.addAmount, 4)}</span>
          <span class="act-sub">${esc(enter)} · risk ${enterPct}%</span>
        </button>
        <button class="act fold" type="button" data-act="fold">
          <span class="act-top">Pas</span>
          <span class="act-sub">safe exit ${safePct}%</span>
        </button>
        ${decision.canAllIn ? `
          <button class="act allin" type="button" data-act="allin">
            <span class="act-top">All-in</span>
            <span class="act-mid">${glassesHtml(state.settings.allIn, 4)}</span>
            <span class="act-sub">risk ${odds.allInPct}%</span>
          </button>
        ` : ""}
      </div>
    </div>
  `;
}

function hostControls() {
  if (state.phase === "showdown" || state.phase === "handEnd") return "";
  if (state.you.isHost && state.host.skip && state.decision && state.decision.playerId !== clientId) {
    return `<button class="btn ghost" type="button" data-act="skip">Skipnij</button>`;
  }
  if (!state.you.isHost) return "";
  return "";
}

function onClick(event) {
  const button = event.target.closest("[data-act]");
  if (!button || button.disabled) return;
  unlockAudio();
  const act = button.dataset.act;
  if (act === "start") socket.emit("start");
  if (act === "enter" || act === "fold" || act === "allin") socket.emit("act", { type: act });
  if (act === "reveal") socket.emit("reveal");
  if (act === "next") socket.emit("next");
  if (act === "ready") socket.emit("ready", { ready: true });
  if (act === "skip") socket.emit("skip");
  if (act === "kick") socket.emit("kick", { playerId: button.dataset.id });
  if (act === "winner") socket.emit("winner", { playerId: button.dataset.id });
  if (act === "up" || act === "down") {
    socket.emit("reorder", { playerId: button.dataset.id, direction: act === "up" ? -1 : 1 });
  }
  if (act === "minus" || act === "plus") bump(button.dataset.field, act === "plus" ? 1 : -1);
}

function nickValue() {
  const field = document.getElementById("nick") || document.getElementById("seat-nick");
  return field ? field.value : "";
}

function sendJoin() {
  const nick = nickValue();
  if (state && state.you.isHost && !state.you.seated) {
    socket.emit("host", { sit: true, nick });
    return;
  }
  socket.emit("join", { nick });
}

function bump(field, direction) {
  if (!state || !state.you.isHost || !state.host.settings) return;
  const settings = { ...state.settings };
  const step = field === "chambers" || field === "soplica" ? 1 : 0.5;
  const delta = direction * step;
  if (field === "entry") {
    settings.entry = Math.round((settings.entry + delta) * 2) / 2;
    settings.entry = Math.min(20, Math.max(0.5, settings.entry));
    // All-in ≥ 3× wejście (trzy zwykłe ulice: rozdanie + flop + turn).
    const minAllIn = minAllInForEntry(settings.entry);
    settings.allIn = Math.max(settings.allIn, minAllIn);
    settings.allIn = Math.min(60, settings.allIn);
  } else if (field === "finalEntry") {
    const current = settings.finalEntry != null ? settings.finalEntry : settings.entry;
    settings.finalEntry = Math.round((current + delta) * 2) / 2;
    settings.finalEntry = Math.min(20, Math.max(0.5, settings.finalEntry));
  } else if (field === "allIn") {
    const minAllIn = minAllInForEntry(settings.entry);
    settings.allIn = Math.round((settings.allIn + delta) * 2) / 2;
    settings.allIn = Math.min(60, Math.max(minAllIn, settings.allIn));
  } else if (field === "chambers") {
    settings.chambers = Math.min(12, Math.max(5, settings.chambers + delta));
  } else if (field === "soplica") {
    settings.soplica = Math.min(100, Math.max(0, settings.soplica + delta));
  } else {
    return;
  }
  socket.emit("settings", settings);
}

function sendSettings(patch) {
  if (!state) return;
  socket.emit("settings", { ...state.settings, ...patch });
}

function stopPour() {
  if (pourTl) {
    pourTl.kill();
    pourTl = null;
  }
  lastPourKey = "";
}

function animateWatch() {
  const watch = document.querySelector(".watch");
  if (!watch) {
    stopPour();
    return;
  }
  if (!window.gsap) return;
  const key = watch.dataset.watchKey || "";
  const mode = watch.dataset.watchMode;
  if (mode === "done") {
    stopPour();
    const verdict = watch.querySelector(".watch-verdict");
    if (verdict && key !== lastPourKey) {
      lastPourKey = key;
      gsap.from(verdict, {
        y: 18,
        scale: 0.92,
        autoAlpha: 0,
        duration: motion(0.45),
        ease: "back.out(1.4)",
        clearProps: "transform,opacity,visibility",
      });
      gsap.from(watch.querySelector(".watch-nick"), {
        y: 10,
        autoAlpha: 0,
        duration: motion(0.35),
        clearProps: "transform,opacity,visibility",
      });
    }
    return;
  }

  const bottle = watch.querySelector(".pour-bottle");
  const liquid = watch.querySelector(".pour-liquid");
  const label = watch.querySelector(".pour-label");
  if (!bottle || !liquid) return;
  if (key === lastPourKey && pourTl) return;

  stopPour();
  lastPourKey = key;

  gsap.set(bottle, { rotation: 0, x: 0, transformOrigin: "27px 108px" });
  gsap.set(liquid, { y: 0 });
  if (label) {
    gsap.fromTo(
      label,
      { autoAlpha: 0.45 },
      { autoAlpha: 1, duration: motion(0.9), yoyo: true, repeat: -1, ease: "sine.inOut" }
    );
  }

  if (reduceMotion) {
    gsap.set(bottle, { rotation: 26, x: 4 });
    gsap.set(liquid, { y: -30 });
    return;
  }

  // Bottle tips into nearby glass → liquid rises; bottle pulls away → liquid falls.
  pourTl = gsap.timeline({ repeat: -1, defaults: { ease: "power1.inOut" } });
  pourTl
    .set(liquid, { y: 0 })
    .to(bottle, { rotation: 28, x: 5, duration: 0.55 }, 0)
    .to(liquid, { y: -30, duration: 0.7, ease: "power1.out" }, 0.18)
    .to(bottle, { rotation: 0, x: 0, duration: 0.55 }, 1.05)
    .to(liquid, { y: 0, duration: 0.55 }, 1.15)
    .to({}, { duration: 0.3 });
}

function stopRevealCinema() {
  if (revealTl) {
    revealTl.kill();
    revealTl = null;
  }
  const row = document.querySelector(".board-row");
  if (row && window.gsap) gsap.set(row, { clearProps: "transform" });
  const count = document.querySelector(".board-count");
  if (count && window.gsap) gsap.set(count, { clearProps: "opacity,visibility" });
}

function updateBoardCount(openCount) {
  const count = document.querySelector(".board-count");
  if (!count) return;
  const hidden = Math.max(0, 5 - openCount);
  count.innerHTML = `<b>${openCount}</b> odkryte · <b>${hidden}</b> zakryte`;
  const row = document.querySelector(".board-row");
  if (row) row.setAttribute("aria-label", `${openCount} odkryte, ${hidden} zakryte`);
}

function revealLift() {
  const row = document.querySelector(".board-row");
  const stage = document.querySelector(".stage-main") || document.querySelector(".stage");
  if (!row || !stage) return { x: 0, y: -28, scale: 1.2 };
  gsap.set(row, { x: 0, y: 0, scale: 1, transformOrigin: "50% 50%" });
  const rowRect = row.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  if (!rowRect.width || !stageRect.width) return { x: 0, y: -28, scale: 1.2 };
  const scale = Math.min(1.32, Math.max(1.14, (stageRect.width * 0.9) / rowRect.width));
  const targetX = stageRect.left + stageRect.width / 2;
  const targetY = stageRect.top + Math.min(stageRect.height * 0.36, 168);
  return {
    x: targetX - (rowRect.left + rowRect.width / 2),
    y: targetY - (rowRect.top + rowRect.height / 2),
    scale,
  };
}

function animateRevealSequence() {
  const board = document.querySelector(".board");
  const line = document.querySelector(".reveal-line");
  const row = document.querySelector(".board-row");
  if (!board || !window.gsap) return;

  const from = Number(board.dataset.revealed) || 0;
  const to = Number(board.dataset.revealTo) || from;
  const hand = board.dataset.hand || "0";
  const key = `${hand}:${state.street}:reveal`;
  if (key === lastRevealKey && revealTl) return;
  if (key === lastRevealKey && !revealTl && lastRevealed >= to) return;

  stopRevealCinema();
  if (cardTl) {
    cardTl.kill();
    cardTl = null;
  }
  lastRevealKey = key;

  const cards = [...board.querySelectorAll(".card")];
  const inners = cards.map((card) => card.querySelector(".card-inner"));
  inners.forEach((inner, index) => {
    gsap.set(inner, { rotationY: index < from ? 180 : 0 });
  });
  updateBoardCount(from);

  const fresh = inners.slice(from, to);
  const count = board.querySelector(".board-count");
  const finish = () => {
    lastRevealed = to;
    lastBoardKey = `${hand}:${to}`;
    updateBoardCount(to);
    fresh.forEach((_, i) => {
      const card = cards[from + i];
      if (card) card.classList.add("is-open");
    });
    if (row) gsap.set(row, { clearProps: "transform" });
    if (count) gsap.set(count, { clearProps: "opacity,visibility" });
  };

  if (reduceMotion || !fresh.length) {
    fresh.forEach((inner) => gsap.set(inner, { rotationY: 180 }));
    if (line) gsap.set(line, { autoAlpha: 1 });
    finish();
    return;
  }

  const lift = revealLift();
  if (line) gsap.set(line, { autoAlpha: 0, y: 16 });
  if (count) gsap.set(count, { autoAlpha: 0 });
  if (row) gsap.set(row, { transformOrigin: "50% 50%", x: 0, y: 0, scale: 1 });

  revealTl = gsap.timeline({
    defaults: { ease: "power2.out" },
    onComplete: () => {
      revealTl = null;
      finish();
    },
  });

  revealTl
    .to(
      row || board,
      {
        x: lift.x,
        y: lift.y,
        scale: lift.scale,
        duration: motion(0.55),
        ease: "power3.out",
      },
      0
    )
    .to(line, { autoAlpha: 1, y: 0, duration: motion(0.38) }, 0.18)
    .to(
      fresh,
      {
        rotationY: 180,
        duration: motion(0.62),
        stagger: 0.1,
        ease: "power2.inOut",
        onStart: () => updateBoardCount(to),
      },
      0.48
    )
    .to({}, { duration: motion(0.55) })
    .to(line, { autoAlpha: 0, y: -10, duration: motion(0.32) }, "+=0")
    .to(
      row || board,
      {
        x: 0,
        y: 0,
        scale: 1,
        duration: motion(0.5),
        ease: "power2.inOut",
      },
      "<0.04"
    )
    .to(count, { autoAlpha: 1, duration: motion(0.28) }, "-=0.18");
}

function animateBoard() {
  if (state && state.phase === "reveal") return;
  const board = document.querySelector(".board");
  if (!board || !window.gsap) return;
  const revealed = Number(board.dataset.revealed) || 0;
  const hand = board.dataset.hand || "0";
  const key = `${hand}:${revealed}`;
  const cards = [...board.querySelectorAll(".card")];
  const inners = cards.map((card) => card.querySelector(".card-inner"));
  const dealFresh = key !== lastBoardKey && (lastBoardKey === "" || !String(lastBoardKey).startsWith(`${hand}:`));
  const prevRevealed = lastRevealed < 0 || dealFresh ? 0 : lastRevealed;

  if (cardTl) {
    cardTl.kill();
    cardTl = null;
  }

  inners.forEach((inner, index) => {
    const open = index < revealed;
    const alreadyOpen = index < prevRevealed && !dealFresh;
    if (alreadyOpen) gsap.set(inner, { rotationY: 180 });
    else if (!open) gsap.set(inner, { rotationY: 0 });
  });

  if (dealFresh) {
    cardTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    cardTl.from(cards, {
      y: 36,
      rotation: (i) => (i - 2) * 4,
      autoAlpha: 0,
      duration: motion(0.5),
      stagger: 0.05,
      clearProps: "transform,opacity,visibility",
    });
    const toFlip = inners.filter((_, index) => index < revealed);
    if (toFlip.length) {
      cardTl.to(
        toFlip,
        { rotationY: 180, duration: motion(0.55), stagger: 0.08, ease: "power2.inOut" },
        "-=0.15"
      );
    }
  } else if (revealed > prevRevealed) {
    // Already flipped during reveal cinema — just settle.
    inners.forEach((inner, index) => {
      gsap.set(inner, { rotationY: index < revealed ? 180 : 0 });
    });
  } else {
    inners.forEach((inner, index) => {
      gsap.set(inner, { rotationY: index < revealed ? 180 : 0 });
    });
  }

  const oddsEl = document.querySelector(".odds-num");
  const oddsBlock = document.querySelector(".odds");
  const pct = oddsBlock ? Number(oddsBlock.dataset.pct) : null;
  if (oddsEl && pct != null && pct !== lastOddsPct) {
    const from = lastOddsPct == null ? 0 : lastOddsPct;
    const counter = { value: from };
    gsap.to(counter, {
      value: pct,
      duration: motion(0.45),
      ease: "power2.out",
      onUpdate: () => {
        oddsEl.innerHTML = `${Math.round(counter.value)}<small>%</small>`;
      },
    });
    lastOddsPct = pct;
  } else if (pct != null) {
    lastOddsPct = pct;
  }

  lastBoardKey = key;
  lastRevealed = revealed;
}

function animate(viewChanged) {
  if (!window.gsap) return;
  const stakeKey = state ? `${state.settings.entry}:${state.settings.allIn}` : "";
  if (viewChanged) {
    gsap.from("#root > *", {
      y: 24,
      autoAlpha: 0,
      duration: motion(0.55),
      stagger: 0.06,
      clearProps: "transform,opacity,visibility",
    });
  }
  document.querySelectorAll("[data-owed-id]").forEach((node) => {
    const id = node.dataset.owedId;
    const amount = Number(node.dataset.owed);
    const previous = owedMap[id];
    if (!viewChanged && previous != null && amount > previous) {
      gsap.from(node.querySelectorAll(".shot"), {
        y: 16,
        scale: 0.6,
        autoAlpha: 0,
        stagger: 0.05,
        duration: motion(0.45),
        ease: "back.out(1.8)",
        clearProps: "transform,opacity,visibility",
      });
    }
    owedMap[id] = amount;
  });
  if (chooseView(state) === "table") {
    if (state.phase === "reveal") {
      stopPour();
      animateRevealSequence();
    } else {
      if (state.phase !== "reveal") lastRevealKey = "";
      stopRevealCinema();
      animateBoard();
      animateWatch();
    }
  } else {
    stopPour();
    stopRevealCinema();
    lastRevealKey = "";
    lastBoardKey = "";
    lastRevealed = -1;
    lastOddsPct = null;
  }
  if (viewChanged) {
    lastStake = stakeKey;
    const shownName = document.querySelector(".name");
    const shownPrompt = document.querySelector(".prompt");
    if (shownName) lastWho = shownName.textContent;
    if (shownPrompt) lastPrompt = shownPrompt.textContent;
    return;
  }
  if (stakeKey !== lastStake) {
    lastStake = stakeKey;
    gsap.from(".stepper .liquid, .stakes .liquid, .stake-row .liquid", {
      scaleY: 0,
      transformOrigin: "50% 100%",
      stagger: 0.04,
      duration: motion(0.4),
      ease: "power2.out",
    });
  }
  const name = document.querySelector(".name");
  if (name && name.textContent !== lastWho) {
    lastWho = name.textContent;
    gsap.from(name, { y: 18, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
  }
  const prompt = document.querySelector(".prompt");
  if (prompt && prompt.textContent !== lastPrompt) {
    lastPrompt = prompt.textContent;
    gsap.from(prompt, { y: 16, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
  }
}

function syncLive() {
  if (!state) return;
  let text = "";
  if (state.phase === "betting" && state.decision) {
    const player = state.players.find((item) => item.id === state.decision.playerId);
    text = player ? `Kolej: ${player.nick}` : "";
  } else if (state.prompt) text = state.prompt;
  if (live.textContent !== text) live.textContent = text;
}

function syncRoulette() {
  const spin = state && state.roulette;
  if (!spin) {
    if (spinTl) {
      spinTl.kill();
      spinTl = null;
    }
    if (verdictTw) {
      verdictTw.kill();
      verdictTw = null;
    }
    overlay.hidden = true;
    overlay.innerHTML = "";
    shownSpin = null;
    return;
  }
  if (shownSpin === spin.id) return;
  shownSpin = spin.id;
  drawWheel(spin);
  const wheel = overlay.querySelector(".wheel");
  const wrap = overlay.querySelector(".wheel-wrap");
  if (spinTl) spinTl.kill();
  const spinSeconds = motion(3.1);
  playSpinSounds(Math.max(spinSeconds, 0.05) * 1000, spin);
  if (!window.gsap) {
    wheel.style.transform = `rotate(${finalAngle(spin)}deg)`;
    revealSpin(spin);
    return;
  }
  if (reduceMotion) {
    gsap.set(wheel, { rotation: finalAngle(spin) });
    revealSpin(spin);
    return;
  }
  gsap.set(wheel, { rotation: 0 });
  spinTl = gsap.timeline({
    defaults: { ease: "power3.out" },
    onComplete: () => {
      if (shownSpin === spin.id) revealSpin(spin);
    },
  });
  spinTl
    .from(wrap, { scale: 0.84, autoAlpha: 0, duration: 0.35 }, 0)
    .to(wheel, { rotation: finalAngle(spin), duration: spinSeconds, ease: "power4.out" }, 0.12);
}

function drawWheel(spin) {
  const size = spin.chambers >= 10 ? 34 : spin.chambers >= 8 ? 42 : 54;
  const step = 360 / spin.chambers;
  const chambers = spin.hot.map((hot, index) => {
    const rad = ((index * step) - 90) * Math.PI / 180;
    const left = 50 + Math.cos(rad) * 37;
    const top = 50 + Math.sin(rad) * 37;
    return `<i class="chamber ${hot ? "hot" : "safe"}" style="left:${left}%;top:${top}%;--ch:${size}px"></i>`;
  }).join("");
  overlay.hidden = false;
  overlay.className = "";
  overlay.innerHTML = `
    <div class="spin">
      <div class="wheel-wrap">
        <div class="pointer"></div>
        <div class="wheel">${chambers}</div>
      </div>
      <div class="spin-copy" hidden>
        <p class="spin-kicker"></p>
        <h2></h2>
        <p class="hint"></p>
      </div>
    </div>
  `;
}

function finalAngle(spin) {
  return -(360 * 5 + spin.landing * (360 / spin.chambers));
}

function placeWheel(wheel, spin, duration, reset) {
  if (reset) {
    wheel.style.transition = "none";
    wheel.style.transform = "rotate(0deg)";
    return;
  }
  wheel.style.transition = duration ? `transform ${duration}ms linear` : "none";
  wheel.style.transform = `rotate(${finalAngle(spin)}deg)`;
}

function revealSpin(spin) {
  const wheel = overlay.querySelector(".wheel");
  if (wheel) {
    const chamber = wheel.children[spin.landing];
    if (chamber) chamber.classList.add("landed");
  }
  const copy = overlay.querySelector(".spin-copy");
  if (!copy) return;
  copy.hidden = false;
  const kicker = copy.querySelector(".spin-kicker");
  const title = copy.querySelector("h2");
  const hint = copy.querySelector(".hint");
  kicker.textContent = spin.nick;
  overlay.classList.remove("safe", "drink", "soplica");
  if (spin.kind === "allin") {
    title.textContent = "Komora";
    hint.textContent = "";
    const verdict = () => {
      if (shownSpin !== spin.id) return;
      if (spin.outcome === "soplica") {
        overlay.classList.add("soplica");
        title.textContent = "Tadeusz Soplica cię ratuje";
        hint.textContent = "Nic nie pijesz";
      } else {
        overlay.classList.add("drink");
        title.textContent = "Pijesz";
        hint.innerHTML = glassesHtml(spin.drinks, 6);
      }
      if (window.gsap) {
        gsap.from(copy, { y: 18, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
      }
    };
    if (window.gsap && !reduceMotion) {
      if (verdictTw) verdictTw.kill();
      verdictTw = gsap.delayedCall(0.9, verdict);
    } else {
      verdict();
    }
    return;
  }
  if (spin.outcome === "soplica") {
    overlay.classList.add("soplica");
    title.textContent = "Tadeusz Soplica cię ratuje";
    hint.textContent = "Nic nie pijesz";
  } else if (spin.outcome === "drink") {
    overlay.classList.add("drink");
    title.textContent = "Pijesz";
    hint.innerHTML = glassesHtml(spin.drinks, 6);
  } else {
    overlay.classList.add("safe");
    title.textContent = "Nic nie pijesz";
    hint.textContent = `safe ${Math.round(((spin.chambers - spin.loaded) / spin.chambers) * 100)}%`;
  }
  if (window.gsap) {
    gsap.from(copy, { y: 18, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
  }
}

function showToast(message) {
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function unlockAudio() {
  const ctx = context();
  if (ctx && ctx.state === "suspended") ctx.resume();
}

function context() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function chime(freq, dur, type, volume) {
  if (!audioOn) return;
  const ctx = context();
  if (!ctx) return;
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur);
}

function playSpinSounds(remain, spin) {
  if (!audioOn) return;
  const ctx = context();
  if (!ctx) return;
  const start = ctx.currentTime;
  const seconds = remain / 1000;
  for (let i = 0; i < 12; i += 1) {
    const at = start + (i / 12) * seconds;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 180 + i * 18;
    gain.gain.setValueAtTime(0.03, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
  const at = start + seconds;
  const freq = spin.outcome === "soplica" ? 880 : spin.outcome === "drink" ? 140 : 520;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = spin.outcome === "drink" ? "sawtooth" : "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.06, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.5);
}
