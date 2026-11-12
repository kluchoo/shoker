import { createAnim } from "./anim.js";
import { chime, isAudioOn, toggleAudio, unlockAudio } from "./audio.js";
import { minAllInForEntry } from "./format.js";
import {
  flagFor,
  getLocale,
  listLocales,
  onLocaleChange,
  promptText,
  serverMessage,
  setLocale,
  t,
} from "./i18n.js";
import { lobbyHtml } from "./lobby.js";
import { menuHtml, updateMenuPlayers } from "./menu.js";
import { actionDockHtml, queueHudHtml, rosterSheetHtml, tableHtml } from "./table.js";

const root = document.getElementById("root");
const overlay = document.getElementById("overlay");
const sheet = document.getElementById("sheet");
const toast = document.getElementById("toast");
const net = document.getElementById("net");
const live = document.getElementById("live");
const muteBtn = document.getElementById("mute");
const langBtn = document.getElementById("lang");
const langMenu = document.getElementById("lang-menu");
const queueHud = document.getElementById("queue-hud");
const dock = document.getElementById("dock");

const clientId = loadId();
const ctx = {
  state: null,
  overlay,
  reduceMotion: false,
  pourTl: null,
  lastPourKey: "",
  revealTl: null,
  lastRevealKey: "",
  cardTl: null,
  lastBoardKey: "",
  lastRevealed: -1,
  lastOddsPct: null,
  owedMap: {},
  lastStake: "",
  lastWho: "",
  lastPrompt: "",
  spinTl: null,
  verdictTw: null,
  shownSpin: null,
  dockTl: null,
  dockOpen: false,
  dockKey: "",
  chooseView,
};

let mounted = "";
let toastTimer = null;
let rosterTimer = null;
let sheetOpen = false;
let watchFlash = null;
let watchFlashTimer = null;
let lastTableDomKey = "";

const anim = createAnim(ctx);

if (window.gsap) {
  gsap.defaults({ ease: "power3.out", overwrite: "auto" });
  gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => {
    ctx.reduceMotion = true;
    return () => {
      ctx.reduceMotion = false;
    };
  });
}

const socket = io({ autoConnect: false });

function syncChrome() {
  document.documentElement.lang = getLocale();
  muteBtn.textContent = isAudioOn() ? t("mute.on") : t("mute.off");
  muteBtn.setAttribute("aria-label", muteBtn.textContent);
  net.textContent = t("net.offline");
  if (langBtn) {
    langBtn.textContent = flagFor();
    langBtn.setAttribute("aria-label", t("lang.choose"));
    langBtn.title = t("lang.choose");
  }
  renderLangMenu();
}

function renderLangMenu() {
  if (!langMenu) return;
  langMenu.innerHTML = listLocales()
    .map(
      (item) => `
      <button type="button" class="lang-option${item.code === getLocale() ? " is-active" : ""}" data-lang="${item.code}">
        <span class="lang-flag">${item.flag}</span>
        <span>${item.label}</span>
      </button>
    `
    )
    .join("");
}

function closeLangMenu() {
  if (!langMenu) return;
  langMenu.hidden = true;
  langBtn?.setAttribute("aria-expanded", "false");
}

function toggleLangMenu() {
  if (!langMenu) return;
  const open = langMenu.hidden;
  langMenu.hidden = !open;
  langBtn?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) renderLangMenu();
}

syncChrome();
onLocaleChange(() => {
  syncChrome();
  mounted = "";
  lastTableDomKey = "";
  render();
});

muteBtn.addEventListener("click", () => {
  toggleAudio();
  syncChrome();
  unlockAudio();
});

langBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleLangMenu();
});

langMenu?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-lang]");
  if (!option) return;
  setLocale(option.dataset.lang);
  closeLangMenu();
});

document.addEventListener("click", (event) => {
  if (!langMenu || langMenu.hidden) return;
  if (event.target.closest("#lang") || event.target.closest("#lang-menu")) return;
  closeLangMenu();
});

socket.on("connect", () => {
  net.hidden = true;
  socket.emit("hello", { clientId });
});

socket.on("disconnect", () => {
  net.hidden = false;
});

socket.on("state", (next) => {
  const had = ctx.state;
  const wasTurn = had && had.decision && had.decision.playerId === clientId && had.phase === "betting";
  captureWatchAction(had, next);
  ctx.state = next;
  if (ctx.state.phase !== "betting") clearWatchFlash(false);
  const nowTurn = ctx.state.decision && ctx.state.decision.playerId === clientId && ctx.state.phase === "betting";
  if (had && nowTurn && !wasTurn) {
    if (navigator.vibrate) navigator.vibrate(40);
    chime(660, 0.08, "triangle", 0.05);
  }
  render();
});

socket.on("toast", (payload) => showToast(serverMessage(payload)));
socket.connect();

root.addEventListener("click", onClick);
dock?.addEventListener("click", onClick);
root.addEventListener("submit", (event) => {
  event.preventDefault();
  sendJoin();
});
root.addEventListener("input", (event) => {
  if (event.target.id !== "soplica") return;
  const readout = document.getElementById("soplica-readout") || sheet.querySelector("#soplica-readout");
  if (readout) readout.textContent = t("settings.soplica", { n: event.target.value });
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
  if (readout) readout.textContent = t("settings.soplica", { n: event.target.value });
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

function chooseView(current) {
  if (!current) return "wait";
  if (!current.you.isHost && !current.you.seated) return "menu";
  return current.phase === "lobby" ? "lobby" : "table";
}

function render() {
  const state = ctx.state;
  const view = chooseView(state);
  const viewChanged = view !== mounted;
  document.body.classList.toggle(
    "your-turn",
    !!(state && state.phase === "betting" && state.decision && state.decision.playerId === clientId)
  );
  if (view !== mounted) {
    mounted = view;
    if (view === "menu") root.innerHTML = menuHtml();
    if (view === "wait") root.innerHTML = `<p class="wait">${t("wait.connecting")}</p>`;
  }
  if (view === "menu") updateMenuPlayers(state);
  if (view === "lobby") {
    lastTableDomKey = "";
    const field = document.getElementById("seat-nick");
    const typing = field && document.activeElement === field;
    const draft = field ? field.value : "";
    root.innerHTML = lobbyHtml(state, clientId);
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
      !!ctx.revealTl &&
      lastTableDomKey.startsWith(`reveal|${state.street}|${state.handNumber}|`);
    if (key !== lastTableDomKey && !revealBusy) {
      lastTableDomKey = key;
      root.innerHTML = tableHtml(state, clientId, {
        isWatchingOthers,
        watchSubject,
      });
    }
  } else if (view !== "lobby") {
    lastTableDomKey = "";
  }
  document.body.classList.toggle("table-view", view === "table" || view === "lobby");
  document.body.classList.toggle("lobby-view", view === "lobby");
  document.body.classList.toggle("watching", view === "table" && isWatchingOthers());
  document.body.classList.toggle("is-revealing", view === "table" && state && state.phase === "reveal");
  document.body.classList.toggle("is-voting", view === "table" && state && state.phase === "showdown");
  document.body.classList.toggle("is-summary", view === "table" && state && state.phase === "handEnd");
  syncQueueHud();
  syncDock();
  syncSheet();
  anim.syncRoulette();
  syncLive();
  anim.animate(viewChanged);
}

function syncDock() {
  if (!dock) return;
  const state = ctx.state;
  const want =
    !!state &&
    chooseView(state) === "table" &&
    state.phase === "betting" &&
    state.decision &&
    state.decision.playerId === clientId;

  if (!want) {
    anim.hideDock();
    return;
  }

  const html = actionDockHtml(state, clientId);
  const nextKey = html.match(/data-dock-key="([^"]*)"/)?.[1] || "";
  if (!ctx.dockOpen || nextKey !== ctx.dockKey) {
    ctx.dockKey = nextKey;
    dock.hidden = false;
    dock.innerHTML = html;
    document.body.classList.add("dock-open");
    anim.showDock();
  }
}

function tableDomKey(current) {
  if (!current) return "";
  const watch = isWatchingOthers() ? watchSubject().key : "play";
  const people = current.players
    .map(
      (player) =>
        `${player.id}:${player.status}:${player.acted ? 1 : 0}:${player.turn ? 1 : 0}:${player.ready ? 1 : 0}:${
          player.votedFor || ""
        }:${player.stake}:${player.owed}:${player.handDrank || 0}:${player.connected ? 1 : 0}`
    )
    .join(",");
  const vote = current.vote ? `${current.vote.total}:${current.vote.mine || ""}` : "";
  const ready = current.ready ? `${current.ready.count}:${current.ready.mine ? 1 : 0}` : "";
  return [
    current.phase,
    current.street,
    current.handNumber || 0,
    current.allInActive ? 1 : 0,
    current.promptKey || current.prompt || "",
    current.decision ? current.decision.playerId : "",
    current.decision && current.decision.allInLive ? 1 : 0,
    watch,
    people,
    current.winnerId || "",
    vote,
    ready,
    current.summary ? current.summary.totalDrank : "",
    getLocale(),
  ].join("|");
}

function syncSheet() {
  if (!sheet) return;
  if (chooseView(ctx.state) !== "table") {
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
  sheet.innerHTML = rosterSheetHtml(ctx.state, clientId);
}

function openSheet() {
  if (!ctx.state || chooseView(ctx.state) !== "table") return;
  sheetOpen = true;
  syncSheet();
  if (navigator.vibrate) navigator.vibrate(18);
  if (window.gsap) {
    const card = sheet.querySelector(".sheet-card");
    if (card) {
      gsap.from(card, {
        y: 48,
        autoAlpha: 0,
        duration: anim.motion(0.35),
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
  if (!ctx.state || ctx.state.phase !== "betting") return false;
  if (watchFlash) return true;
  return !!(ctx.state.decision && ctx.state.decision.playerId !== clientId);
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
  }, ctx.reduceMotion ? 700 : 1700);
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
    ctx.state.players.find((player) => player.turn) ||
    ctx.state.players.find((player) => ctx.state.decision && player.id === ctx.state.decision.playerId);
  return {
    mode: "wait",
    key: `wait:${turn ? turn.id : "none"}:${ctx.state.street}:${ctx.state.handNumber}`,
    nick: turn ? turn.nick : "…",
    stake: turn ? turn.stake || 0 : 0,
    playerId: turn ? turn.id : null,
  };
}

function syncQueueHud() {
  if (!queueHud) return;
  const next = queueHudHtml(ctx.state, clientId, chooseView);
  queueHud.hidden = next.hidden;
  queueHud.innerHTML = next.html;
}

function syncLive() {
  if (!ctx.state) return;
  let text = "";
  if (ctx.state.phase === "betting" && ctx.state.decision) {
    const player = ctx.state.players.find((item) => item.id === ctx.state.decision.playerId);
    text = player ? t("live.turn", { nick: player.nick }) : "";
  } else if (ctx.state.promptKey || ctx.state.prompt) text = promptText(ctx.state);
  if (live.textContent !== text) live.textContent = text;
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
  if (ctx.state && ctx.state.you.isHost && !ctx.state.you.seated) {
    socket.emit("host", { sit: true, nick });
    return;
  }
  socket.emit("join", { nick });
}

function bump(field, direction) {
  if (!ctx.state || !ctx.state.you.isHost || !ctx.state.host.settings) return;
  const settings = { ...ctx.state.settings };
  const step = field === "chambers" || field === "soplica" ? 1 : 0.5;
  const delta = direction * step;
  if (field === "entry") {
    settings.entry = Math.round((settings.entry + delta) * 2) / 2;
    settings.entry = Math.min(20, Math.max(0.5, settings.entry));
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
  if (!ctx.state) return;
  socket.emit("settings", { ...ctx.state.settings, ...patch });
}

function showToast(message) {
  if (!message) return;
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}
