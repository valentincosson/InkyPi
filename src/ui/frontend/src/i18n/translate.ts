import en from "./en.json"
import fr from "./fr.json"

export type Key = keyof typeof en
export type Language = "en" | "fr"

export const catalogs: Record<Language, Record<Key, string>> = { en, fr }

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "fr"
}

export function translate(language: Language, key: Key, params: Record<string, string> = {}) {
  const template = catalogs[language][key] ?? en[key]
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole)
}
