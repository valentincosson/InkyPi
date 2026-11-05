import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { Home, Plugins, WeatherForm } from "@/screens"

function read() {
  const screen = location.hash.replace("#", "")
  return screen === "plugins" || screen === "weather" ? screen : "home"
}

function App() {
  const [screen, setScreen] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setScreen(read()); window.scrollTo(0, 0)
      requestAnimationFrame(() => { const h1 = document.querySelector("h1"); h1?.setAttribute("tabindex", "-1"); h1?.focus({ preventScroll: true }) })
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  if (screen === "plugins") return <Plugins />
  if (screen === "weather") return <WeatherForm />
  return <Home />
}

createRoot(document.getElementById("root")!).render(<App />)
