// Mode clair / sombre : suit le téléphone (« Système ») ou forcé dans Réglages.
// Le choix est gardé sur l'appareil ; il est posé sur <html data-scheme="light|dark">,
// que src/index.css utilise pour toutes les palettes.

export type SchemeChoice = 'system' | 'light' | 'dark'

const KEY = 'scheme'
const media = matchMedia('(prefers-color-scheme: dark)')

export function getSchemeChoice(): SchemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Couleur de la barre d'état du téléphone = fond de l'écran affiché. */
export function syncStatusBar() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  if (!bg) return
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg))
  // iOS 26 colore la barre d'état d'après le bandeau #top-edge (voir src/index.css), mais ne
  // relit sa couleur que lorsqu'il le (re)découvre : un simple changement de couleur ne suffit
  // pas. On remplace donc le bandeau par une copie à la nouvelle couleur.
  const edge = document.getElementById('top-edge')
  if (edge && edge.style.backgroundColor !== bg) {
    const fresh = edge.cloneNode() as HTMLElement
    fresh.style.backgroundColor = bg
    edge.replaceWith(fresh)
  }
}

function apply() {
  const choice = getSchemeChoice()
  const dark = choice === 'dark' || (choice === 'system' && media.matches)
  document.documentElement.dataset.scheme = dark ? 'dark' : 'light'
  syncStatusBar()
}

export function setSchemeChoice(choice: SchemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* stockage indisponible : le choix vaut pour cette session */
  }
  apply()
}

/** À appeler au démarrage, avant le premier rendu. */
export function startScheme() {
  apply()
  // En mode « Système », suivre le téléphone quand il bascule (ex. le soir).
  media.addEventListener('change', apply)
}
