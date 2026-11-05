/** Illustrations du catalogue : quatre niveaux de gris, jamais de couleur (voir DESIGN.md). */
const BG = "var(--art-bg)", A = "var(--art-1)", M = "var(--art-2)", K = "var(--art-ink)"
const line = { stroke: K, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const

const rows = (x: number, y: number, w: number, n: number, gap = 12) =>
  Array.from({ length: n }, (_, i) => <path key={i} d={`M${x} ${y + i * gap}h${i === n - 1 ? w * 0.6 : w}`} {...line} />)

const picture = (x: number, y: number, w: number, h: number) => <>
  <rect x={x} y={y} width={w} height={h} rx="3" fill={A} {...{ stroke: K, strokeWidth: 3 }} />
  <circle cx={x + w * 0.72} cy={y + h * 0.3} r={h * 0.12} fill={K} />
  <path d={`M${x + 2} ${y + h - 2}l${w * 0.3} ${-h * 0.5} ${w * 0.22} ${h * 0.3} ${w * 0.14} ${-h * 0.14} ${w * 0.3} ${h * 0.34}z`} fill={M} />
</>

const scenes: Record<string, React.ReactNode> = {
  image_upload: <><g transform="rotate(-9 74 60)">{picture(44, 34, 60, 46)}</g><g transform="rotate(8 128 60)">{picture(96, 34, 60, 46)}</g>{picture(66, 42, 68, 52)}</>,
  apod: <><circle cx="100" cy="60" r="24" fill={K} /><ellipse cx="100" cy="60" rx="46" ry="11" transform="rotate(-16 100 60)" {...line} />{[[42, 28], [158, 30], [54, 92], [150, 94], [122, 18]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.5" fill={M} />)}</>,
  wpotd: <><rect x="62" y="20" width="76" height="80" rx="3" fill={A} {...{ stroke: K, strokeWidth: 3 }} />{picture(72, 30, 56, 38)}{rows(72, 80, 56, 2, 10)}</>,
  unsplash: <><rect x="56" y="38" width="88" height="56" rx="6" fill={K} /><path d="M82 38l6-11h24l6 11z" fill={K} /><circle cx="100" cy="66" r="19" fill={A} /><circle cx="100" cy="66" r="10" fill={M} /><circle cx="132" cy="49" r="3" fill={A} /></>,
  image_album: <>{picture(52, 22, 46, 34)}{picture(102, 22, 46, 34)}{picture(52, 62, 46, 34)}{picture(102, 62, 46, 34)}</>,
  image_folder: <><g transform="rotate(-6 100 44)">{picture(70, 22, 60, 40)}</g><path d="M50 46h32l8 10h60v44H50z" fill={K} /></>,
  image_url: <>{picture(52, 26, 96, 58)}<rect x="88" y="74" width="52" height="24" rx="12" fill={K} /><path d="M108 86h12M104 86a4 4 0 0 1 4-4M124 86a4 4 0 0 1-4 4" stroke={A} strokeWidth="3" strokeLinecap="round" fill="none" /></>,
  ai_image: <>{picture(50, 34, 76, 56)}<path d="m140 22 6 17 17 6-17 6-6 17-6-17-17-6 17-6z" fill={K} /></>,
  weather: <><circle cx="82" cy="46" r="18" fill={M} {...{ stroke: K, strokeWidth: 3 }} />{[0, 45, 90, 180, 225, 270, 315].map((a) => <path key={a} d="M82 16v-7" {...line} transform={`rotate(${a} 82 46)`} />)}<path d="M84 90a18 18 0 0 1 2-36 24 24 0 0 1 45-3 20 20 0 0 1 8 39z" fill={A} {...{ stroke: K, strokeWidth: 3, strokeLinejoin: "round" }} /><path d="m94 100-3 8M112 100l-3 8M130 100l-3 8" {...line} /></>,
  calendar: <><rect x="54" y="26" width="92" height="74" rx="5" fill={A} {...{ stroke: K, strokeWidth: 3 }} /><path d="M54 31a5 5 0 0 1 5-5h82a5 5 0 0 1 5 5v13H54z" fill={K} /><path d="M76 18v12M124 18v12" {...line} />{Array.from({ length: 15 }, (_, i) => <rect key={i} x={65 + (i % 5) * 15} y={52 + Math.floor(i / 5) * 15} width="10" height="10" rx="2" fill={i === 7 ? K : M} />)}</>,
  clock: <><circle cx="100" cy="60" r="42" fill={A} {...{ stroke: K, strokeWidth: 3 }} />{[0, 90, 180, 270].map((a) => <path key={a} d="M100 25v6" {...line} transform={`rotate(${a} 100 60)`} />)}<path d="M100 60V36M100 60l18 11" {...line} /><circle cx="100" cy="60" r="4" fill={K} /></>,
  todo_list: <><rect x="60" y="16" width="80" height="88" rx="4" fill={A} {...{ stroke: K, strokeWidth: 3 }} />{[0, 1, 2, 3].map((i) => <g key={i}><rect x="70" y={27 + i * 18} width="11" height="11" rx="2" fill={i < 2 ? K : BG} {...{ stroke: K, strokeWidth: 2 }} /><path d={`M90 ${33 + i * 18}h${i === 3 ? 26 : 40}`} {...line} /></g>)}</>,
  countdown: <><rect x="46" y="24" width="50" height="72" rx="6" fill={K} /><rect x="104" y="24" width="50" height="72" rx="6" fill={K} /><path d="M81 40H62v17h9a11 11 0 1 1-11 15" stroke={A} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="m122 49 9-9v41" stroke={A} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  year_progress: <>{Array.from({ length: 48 }, (_, i) => <rect key={i} x={46 + (i % 12) * 9.3} y={32 + Math.floor(i / 12) * 15} width="6.6" height="11" rx="1.5" fill={i < 38 ? K : M} />)}</>,
  rss: <><circle cx="68" cy="84" r="9" fill={K} /><path d="M60 52a32 32 0 0 1 32 32M60 28a56 56 0 0 1 56 56" stroke={K} strokeWidth="9" strokeLinecap="round" fill="none" />{rows(128, 42, 28, 4)}</>,
  newspaper: <><rect x="56" y="16" width="88" height="88" rx="3" fill={A} {...{ stroke: K, strokeWidth: 3 }} /><rect x="65" y="25" width="70" height="10" fill={K} /><rect x="65" y="42" width="34" height="27" fill={M} />{rows(105, 45, 30, 3, 10)}{rows(65, 78, 70, 2, 11)}</>,
  comic: <><rect x="38" y="30" width="38" height="62" rx="2" fill={A} {...{ stroke: K, strokeWidth: 3 }} /><rect x="81" y="30" width="38" height="62" rx="2" fill={M} {...{ stroke: K, strokeWidth: 3 }} /><rect x="124" y="30" width="38" height="62" rx="2" fill={A} {...{ stroke: K, strokeWidth: 3 }} /><ellipse cx="57" cy="47" rx="12" ry="8" fill={BG} {...{ stroke: K, strokeWidth: 2.5 }} /><circle cx="57" cy="74" r="8" fill={K} /><ellipse cx="100" cy="47" rx="12" ry="8" fill={BG} {...{ stroke: K, strokeWidth: 2.5 }} /><circle cx="100" cy="74" r="8" fill={K} /><path d="m143 44 4 11 11 1-9 7 3 11-9-6-9 6 3-11-9-7 11-1z" fill={K} /></>,
  github: <>{Array.from({ length: 70 }, (_, i) => { const v = (i * 7 + (i % 5) * 11) % 4; return <rect key={i} x={45 + (i % 14) * 8} y={38 + Math.floor(i / 14) * 9} width="6.5" height="6.5" rx="1.5" fill={[A, M, M, K][v]} /> })}</>,
  ai_text: <>{rows(50, 34, 76, 5, 13)}<path d="m142 26 6 17 17 6-17 6-6 17-6-17-17-6 17-6z" fill={K} /></>,
  screenshot: <><rect x="44" y="24" width="112" height="72" rx="5" fill={A} {...{ stroke: K, strokeWidth: 3 }} /><path d="M44 29a5 5 0 0 1 5-5h102a5 5 0 0 1 5 5v9H44z" fill={K} /><rect x="54" y="48" width="36" height="38" fill={M} />{rows(98, 52, 46, 4, 10)}</>,
}

export function PluginArt({ id, className = "" }: { id: string; className?: string }) {
  return <svg viewBox="0 0 200 120" className={`block aspect-[5/3] w-full ${className}`} aria-hidden="true"><rect width="200" height="120" fill={BG} />{scenes[id]}</svg>
}

/** Un écran encore vide, pour l'accueil d'une nouvelle installation. */
export function EmptyScreenArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 120" className={`block aspect-[5/3] w-full ${className}`} aria-hidden="true">
      <rect x="30" y="14" width="140" height="92" rx="8" fill={K} />
      <rect x="38" y="22" width="124" height="76" rx="3" fill={BG} />
      <path d="M84 60h32" {...line} stroke={M} />
    </svg>
  )
}
