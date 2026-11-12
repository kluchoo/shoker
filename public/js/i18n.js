import pl from "./locales/pl.js";
import en from "./locales/en.js";

const LOCALES = { pl, en };
const FLAGS = { pl: "🇵🇱", en: "🇬🇧" };
const STORAGE_KEY = "shoker-lang";

let locale = loadLocale();
let onChange = () => {};

function loadLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LOCALES[saved]) return saved;
  } catch (_error) {
    /* ignore */
  }
  return "pl";
}

export function getLocale() {
  return locale;
}

export function listLocales() {
  return Object.keys(LOCALES).map((code) => ({
    code,
    flag: FLAGS[code] || code,
    label: t(`lang.${code}`),
  }));
}

export function flagFor(code = locale) {
  return FLAGS[code] || code;
}

export function setLocale(next) {
  if (!LOCALES[next] || next === locale) return locale;
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch (_error) {
    /* ignore */
  }
  onChange(locale);
  return locale;
}

export function onLocaleChange(fn) {
  onChange = typeof fn === "function" ? fn : () => {};
}

export function t(key, params) {
  const table = LOCALES[locale] || pl;
  let text = table[key] ?? pl[key] ?? key;
  if (params) {
    text = String(text).replace(/\{(\w+)\}/g, (_, name) =>
      params[name] == null ? "" : String(params[name])
    );
  }
  return text;
}

export function drinkWord(amount) {
  const rounded = Math.round(Number(amount) * 2) / 2;
  if (!Number.isInteger(rounded)) return t("drinks.fraction");
  if (rounded === 1) return t("drinks.one");
  if (locale === "pl") {
    if (rounded % 10 >= 2 && rounded % 10 <= 4 && (rounded % 100 < 10 || rounded % 100 >= 20)) {
      return t("drinks.few");
    }
    return t("drinks.many");
  }
  return rounded === 1 ? t("drinks.one") : t("drinks.many");
}

export function serverMessage(payload) {
  if (!payload) return "";
  if (payload.code) {
    const key = payload.code.startsWith("err.") ? payload.code : `err.${payload.code}`;
    const translated = t(key, payload.params || undefined);
    if (translated !== key) return translated;
  }
  return payload.message || "";
}

export function promptText(state) {
  if (!state) return "";
  if (state.promptKey) return t(state.promptKey, state.promptParams || undefined);
  return state.prompt || "";
}

export function streetText(state) {
  if (!state) return "";
  if (state.streetNameKey) return t(state.streetNameKey);
  return state.streetName || "";
}
