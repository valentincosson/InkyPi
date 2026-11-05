import { useEffect, useState } from "react"
import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"

// Même clé que l'ancienne interface : le choix reste commun aux deux.
const STORAGE_KEY = "inkypi-theme"
type Theme = "light" | "dark"

function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "dark" || stored === "light" ? stored : null
  } catch {
    return null
  }
}

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")

export function ThemeToggle() {
  const { t } = useI18n()
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    document.documentElement.className = theme
  }, [theme])

  // Tant que rien n'a été choisi, l'interface suit le système.
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const follow = () => {
      if (!storedTheme()) setTheme(systemTheme())
    }
    media.addEventListener("change", follow)
    return () => media.removeEventListener("change", follow)
  }, [])

  const dark = theme === "dark"
  const choose = () => {
    const next = dark ? "light" : "dark"
    setTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Simple confort : le choix vaut pour cette visite.
    }
  }
  return (
    <Button variant="ghost" size="icon" className="size-10" aria-label={t(dark ? "theme.toLight" : "theme.toDark")} onClick={choose}>
      {dark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  )
}
