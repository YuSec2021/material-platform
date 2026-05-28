import type { ReactNode } from "react";
import type { i18n } from "i18next";

export const initReactI18next: unknown;

export function I18nextProvider(props: {
  i18n: i18n;
  children: ReactNode;
}): JSX.Element;

export function useTranslation(): {
  t: (key: string, options?: Record<string, unknown>) => string;
  i18n: i18n;
};
