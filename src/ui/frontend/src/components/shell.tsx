import { useEffect, type ReactNode } from "react"
import { KeyRoundIcon, LayersIcon, MonitorIcon, PuzzleIcon, SettingsIcon, type LucideIcon } from "lucide-react"
import { Link } from "wouter"
import { ThemeToggle } from "@/components/theme-toggle"
import { useI18n } from "@/i18n"
import type { Key } from "@/i18n/translate"

const UPSTREAM = "https://github.com/fatihak/InkyPi"
const SOURCE = "https://github.com/valentincosson/InkyPi"
const LICENSE = "https://www.gnu.org/licenses/gpl-3.0.html"

const nav: { label: Key; href: string; icon: LucideIcon }[] = [
  { label: "nav.screen", href: "/", icon: MonitorIcon },
  { label: "nav.plugins", href: "/plugins", icon: PuzzleIcon },
  { label: "nav.playlists", href: "/playlists", icon: LayersIcon },
  { label: "nav.settings", href: "/settings", icon: SettingsIcon },
  { label: "nav.apiKeys", href: "/api-keys", icon: KeyRoundIcon },
]

const width = "mx-auto w-full max-w-[calc(1132px+2.5rem)] px-5"
const footerLink = "inline-flex min-h-7 items-center underline underline-offset-4 hover:text-foreground"

function SkipLink() {
  const { t } = useI18n()
  return (
    <a
      href="#main"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById("main")?.focus()
      }}
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-[var(--radius)] focus:bg-card focus:p-2"
    >
      {t("skip")}
    </a>
  )
}

function Credit() {
  const { t } = useI18n()
  const [before, after] = t("footer.credit", { project: "\0" }).split("\0")
  return <p className="inline-flex min-h-7 flex-wrap items-center gap-x-1">{before}<a className={footerLink} href={UPSTREAM}>InkyPi</a>{after}</p>
}

export function Shell({ title, current, children }: { title: string; current?: Key; children: ReactNode }) {
  const { t } = useI18n()
  useEffect(() => {
    document.title = `${title} | InkyPi`
  }, [title])

  const linkClass = (active: boolean) =>
    `flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] px-2 text-sm font-medium transition-colors sm:px-3 ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"}`
  const reveal = (event: React.FocusEvent<HTMLElement>) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-20 border-b border-border bg-card lg:sticky lg:top-0">
        <SkipLink />
        <div className={`${width} flex flex-wrap items-center justify-between gap-x-6 py-2 lg:flex-nowrap`}>
          <Link href="/" className="py-1.5 text-lg font-semibold tracking-tight lg:mr-2">InkyPi</Link>
          <nav className="order-3 -mx-1 mt-1 flex w-[calc(100%+0.5rem)] gap-0.5 overflow-x-auto p-1 lg:order-none lg:m-0 lg:w-auto lg:flex-1 lg:overflow-visible lg:p-0" aria-label={t("nav.main")}>
            {nav.map(({ label, href, icon: Icon }) => (
              <Link key={label} href={href} onFocus={reveal} aria-current={label === current ? "page" : undefined} className={linkClass(label === current)}><Icon className="hidden size-4 sm:block" aria-hidden="true" />{t(label)}</Link>
            ))}
          </nav>
          <div className="-mr-2 lg:order-none"><ThemeToggle /></div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`${width} flex-1 py-7 outline-none`}>{children}</main>
      <footer className={`${width} flex flex-wrap gap-x-5 pb-5 text-sm text-muted-foreground`}>
        <Credit />
        <a className={footerLink} href={SOURCE}>{t("footer.source")}</a>
        <a className={footerLink} href={LICENSE}>{t("footer.license")}</a>
        <a className={footerLink} href="/ui/static/THIRD_PARTY_LICENSES.txt">{t("footer.thirdParty")}</a>
      </footer>
    </div>
  )
}
