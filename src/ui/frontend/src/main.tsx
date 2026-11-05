import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Route, Router, Switch } from "wouter"
import "./index.css"
import { ErrorBoundary } from "@/components/error-boundary"
import { RouteFocus } from "@/components/route-focus"
import { I18nProvider } from "@/i18n"
import { NotFoundPage } from "@/pages/not-found"
import { ScreenPage } from "@/pages/screen"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <Router base="/ui">
          <RouteFocus />
          <Switch>
            <Route path="/" component={ScreenPage} />
            <Route component={NotFoundPage} />
          </Switch>
        </Router>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)
