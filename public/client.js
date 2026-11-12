"use strict";

const root = document.getElementById("root");
const overlay = document.getElementById("overlay");
const toast = document.getElementById("toast");
const net = document.getElementById("net");
const live = document.getElementById("live");
const muteBtn = document.getElementById("mute");

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
let reduceMotion = false;

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
  state = next;
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
  const readout = document.getElementById("soplica-readout");
  if (readout) readout.textContent = `Soplica ${event.target.value}%`;
});
root.addEventListener("change", (event) => {
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
    root.innerHTML = tableHtml();
    const log = document.getElementById("log");
    if (log) log.scrollTop = log.scrollHeight;
  }
  syncRoulette();
  syncLive();
  animate(viewChanged);
}

function menuHtml() {
  return `
    <section class="menu">
      <div class="menu-card">
        <h1 class="logo">Shoker</h1>
        <p class="tag">Karty na stole. Kieliszki tutaj.</p>
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
    .map((step) => `${chambers - Math.min(step, chambers)}/${chambers}`)
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
        <p class="curve">Nie pić: ${curve}. All-in: całe koło, potem ukryty los Soplicy ${state.settings.soplica}%.</p>
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
  return `
    <div class="stack" style="margin-top:16px">
      ${stepper("entry", "Wejście", glassesHtml(settings.entry, 5), settings.entry <= 0.5, settings.entry >= 20)}
      ${stepper("allIn", "All-in", glassesHtml(settings.allIn, 5), settings.allIn <= minAllIn, settings.allIn >= 60)}
      ${stepper("chambers", "Komory", String(settings.chambers), settings.chambers <= 2, settings.chambers >= 12)}
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
  return `
    <div class="stakes">
      <div><span>Wejście</span>${glassesHtml(state.settings.entry, 5)}</div>
      <div><span>All-in</span>${glassesHtml(state.settings.allIn, 5)}</div>
    </div>
    <p class="hint">Zwykły los /${state.settings.chambers}. All-in wypełnia całe koło, Soplica ${state.settings.soplica}% jest drugim, ukrytym losem.</p>
  `;
}

function tableHtml() {
  const turn = state.players.find((player) => player.turn);
  const mine = state.decision && state.decision.playerId === clientId;
  const headline = headlineHtml(turn, mine);
  return `
    <section class="table-layout">
      <div>
        <div class="stage">
          <div class="meta">
            <span class="pill">Rozdanie ${state.handNumber || "—"}</span>
            <span class="pill">${esc(state.streetName)}</span>
            ${state.phase === "betting" || state.phase === "reveal" ? `<span class="pill">${state.allInActive ? "All-in: całe koło" : `Nie pić ${state.risk.safeNum}/${state.risk.den}`}</span>` : ""}
          </div>
          <div class="stake-row">
            <div><span>Wejście</span>${glassesHtml(state.settings.entry, 4)}</div>
            <div><span>All-in</span>${glassesHtml(state.settings.allIn, 4)}</div>
          </div>
          ${headline}
          ${hostControls()}
        </div>
        ${mine && state.phase === "betting" ? actionDock() : ""}
      </div>
      <div class="panel">
        <p class="kicker">Stół</p>
        <div class="seats">
          ${state.players.map((player, index) => seatHtml(player, index)).join("")}
        </div>
        ${state.you.isHost && state.host.settings ? settingsHtml() : ""}
        <div id="log" class="log" style="margin-top:14px">
          ${state.log.map((line) => `<span>${esc(line)}</span>`).join("")}
        </div>
      </div>
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
    let extra = "";
    if (state.phase === "reveal" && state.risk.nextNum != null) {
      const safe = state.settings.chambers - state.risk.nextNum;
      extra = `<p class="hint">Po odkryciu nie pić: ${safe}/${state.settings.chambers}</p>`;
    }
    return `<h2 class="prompt">${esc(state.prompt || "")}</h2>${extra}`;
  }
  if (state.phase === "roulette" && state.roulette) {
    return `<p class="who">Ruletka</p><h2 class="name">${esc(state.roulette.nick)}</h2>`;
  }
  if (!turn) return `<h2 class="prompt">Czekaj</h2>`;
  return `
    <p class="who">${mine ? "Twoja kolej" : "Kolej"}</p>
    <h2 class="name">${esc(turn.nick)}</h2>
    ${mine ? "" : `<p class="hint">Przyciski ma tylko ${esc(turn.nick)}.</p>`}
  `;
}

function actionDock() {
  const decision = state.decision;
  const safe = `${decision.safeNum}/${decision.safeDen}`;
  const enter = decision.allInLive ? "całe koło" : "do stawki";
  return `
    <div class="dock">
      <div class="actions ${decision.canAllIn ? "has-allin" : "two"}">
        <button class="act enter" type="button" data-act="enter"><b>WEJDŹ</b><small>${glassesHtml(decision.addAmount, 4)}<span>${esc(enter)}</span></small></button>
        <button class="act fold" type="button" data-act="fold"><b>PAS</b><small><span>nie pić ${esc(safe)}</span></small></button>
        ${decision.canAllIn ? `<button class="act allin" type="button" data-act="allin"><b>ALL-IN</b><small>${glassesHtml(state.settings.allIn, 4)}<span>całe koło</span></small></button>` : ""}
      </div>
    </div>
  `;
}

function hostControls() {
  if (!state.you.isHost) {
    if (state.phase === "showdown") return `<p class="hint">Host wskazuje, kto wygrał.</p>`;
    return "";
  }
  if (state.phase === "reveal") {
    return `<button class="btn solid" type="button" data-act="reveal">Karty odkryte</button>`;
  }
  if (state.phase === "showdown") {
    return `
      <p class="hint">Kto wygrywa?</p>
      <div class="winner-list">
        ${state.alive.map((player) => `<button class="btn" type="button" data-act="winner" data-id="${esc(player.id)}">${esc(player.nick)}</button>`).join("")}
      </div>
    `;
  }
  if (state.phase === "handEnd") {
    return `<button class="btn solid" type="button" data-act="next">Nowe rozdanie</button>`;
  }
  if (state.host.skip && state.decision && state.decision.playerId !== clientId) {
    return `<button class="btn ghost" type="button" data-act="skip">Pomiń kolejkę</button>`;
  }
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
  } else if (field === "allIn") {
    const minAllIn = minAllInForEntry(settings.entry);
    settings.allIn = Math.round((settings.allIn + delta) * 2) / 2;
    settings.allIn = Math.min(60, Math.max(minAllIn, settings.allIn));
  } else if (field === "chambers") {
    settings.chambers = Math.min(12, Math.max(2, settings.chambers + delta));
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
    hint.textContent = `nie pić ${spin.chambers - spin.loaded}/${spin.chambers}`;
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
