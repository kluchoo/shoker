import { esc } from "./format.js";
import { t } from "./i18n.js";

export function menuHtml() {
  return `
    <section class="menu">
      <div class="menu-card">
        <h1 class="logo">Shoker</h1>
        <p class="tag">${esc(t("menu.tag"))}</p>
        <form id="enter-form">
          <input id="nick" class="nick" maxlength="16" autocomplete="nickname" placeholder="${esc(t("menu.nick"))}" />
          <div class="menu-actions">
            <button class="btn solid" type="submit">${esc(t("menu.sit"))}</button>
          </div>
        </form>
        <div class="menu-table">
          <p class="menu-table-label">${esc(t("menu.atTable"))}</p>
          <ul id="menu-players" class="menu-players"></ul>
        </div>
        <p id="menu-note" class="note" hidden></p>
      </div>
    </section>
  `;
}

export function updateMenuPlayers(state) {
  const list = document.getElementById("menu-players");
  const note = document.getElementById("menu-note");
  if (!list || !state) return;

  if (state.players.length) {
    list.innerHTML = state.players
      .map((player) => `<li class="menu-player">${esc(player.nick)}</li>`)
      .join("");
  } else {
    list.innerHTML = `<li class="menu-player is-empty">${esc(t("menu.empty"))}</li>`;
  }

  if (!note) return;
  if (state.phase !== "lobby" && state.phase !== "handEnd") {
    note.hidden = false;
    note.textContent = t("menu.gameRunning");
    return;
  }
  if (state.phase === "handEnd") {
    note.hidden = false;
    note.textContent = t("menu.handEnding");
    return;
  }
  note.hidden = true;
  note.textContent = "";
}
