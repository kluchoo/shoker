import { drinkNumber, esc, glassesHtml, nextGlassSeq, pickLine, waitLineFor } from "./format.js";
import { getLocale, promptText, streetText, t } from "./i18n.js";
import { settingsHtml } from "./lobby.js";

export function boardRevealed(street) {
  const step = Math.max(0, Math.min(3, Number(street) || 0));
  if (step <= 0) return 0;
  if (step === 1) return 3;
  if (step === 2) return 4;
  return 5;
}

export function drinkOdds(state, clientId) {
  const den = state.settings.chambers;
  const streetLoaded = Math.min(state.street || 0, den);
  const streetPct = den ? Math.round((streetLoaded / den) * 100) : 0;
  const allInPct = Math.max(0, Math.min(100, Math.round(100 - state.settings.soplica)));
  const mine = state.decision && state.decision.playerId === clientId;
  const decidingIntoAllIn = !!(mine && state.decision.allInLive);
  const useAllIn = !!(state.allInActive && !decidingIntoAllIn);
  const pct = useAllIn ? allInPct : streetPct;
  let note = t("odds.note");
  if (useAllIn && state.settings.soplica > 0) {
    note = t("odds.noteSoplica", { n: state.settings.soplica });
  } else if (useAllIn) {
    note = t("odds.noteAllIn");
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

function revealLine(state) {
  return t(pickLine(["reveal.0", "reveal.1", "reveal.2"], `${state.handNumber}:${state.street}:reveal`));
}

function boardHtml(state) {
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
      <div class="board-row" aria-label="${esc(t("table.boardAria", { open: revealed, hidden: 5 - revealed }))}">
        ${cards.join("")}
      </div>
      <p class="board-count">${t("table.boardOpen", { open: revealed, hidden: 5 - revealed })}</p>
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

function myStakeHtml(state, clientId) {
  const me = state.players.find((player) => player.id === clientId);
  const stake = me ? me.stake || 0 : 0;
  return `
    <div class="my-stake" data-owed-id="mine-stake" data-owed="${stake}">
      <span class="my-stake-label">${esc(t("table.yourPot"))}</span>
      ${glassesHtml(stake)}
    </div>
  `;
}

export function playerStatus(player) {
  if (player.winner) return t("status.wins");
  if (!player.inHand) return t("status.nextHand");
  if (player.status === "folded") return t("status.fold");
  if (player.status === "allin") return t("status.allin");
  if (player.turn) return t("status.turn");
  if (player.status === "waiting") return t("status.waiting");
  return t("status.in");
}

export function rosterSheetHtml(state, clientId) {
  return `
    <div class="sheet-backdrop" data-sheet="close"></div>
    <div class="sheet-card" role="dialog" aria-label="${esc(t("sheet.title"))}">
      <div class="sheet-handle"></div>
      <div class="sheet-top">
        <div>
          <p class="kicker">${esc(t("sheet.atTable"))}</p>
          <h2>${esc(t("sheet.players", { n: state.players.length }))}</h2>
        </div>
        <button class="sheet-close" type="button" data-sheet="close" aria-label="${esc(t("sheet.close"))}">✕</button>
      </div>
      <div class="sheet-list">
        ${state.players
          .map((player, index) => {
            const live = player.inHand && state.phase !== "lobby" && state.phase !== "handEnd";
            const amount = live ? player.stake || 0 : player.owed || 0;
            const amountLabel = live ? t("sheet.stake") : t("sheet.drank");
            let meta = playerStatus(player);
            if (!player.connected) meta += ` · ${t("lobby.offline")}`;
            if (player.dealer) meta += ` · ${t("status.deals")}`;
            if (player.id === clientId) meta += ` · ${t("lobby.you")}`;
            return `
            <div class="sheet-row${player.turn ? " is-turn" : ""}${player.status === "folded" ? " is-folded" : ""}${
              state.you.isHost ? " has-host" : ""
            }">
              <div class="avatar">${esc(player.nick.slice(0, 1))}</div>
              <div class="sheet-row-main">
                <b>${esc(player.nick)}</b>
                <small>${esc(meta)}</small>
              </div>
              <div class="sheet-row-stake" data-owed-id="sheet-${esc(player.id)}" data-owed="${amount}">
                <span>${esc(amountLabel)}</span>
                ${glassesHtml(amount)}
              </div>
              ${
                state.you.isHost
                  ? `
                <div class="icon-row">
                  <button type="button" data-act="up" data-id="${esc(player.id)}" ${
                      index === 0 || !state.host.reorder ? "disabled" : ""
                    }>▲</button>
                  <button type="button" data-act="down" data-id="${esc(player.id)}" ${
                      index === state.players.length - 1 || !state.host.reorder ? "disabled" : ""
                    }>▼</button>
                  <button class="text-btn" type="button" data-act="kick" data-id="${esc(player.id)}">${esc(
                    t("lobby.kick")
                  )}</button>
                </div>
              `
                  : ""
              }
            </div>
          `;
          })
          .join("")}
      </div>
      ${state.you.isHost && state.host.settings ? settingsHtml(state) : ""}
    </div>
  `;
}

function watchActionLabel(action) {
  if (action === "fold") return t("watch.fold");
  if (action === "allin") return t("watch.allin");
  return t("watch.enter");
}

function pourSvg() {
  const seq = nextGlassSeq();
  const clip = `pour-shot-${seq}`;
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
      <p class="pour-label">${esc(t("watch.pouring"))}</p>
    </div>
  `;
}

export function watchPanelHtml(state, subject) {
  const waiting = subject.mode === "wait";
  const line = waiting
    ? waitLineFor(subject.nick, subject.key)
    : t(pickLine(["watch.done0", "watch.done1", "watch.done2"], subject.key));
  return `
    <div class="watch" data-watch-mode="${esc(subject.mode)}" data-watch-key="${esc(subject.key)}">
      <p class="watch-kicker">${esc(waiting ? t("watch.waiting") : t("watch.decision"))}</p>
      <h2 class="watch-nick">${esc(subject.nick)}</h2>
      <p class="watch-line">${esc(line)}</p>
      <div class="watch-stake" data-owed-id="watch-stake-${esc(subject.playerId || "x")}" data-owed="${subject.stake}">
        <span>${esc(t("watch.pot"))}</span>
        ${glassesHtml(subject.stake)}
      </div>
      <div class="watch-stage">
        ${
          waiting
            ? pourSvg()
            : `
          <div class="watch-verdict watch-verdict-${esc(subject.action)}">
            <p class="watch-verdict-label">${esc(watchActionLabel(subject.action))}</p>
            ${
              subject.action === "fold"
                ? ""
                : `<div class="watch-verdict-glasses">${glassesHtml(subject.stake)}</div>`
            }
          </div>
        `
        }
      </div>
      ${
        state.you.isHost && state.host.skip && waiting
          ? `<button class="btn ghost watch-skip" type="button" data-act="skip">${esc(t("watch.skip"))}</button>`
          : ""
      }
    </div>
  `;
}

function tableMeta(state) {
  return `
    <div class="meta">
      <span class="pill">${esc(t("table.hand", { n: state.handNumber || "—" }))}</span>
      <span class="pill">${esc(streetText(state))}</span>
      <button class="roster-btn" type="button" data-roster aria-label="${esc(t("table.rosterHint"))}">
        <span class="roster-dots" aria-hidden="true"></span>
        ${esc(t("table.roster"))}
      </button>
    </div>
  `;
}

function votePanelHtml(state) {
  const vote = state.vote || {
    need: 1,
    needPct: 60,
    total: 0,
    voters: state.players.length,
    counts: {},
    mine: null,
  };
  const title = t(pickLine(["vote.0", "vote.1", "vote.2"], `${state.handNumber}:vote`));
  return `
    <div class="end-panel vote-panel">
      <p class="end-kicker">${esc(t("vote.kicker"))}</p>
      <h2 class="end-title">${esc(title)}</h2>
      <p class="end-sub">${esc(
        t("vote.sub", {
          needPct: vote.needPct,
          total: vote.total,
          voters: vote.voters,
          need: vote.need,
        })
      )}</p>
      <div class="vote-list">
        ${(state.alive || [])
          .map((player) => {
            const count = (vote.counts && vote.counts[player.id]) || 0;
            const mine = vote.mine === player.id;
            const pct = vote.voters ? Math.round((count / vote.voters) * 100) : 0;
            return `
              <button class="vote-card${mine ? " is-mine" : ""}" type="button" data-act="winner" data-id="${esc(
                player.id
              )}">
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

function summaryPanelHtml(state, clientId) {
  const summary = state.summary;
  const ready = state.ready || { count: 0, total: state.players.length, mine: false };
  const me = summary
    ? summary.players.find((player) => player.id === clientId)
    : state.players.find((player) => player.id === clientId);
  const myDrank = me ? me.drank || me.handDrank || 0 : 0;
  const myOwed = me ? me.owed || 0 : 0;
  const total = summary ? summary.totalDrank : state.players.reduce((sum, p) => sum + (p.handDrank || 0), 0);
  const rows = summary ? summary.players : state.players;
  const champ = summary && summary.winnerNick ? summary.winnerNick : t("summary.nobody");
  return `
    <div class="end-panel summary-panel">
      <p class="end-kicker">${esc(t("summary.kicker"))}</p>
      <h2 class="end-title">${esc(champ)} W</h2>
      <p class="end-sub">${esc(
        t("summary.sub", {
          hand: summary ? summary.handNumber : state.handNumber,
          total: drinkNumber(total),
        })
      )}</p>
      <div class="summary-hero" data-owed-id="summary-mine" data-owed="${myDrank}">
        <span class="summary-hero-label">${esc(t("summary.youThisHand"))}</span>
        <div class="summary-hero-num">${glassesHtml(myDrank)}</div>
        <span class="summary-hero-owed">${esc(t("summary.owedTotal", { n: drinkNumber(myOwed) }))}</span>
      </div>
      <div class="summary-list">
        ${rows
          .map((player) => {
            const drank = player.drank != null ? player.drank : player.handDrank || 0;
            const owed = player.owed || 0;
            const flags = [];
            if (player.winner) flags.push("W");
            if (player.folded) flags.push(t("status.fold"));
            if (player.allin) flags.push(t("status.allin"));
            const readyPlayer = state.players.find((item) => item.id === player.id);
            if (readyPlayer && readyPlayer.ready) flags.push("ready");
            return `
              <div class="summary-row${player.id === clientId ? " is-you" : ""}${
                player.winner ? " is-winner" : ""
              }">
                <div>
                  <b>${esc(player.nick)}</b>
                  <small>${flags.length ? esc(flags.join(" · ")) : esc(t("summary.clean"))}</small>
                </div>
                <div class="summary-row-stats">
                  <span>${esc(t("summary.now", { n: drinkNumber(drank) }))}</span>
                  <span>${esc(t("summary.total", { n: drinkNumber(owed) }))}</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="summary-ready">
        <p class="end-sub">${esc(
          t("summary.readyHint", { count: ready.count, total: ready.total })
        )}</p>
        <button class="btn solid" type="button" data-act="ready" ${ready.mine ? "disabled" : ""}>
          ${esc(ready.mine ? t("summary.readyMine") : t("summary.readyBtn"))}
        </button>
        ${
          state.you.isHost
            ? `<button class="btn ghost" type="button" data-act="next">${esc(t("summary.force"))}</button>`
            : ""
        }
      </div>
    </div>
  `;
}

function headlineHtml(state, turn, mine, clientId) {
  if (state.phase === "reveal" || state.phase === "showdown" || state.phase === "handEnd") {
    return `<h2 class="prompt">${esc(promptText(state))}</h2>`;
  }
  if (state.phase === "roulette" && state.roulette) {
    return `<p class="who">${esc(t("headline.spin"))}</p><h2 class="name">${esc(state.roulette.nick)}</h2>`;
  }
  if (!turn) return `<h2 class="prompt">${esc(t("headline.chill"))}</h2>`;
  if (mine) {
    return `
      <p class="who">${esc(t("headline.yourMove"))}</p>
      <h2 class="name">${esc(turn.nick)}</h2>
    `;
  }
  return `
    <p class="who">${esc(t("headline.queue"))}</p>
    <h2 class="name">${esc(turn.nick)}</h2>
    <p class="hint">${esc(waitLineFor(turn.nick, `${turn.id}:${state.street}:${state.handNumber}`))}</p>
  `;
}

export function actionDockHtml(state, clientId) {
  const decision = state.decision;
  if (!decision) return "";
  const odds = drinkOdds(state, clientId);
  const safePct =
    decision.safePct != null
      ? decision.safePct
      : decision.safeDen
        ? Math.round((decision.safeNum / decision.safeDen) * 100)
        : 0;
  const enterLabel = decision.allInLive
    ? t("dock.fullCylinder")
    : decision.isFinalStreet
      ? t("dock.fullBoard")
      : t("dock.toStake");
  const enterPct = decision.allInLive ? odds.allInPct : odds.streetPct;
  const mode = decision.canAllIn ? "has-allin" : "two";
  return `
    <div class="dock-panel" data-dock-key="${esc(
      `${getLocale()}:${decision.playerId}:${decision.addAmount}:${decision.allInLive ? 1 : 0}:${state.settings.allIn}:${enterPct}:${safePct}`
    )}">
      <div class="dock-glow" aria-hidden="true"></div>
      <p class="dock-kicker">${esc(t("headline.yourMove"))}</p>
      <div class="actions ${mode}">
        <button class="act fold" type="button" data-act="fold">
          <span class="act-label">${esc(t("dock.fold"))}</span>
          <span class="act-meta">
            <span class="act-chip safe">${esc(t("dock.safeExit", { pct: safePct }))}</span>
          </span>
        </button>
        <button class="act enter" type="button" data-act="enter">
          <span class="act-label">${esc(t("dock.enter"))}</span>
          <span class="act-mid">${glassesHtml(decision.addAmount, 4)}</span>
          <span class="act-meta">
            <span class="act-chip">${esc(enterLabel)}</span>
            <span class="act-chip risk">${enterPct}%</span>
          </span>
        </button>
        ${
          decision.canAllIn
            ? `
          <button class="act allin" type="button" data-act="allin">
            <span class="act-label">${esc(t("dock.allin"))}</span>
            <span class="act-mid">${glassesHtml(state.settings.allIn, 4)}</span>
            <span class="act-meta">
              <span class="act-chip risk">${esc(t("dock.riskPct", { pct: odds.allInPct }))}</span>
            </span>
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function hostControls(state, clientId) {
  if (state.phase === "showdown" || state.phase === "handEnd") return "";
  if (state.you.isHost && state.host.skip && state.decision && state.decision.playerId !== clientId) {
    return `<button class="btn ghost" type="button" data-act="skip">${esc(t("watch.skip"))}</button>`;
  }
  return "";
}

export function tableHtml(state, clientId, helpers) {
  const turn = state.players.find((player) => player.turn);
  const mine = !!(state.decision && state.decision.playerId === clientId);
  const watching = helpers.isWatchingOthers();
  const revealing = state.phase === "reveal";
  const voting = state.phase === "showdown";
  const summarizing = state.phase === "handEnd";
  const headline = headlineHtml(state, turn, mine, clientId);
  const odds = drinkOdds(state, clientId);
  const showBoard =
    state.phase === "betting" ||
    state.phase === "reveal" ||
    state.phase === "showdown" ||
    state.phase === "roulette" ||
    state.phase === "handEnd";
  const showPlayBits = showBoard && !revealing && !watching && !voting && !summarizing;
  const body = summarizing
    ? summaryPanelHtml(state, clientId)
    : voting
      ? `
        ${showBoard ? boardHtml(state) : ""}
        ${votePanelHtml(state)}
      `
      : `
        ${showBoard ? boardHtml(state) : ""}
        ${revealing ? `<p class="reveal-line">${esc(revealLine(state))}</p>` : ""}
        ${showPlayBits ? oddsHtml(odds) : ""}
        ${showPlayBits ? myStakeHtml(state, clientId) : ""}
        ${watching ? watchPanelHtml(state, helpers.watchSubject()) : revealing ? "" : headline}
        ${watching || revealing ? "" : hostControls(state, clientId)}
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
      <div class="stage${watching ? " stage-watch" : ""}${revealing ? " stage-reveal" : ""}${
        voting ? " stage-vote" : ""
      }${summarizing ? " stage-summary" : ""}">
        ${tableMeta(state)}
        <div class="stage-main">${body}</div>
      </div>
    </section>
  `;
}

export function queueHudHtml(state, clientId, chooseView) {
  if (!state || chooseView(state) !== "table") return { hidden: true, html: "" };
  if (state.phase === "reveal") {
    return {
      hidden: false,
      html: `
      <div class="queue-chip is-break" aria-label="${esc(t("queue.resetAria"))}">
        <span class="queue-chip-now">${esc(t("queue.reset"))}</span>
      </div>
    `,
    };
  }
  const pending = streetQueue(state);
  if (!pending.length) return { hidden: true, html: "" };
  const now = pending[0];
  const rest = pending.slice(1, 3);
  const more = Math.max(0, pending.length - 3);
  return {
    hidden: false,
    html: `
    <div class="queue-chip" aria-label="${esc(t("queue.aria"))}">
      <span class="queue-chip-label">${esc(t("queue.label"))}</span>
      <span class="queue-chip-now">${esc(now.nick)}${now.id === clientId ? ` · ${esc(t("lobby.you"))}` : ""}</span>
      ${
        rest.length || more
          ? `<span class="queue-chip-next">${rest.map((p) => esc(p.nick)).join(" · ")}${
              more ? ` +${more}` : ""
            }</span>`
          : ""
      }
    </div>
  `,
  };
}

function streetQueue(state) {
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
