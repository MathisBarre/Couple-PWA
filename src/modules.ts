// Les espaces de l'app. Pour en ajouter un (ex. les séances de sport) :
// 1. une entrée ici (avec son thème de couleur, voir src/index.css),
// 2. son écran dans le `switch` de `render` (App.tsx).
// La barre du bas s'adapte toute seule : au-delà de 3 espaces, les suivants
// passent dans « Plus », avec les réglages.
// `sections` : les sous-écrans de l'espace, proposés en restant appuyé sur son
// onglet dans la barre du bas (et, pour le cycle, ses onglets du haut).

export const MODULES = [
  {
    id: 'cycle',
    label: 'Cycle',
    icon: '💧',
    description: 'Suivi des règles, calendrier et analyse',
    theme: 'rose',
    sections: [
      { id: 'today', label: 'Aujourd’hui', icon: '✏️' },
      { id: 'calendar', label: 'Calendrier', icon: '📅' },
      { id: 'stats', label: 'Analyse', icon: '📊' },
    ],
  },
  { id: 'groceries', label: 'Courses', icon: '🛒', description: 'La liste de courses commune', theme: 'verdure', sections: [] },
] as const satisfies readonly { id: string; label: string; icon: string; description: string; theme: Theme; sections: readonly Section[] }[]

export interface Section {
  id: string
  label: string
  icon: string
}

/** Sous-écrans du cycle (ses onglets du haut). */
export const CYCLE_SECTIONS = MODULES[0].sections
export type CycleTab = (typeof CYCLE_SECTIONS)[number]['id']

/** Rubriques des réglages : chacune est une carte avec l'id `reglages-<id>` (src/components/Settings.tsx). */
export const SETTINGS_SECTIONS: Section[] = [
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'cycle', label: 'Cycle', icon: '💧' },
  { id: 'couple', label: 'Couple', icon: '💞' },
  { id: 'app', label: 'Application', icon: '📲' },
]

/** Thèmes de couleur définis dans src/index.css (« rose » = thème par défaut, « neutre » = réglages). */
export type Theme = 'rose' | 'verdure' | 'neutre'

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

/** Nom d'un écran (affiché dans le bouton retour « ‹ Plus »). */
export const labelFor = (view: View): string => [...MODULES, SETTINGS_ITEM, MORE_ITEM].find((m) => m.id === view)?.label ?? ''

/** Thème de l'écran affiché : celui de l'espace ; neutre pour les réglages et « Plus ». */
export const themeFor = (view: View): Theme =>
  view === 'settings' || view === 'more' ? 'neutre' : (MODULES.find((m) => m.id === view)?.theme ?? 'rose')

/** Applique le thème à toute la page, barre d'état du téléphone comprise. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'rose') delete root.dataset.theme
  else root.dataset.theme = theme
  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim()
  if (bg) document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg))
}
