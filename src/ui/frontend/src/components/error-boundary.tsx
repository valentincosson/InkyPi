import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"

function Fallback() {
  const { t } = useI18n()
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center" role="alert">
      <h1 className="text-[1.625rem] leading-tight font-semibold">{t("crash.title")}</h1>
      <p className="mt-1 text-muted-foreground">{t("crash.body")}</p>
      <Button className="mt-4 min-h-10" onClick={() => location.reload()}>{t("crash.reload")}</Button>
    </main>
  )
}

/** Évite une page blanche si une erreur inattendue survient dans l'interface. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <Fallback /> : this.props.children
  }
}
