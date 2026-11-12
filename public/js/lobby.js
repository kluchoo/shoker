import { drinkNumber, esc, glassesHtml, minAllInForEntry } from "./format.js";
import { t } from "./i18n.js";

export function lobbyHtml(state, clientId) {
  const host = state.you.isHost;
  const chambers = state.settings.chambers;
  const curve = [0, 1, 2, 3]
    .map((step) => `${Math.round(((chambers - Math.min(step, chambers)) / chambers) * 100)}%`)
    .join(" · ");
  return `
    <section class="lobby">
      <div class="lobby-top">
        <p class="kicker">${esc(host ? t("lobby.kickerHost") : t("lobby.kickerGuest"))}</p>
        <h2 class="lobby-title">${esc(t("lobby.atTableCount", { n: state.players.length }))}</h2>
      </div>
      ${shareBlock(state)}
      <div class="people">
        ${
          state.players
            .map((player, index) => personHtml(state, player, index, clientId, host))
            .join("") || `<p class="hint">${esc(t("lobby.empty"))}</p>`
        }
      </div>
      ${
        host && !state.you.seated
          ? `
        <form id="seat-form" class="stack">
          <input id="seat-nick" class="nick" maxlength="16" placeholder="${esc(t("lobby.seatNick"))}" />
          <button class="btn ghost" type="submit">${esc(t("lobby.seatToo"))}</button>
        </form>
      `
          : ""
      }
      ${host ? settingsHtml(state) : stakesHtml(state)}
      <p class="curve">${esc(t("lobby.curve", { curve, soplica: state.settings.soplica }))}</p>
      ${
        host
          ? `<button class="btn solid" type="button" data-act="start" ${state.host.start ? "" : "disabled"}>${esc(t("lobby.start"))}</button>`
          : `<p class="hint">${esc(t("lobby.waitStart"))}</p>`
      }
      ${host && state.players.length < 2 ? `<p class="hint">${esc(t("lobby.needTwo"))}</p>` : ""}
    </section>
  `;
}

function shareBlock(state) {
  if (!state.urls || !state.urls.length) return "";
  return `
    <div class="lobby-share">
      <p class="kicker">${esc(t("lobby.share"))}</p>
      <div class="urls">
        ${state.urls
          .map(
            (item) => `
          <div class="url-card">
            ${item.qr ? `<img alt="${esc(t("lobby.qr"))}" src="${item.qr}" />` : "<div></div>"}
            <div>
              <a href="${esc(item.url)}">${esc(item.url)}</a>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      <p class="hint">${esc(t("lobby.wifi"))}</p>
    </div>
  `;
}

function personHtml(state, player, index, clientId, host) {
  const meta = [
    player.connected ? t("lobby.present") : t("lobby.offline"),
    player.id === clientId ? t("lobby.you") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `
    <div class="person seat">
      <div class="seat-head">
        <div class="avatar">${esc(player.nick.slice(0, 1))}</div>
        <div>
          <b>${esc(player.nick)}</b>
          <small>${esc(meta)}</small>
        </div>
        ${
          host
            ? `
          <div class="icon-row">
            <button type="button" data-act="up" data-id="${esc(player.id)}" ${index === 0 || !state.host.reorder ? "disabled" : ""}>▲</button>
            <button type="button" data-act="down" data-id="${esc(player.id)}" ${index === state.players.length - 1 || !state.host.reorder ? "disabled" : ""}>▼</button>
            <button type="button" data-act="kick" data-id="${esc(player.id)}">${esc(t("lobby.kick"))}</button>
          </div>
        `
            : ""
        }
      </div>
      ${drinkBlock(state, player)}
    </div>
  `;
}

export function drinkBlock(state, player) {
  const stake = player.stake || 0;
  const owed = player.owed || 0;
  const live = player.inHand && state.phase !== "lobby" && state.phase !== "handEnd";
  if (live) {
    return `
      <div class="owed" data-owed-id="stake-${esc(player.id)}" data-owed="${stake}">
        ${glassesHtml(stake)}
        <small class="sipped">${esc(t("drink.stake"))}${
          owed > 0 ? esc(t("drink.sipped", { n: drinkNumber(owed) })) : ""
        }</small>
      </div>
    `;
  }
  return `<div class="owed" data-owed-id="${esc(player.id)}" data-owed="${owed}">${glassesHtml(owed)}</div>`;
}

export function settingsHtml(state) {
  const settings = state.settings;
  const minAllIn = minAllInForEntry(settings.entry);
  const finalEntry = settings.finalEntry != null ? settings.finalEntry : settings.entry;
  return `
    <div class="stack" style="margin-top:16px">
      ${stepper(state, "entry", t("settings.entry"), glassesHtml(settings.entry, 5), settings.entry <= 0.5, settings.entry >= 20)}
      ${stepper(state, "finalEntry", t("settings.finalEntry"), glassesHtml(finalEntry, 5), finalEntry <= 0.5, finalEntry >= 20)}
      ${stepper(state, "allIn", t("settings.allIn"), glassesHtml(settings.allIn, 5), settings.allIn <= minAllIn, settings.allIn >= 60)}
      ${stepper(state, "chambers", t("settings.chambers"), String(settings.chambers), settings.chambers <= 5, settings.chambers >= 12)}
      <label>
        <span id="soplica-readout">${esc(t("settings.soplica", { n: settings.soplica }))}</span>
        <input id="soplica" class="slider" type="range" min="0" max="100" value="${settings.soplica}" ${
          state.host.settings ? "" : "disabled"
        } />
      </label>
    </div>
  `;
}

function stepper(state, field, title, value, minusOff, plusOff) {
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

export function stakesHtml(state) {
  const finalEntry = state.settings.finalEntry != null ? state.settings.finalEntry : state.settings.entry;
  return `
    <div class="stakes">
      <div><span>${esc(t("stakes.entry"))}</span>${glassesHtml(state.settings.entry, 5)}</div>
      <div><span>${esc(t("stakes.fullBoard"))}</span>${glassesHtml(finalEntry, 5)}</div>
      <div><span>${esc(t("stakes.allIn"))}</span>${glassesHtml(state.settings.allIn, 5)}</div>
    </div>
    <p class="hint">${esc(
      t("stakes.hint", { chambers: state.settings.chambers, soplica: state.settings.soplica })
    )}</p>
  `;
}
