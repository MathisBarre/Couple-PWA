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
  if (bg) document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg))
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
