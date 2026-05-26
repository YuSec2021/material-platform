const listeners = new Set();

function nestedLookup(source, key) {
  return key.split(".").reduce((current, segment) => {
    if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
      return current[segment];
    }
    return undefined;
  }, source);
}

function interpolate(value, options) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(options?.[key] ?? ""));
}

const i18n = {
  language: "zh-CN",
  options: {},
  resources: {},
  use() {
    return this;
  },
  init(options = {}) {
    this.options = options;
    this.resources = options.resources || {};
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem("ai-material-language") : "";
    this.language = stored || options.lng || options.fallbackLng || "zh-CN";
    if (typeof document !== "undefined") {
      document.documentElement.lang = this.language;
    }
    return Promise.resolve(this);
  },
  t(key, options) {
    const primary = nestedLookup(this.resources[this.language]?.translation || {}, key);
    const fallbackLanguage = this.options.fallbackLng || "zh-CN";
    const fallback = nestedLookup(this.resources[fallbackLanguage]?.translation || {}, key);
    return interpolate(primary ?? fallback ?? key, options);
  },
  changeLanguage(language) {
    this.language = language;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ai-material-language", language);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
    listeners.forEach((listener) => listener(language));
    return Promise.resolve(this);
  },
  on(event, callback) {
    if (event === "languageChanged") listeners.add(callback);
    return this;
  },
  off(event, callback) {
    if (event === "languageChanged") listeners.delete(callback);
    return this;
  },
};

export default i18n;
