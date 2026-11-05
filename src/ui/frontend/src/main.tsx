import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { Route, Router, Switch } from "wouter"
import "./index.css"
import { ErrorBoundary } from "@/components/error-boundary"
import { Loading } from "@/components/page-state"
import { RouteFocus } from "@/components/route-focus"
import { I18nProvider } from "@/i18n"
import { NotFoundPage } from "@/pages/not-found"
import { ScreenPage } from "@/pages/screen"

// Chargées à la demande : l'écran principal reste léger.
const SettingsPage = lazy(() => import("@/pages/settings").then(({ SettingsPage }) => ({ default: SettingsPage })))
const ApiKeysPage = lazy(() => import("@/pages/api-keys").then(({ ApiKeysPage }) => ({ default: ApiKeysPage })))

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <Router base="/ui">
          <RouteFocus />
          <Suspense fallback={<div className="p-5"><Loading /></div>}>
            <Switch>
              <Route path="/" component={ScreenPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/api-keys" component={ApiKeysPage} />
              <Route component={NotFoundPage} />
            </Switch>
          </Suspense>
        </Router>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)
