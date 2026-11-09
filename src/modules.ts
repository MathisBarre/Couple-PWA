// Les espaces de l'app. Pour en ajouter un (ex. les séances de sport) :
// 1. une entrée ici (avec son thème de couleur, voir src/index.css),
// 2. son écran dans le `switch` de App.tsx.
// La barre du bas s'adapte toute seule : au-delà de 3 espaces, les suivants
// passent dans « Plus », avec les réglages.

export const MODULES = [
  { id: 'cycle', label: 'Cycle', icon: '💧', description: 'Suivi des règles, calendrier et analyse', theme: 'rose' },
  { id: 'groceries', label: 'Courses', icon: '🛒', description: 'La liste de courses commune', theme: 'verdure' },
] as const satisfies readonly { id: string; label: string; icon: string; description: string; theme: Theme }[]

/** Thèmes de couleur définis dans src/index.css (« rose » = thème par défaut). */
export type Theme = 'rose' | 'verdure'

export type ModuleId = (typeof MODULES)[number]['id']
export type View = ModuleId | 'settings' | 'more'

/** Nombre d'espaces affichés directement dans la barre du bas (le dernier emplacement sert à Réglages ou Plus). */
const IN_BAR = 3

export interface NavItem {
  id: View
  label: string
  icon: string
}

export const SETTINGS_ITEM: NavItem = { id: 'settings', label: 'Réglages', icon: '⚙️' }
const MORE_ITEM: NavItem = { id: 'more', label: 'Plus', icon: '☰' }

const fitsInBar = MODULES.length <= IN_BAR
export const BAR: NavItem[] = fitsInBar ? [...MODULES, SETTINGS_ITEM] : [...MODULES.slice(0, IN_BAR), MORE_ITEM]
/** Espaces accessibles seulement depuis « Plus ». */
export const OVERFLOW = fitsInBar ? [] : MODULES.slice(IN_BAR)

/** Entrée de la barre à mettre en avant pour l'écran affiché. */
export const barItemFor = (view: View): View => (BAR.some((b) => b.id === view) ? view : 'more')

/** Thème de l'écran affiché : celui de l'espace, rose par défaut (réglages, « Plus »). */
export const themeFor = (view: View): Theme => MODULES.find((m) => m.id === view)?.theme ?? 'rose'

/** Applique le thème à toute la page, barre d'état du téléphone comprise. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'rose') delete root.dataset.theme
  else root.dataset.theme = theme
  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim()
  if (bg) document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg))
}
