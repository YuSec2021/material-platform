export type Resource = Record<string, { translation: Record<string, unknown> }>;

export interface InitOptions {
  resources?: Resource;
  lng?: string;
  fallbackLng?: string;
  interpolation?: { escapeValue?: boolean };
}

export interface i18n {
  language: string;
  init(options?: InitOptions): Promise<i18n>;
  use(plugin: unknown): i18n;
  t(key: string, options?: Record<string, unknown>): string;
  changeLanguage(language: string): Promise<i18n>;
  on(event: "languageChanged", callback: (language: string) => void): i18n;
  off(event: "languageChanged", callback: (language: string) => void): i18n;
}

declare const i18next: i18n;
export default i18next;
