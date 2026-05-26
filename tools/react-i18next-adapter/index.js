import React from "react";
import defaultI18n from "i18next";

const I18nContext = React.createContext(defaultI18n);
export const initReactI18next = { type: "3rdParty", init: () => undefined };

export function I18nextProvider({ i18n, children }) {
  const [, forceRender] = React.useState(0);

  React.useEffect(() => {
    const listener = () => forceRender((value) => value + 1);
    i18n.on("languageChanged", listener);
    return () => i18n.off("languageChanged", listener);
  }, [i18n]);

  return React.createElement(I18nContext.Provider, { value: i18n }, children);
}

export function useTranslation() {
  const i18n = React.useContext(I18nContext) || defaultI18n;
  const [, forceRender] = React.useState(0);

  React.useEffect(() => {
    const listener = () => forceRender((value) => value + 1);
    i18n.on("languageChanged", listener);
    return () => i18n.off("languageChanged", listener);
  }, [i18n]);

  return {
    t: React.useCallback((key, options) => i18n.t(key, options), [i18n, i18n.language]),
    i18n,
  };
}
