import { drinkWord, t } from "./i18n.js";

let glassSeq = 0;

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char])
  );
}

export function drinkNumber(amount) {
  const rounded = Math.round(Number(amount) * 2) / 2;
  if (!Number.isFinite(rounded)) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

export function labelDrinks(amount) {
  const rounded = Math.round(Number(amount) * 2) / 2;
  return `${drinkNumber(rounded)} ${drinkWord(rounded)}`;
}

export function shotSvg(level) {
  glassSeq += 1;
  const id = `cup${glassSeq}`;
  const y = level >= 1 ? 16 : level >= 0.5 ? 26 : 42;
  return `<svg class="shot" viewBox="0 0 32 44" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="M8 6h16l-1.4 24.4A6.4 6.4 0 0 1 16.2 36h-.4a6.4 6.4 0 0 1-6.4-5.6z"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect class="liquid" x="6" y="${y}" width="20" height="32"/></g>
    <path class="cup" d="M7 4.5h18l-1.6 25.2a7 7 0 0 1-7 6.2h-.8a7 7 0 0 1-7-6.2z"/>
  </svg>`;
}

export function glassesHtml(amount, max = 6) {
  const rounded = Math.max(0, Math.round(Number(amount) * 2) / 2 || 0);
  const full = Math.floor(rounded);
  const half = rounded - full >= 0.5;
  const shots = [];
  if (rounded === 0) shots.push(shotSvg(0));
  for (let i = 0; i < full && shots.length < max; i += 1) shots.push(shotSvg(1));
  if (half && shots.length < max) shots.push(shotSvg(0.5));
  return `<span class="glasses" aria-label="${esc(labelDrinks(rounded))}">${shots.join("")}<em>${drinkNumber(rounded)}</em></span>`;
}

export function nextGlassSeq() {
  glassSeq += 1;
  return glassSeq;
}

export function pickLine(list, seed) {
  if (!list.length) return "";
  let hash = 0;
  const key = String(seed || "");
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return list[hash % list.length];
}

export function waitLineFor(nick, seed) {
  const keys = ["wait.0", "wait.1", "wait.2", "wait.3", "wait.4", "wait.5"];
  return t(pickLine(keys, seed), { nick });
}

export function minAllInForEntry(entry) {
  return Math.round(Number(entry) * 3 * 2) / 2;
}
