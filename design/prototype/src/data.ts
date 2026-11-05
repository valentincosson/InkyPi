import weather from "@/assets/weather.png"
import todo from "@/assets/todo_list.png"
import countdown from "@/assets/countdown.png"
import year from "@/assets/year_progress.png"
import clock from "@/assets/clock.png"

export const queue = [
  { name: "Paris weather", plugin: "Weather", image: weather, at: "00:48", id: "weather" },
  { name: "Weekly to-do", plugin: "To-Do List", image: todo, at: "00:48", id: "todo_list" },
  { name: "Days until Noël", plugin: "Countdown", image: countdown, at: "01:48", id: "countdown" },
  { name: "Year so far", plugin: "Year Progress", image: year, at: "02:48", id: "year_progress" },
  { name: "Gradient clock", plugin: "Clock", image: clock, at: "03:48", id: "clock" },
]

export type Plugin = { id: string; name: string; hint: string; group: "Pictures" | "Information"; key?: boolean; big?: boolean }

export const plugins: Plugin[] = [
  { id: "image_upload", name: "Your photos", hint: "Show your own photos", group: "Pictures", big: true },
  { id: "apod", name: "NASA picture of the day", hint: "NASA's daily space image", group: "Pictures" },
  { id: "wpotd", name: "Wikipedia picture of the day", hint: "Wikipedia's daily image", group: "Pictures" },
  { id: "unsplash", name: "Unsplash", hint: "Photos by topic", group: "Pictures", key: true },
  { id: "image_album", name: "Immich album", hint: "Photos from an Immich album", group: "Pictures", key: true },
  { id: "image_folder", name: "Image folder", hint: "Images from a folder on the device", group: "Pictures" },
  { id: "image_url", name: "Image from a link", hint: "Any image from a link", group: "Pictures" },
  { id: "ai_image", name: "AI image", hint: "Generated from a prompt", group: "Pictures", key: true },
  { id: "weather", name: "Weather", hint: "Today and the coming days", group: "Information", big: true },
  { id: "calendar", name: "Calendar", hint: "Your upcoming events", group: "Information" },
  { id: "clock", name: "Clock", hint: "Four clock faces", group: "Information" },
  { id: "todo_list", name: "To-do list", hint: "Your own lists", group: "Information" },
  { id: "countdown", name: "Countdown", hint: "Days until a date", group: "Information" },
  { id: "year_progress", name: "Year progress", hint: "How far through the year", group: "Information" },
  { id: "rss", name: "RSS feed", hint: "Latest articles from a feed", group: "Information" },
  { id: "newspaper", name: "Front page", hint: "A newspaper's latest edition", group: "Information" },
  { id: "comic", name: "Daily comic", hint: "A new strip every day", group: "Information" },
  { id: "github", name: "GitHub", hint: "Contributions and stars", group: "Information", key: true },
  { id: "ai_text", name: "AI text", hint: "Written from a prompt", group: "Information", key: true },
  { id: "screenshot", name: "Web page capture", hint: "A capture of any web page", group: "Information" },
]
