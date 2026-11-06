import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { isLanguage, translate, type Key, type Language } from "./translate"

const STORAGE_KEY = "inkypi-lang"

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // Stockage indisponible : on garde l'anglais.
  }
  return "en"
}

type I18n = { language: Language; setLanguage: (language: Language) => void; t: (key: Key, params?: Record<string, string>) => string }

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage)
  useEffect(() => {
    document.documentElement.lang = language
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // Simple confort.
    }
  }, [language])
  const value = useMemo<I18n>(() => ({ language, setLanguage, t: (key, params) => translate(language, key, params) }), [language])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used inside I18nProvider")
  return value
}
