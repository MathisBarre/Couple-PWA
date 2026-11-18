import { syncStatusBar } from './lib/scheme'
import type { ModuleId as SharedModuleId } from '../shared/modules'

// Les espaces de l'app. Pour en ajouter un (ex. les séances de sport) :
// 1. une entrée ici (avec son thème de couleur, voir src/index.css),
// 2. son écran dans le `switch` de `render` (App.tsx).
// S'il a ses propres réglages (`settings`), ils apparaissent tout seuls en raccourci
// dans les réglages globaux.
// Chaque espace (le couple, la famille…) choisit à la création les espaces qu'il veut (onboarding),
// modifiable ensuite dans Réglages : seuls ceux-là apparaissent dans la barre.
// Ajouter aussi son id à shared/modules.ts (le serveur valide les choix).
// La barre du bas s'adapte toute seule : au-delà de 4 espaces, les suivants
// passent dans « Plus », avec les réglages.
// `sections` : ses onglets du haut, proposés aussi en restant appuyé sur son onglet
// dans la barre du bas (garder les mêmes id que dans son écran).

export const MODULES = [
  {
    id: 'cycle',
    label: 'Cycle',
    icon: '💧',
    description: 'Suivi des règles, calendrier et analyse',
    theme: 'rose',
    settings: 'Stérilet, durée du cycle, rappels',
    sections: [
      { id: 'today', label: 'Suivi', icon: '📅' },
      { id: 'stats', label: 'Analyse', icon: '📊' },
      { id: 'settings', label: 'Réglages', icon: '⚙️' },
    ],
  },
  {
    // Id historique « groceries » (gardé pour les espaces déjà créés) : courses + choses à faire.
    id: 'groceries',
    label: 'Listes',
    icon: '📝',
    description: 'Les courses et les choses à faire, en commun',
    theme: 'verdure',
    settings: 'Notifications des courses et des choses à faire',
    sections: [
      { id: 'courses', label: 'Courses', icon: '🛒' },
      { id: 'todo', label: 'À faire', icon: '✅' },
      { id: 'settings', label: 'Réglages', icon: '⚙️' },
    ],
  },
  {
    id: 'sport',
    label: 'UCPA',
    icon: '🎟️',
    description: 'QR d’accès, réservations UCPA et séances de l’autre',
    theme: 'ucpa',
    settings: 'Compte UCPA, notifications des séances',
    sections: [
      { id: 'seances', label: 'Séances', icon: '🎟️' },
      { id: 'reserver', label: 'Réserver', icon: '📅' },
      { id: 'settings', label: 'Réglages', icon: '⚙️' },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendrier',
    icon: '📆',
    description: 'Le calendrier commun, synchronisé avec votre téléphone',
    theme: 'encre',
    settings: 'Notifications, lien d’abonnement',
    sections: [
      { id: 'events', label: 'Calendrier', icon: '📆' },
      { id: 'settings', label: 'Réglages', icon: '⚙️' },
    ],
  },
] as const satisfies readonly {
  /** Doit figurer dans shared/modules.ts. */
  id: SharedModuleId
  label: string
  icon: string
  description: string
  theme: Theme
  /** Si l'espace a son propre onglet « Réglages » (en haut) : ce qu'on y trouve, affiché dans les réglages globaux. */
  settings?: string
  sections?: readonly Section[]
}[]

export interface Section {
  id: string
  label: string
  icon: string
}

/** Rubriques des réglages globaux : chacune porte l'id `reglages-<id>` (src/components/Settings.tsx). */
export const SETTINGS_SECTIONS: Section[] = [
  { id: 'modules', label: 'Espaces affichés', icon: '🧩' },
  { id: 'espaces', label: 'Réglages des espaces', icon: '⚙️' },
  { id: 'apparence', label: 'Apparence', icon: '🎨' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'couple', label: 'Couple', icon: '💞' },
  { id: 'app', label: 'Application', icon: '📲' },
]

/** Thèmes de couleur définis dans src/index.css (« rose » = thème par défaut, « neutre » = réglages). */
export type Theme = 'rose' | 'verdure' | 'ucpa' | 'encre' | 'neutre'

export type ModuleId = (typeof MODULES)[number]['id']
export type Module = (typeof MODULES)[number]
/** Réglages propres à un espace (écran empilé, ouvert par ⚙️ dans son en-tête). */
export type SpaceSettingsView = `${ModuleId}:settings`
export type View = ModuleId | 'settings' | 'more' | SpaceSettingsView
export const spaceSettings = (id: ModuleId): SpaceSettingsView => `${id}:settings`
const spaceOf = (view: View) => view.split(':')[0]

/** Nombre d'espaces affichés directement dans la barre du bas (5 onglets au plus, comme sur iOS) (le dernier emplacement sert à Réglages ou Plus). */
const IN_BAR = 4

export interface NavItem {
  id: View
  label: string
  icon: string
}

export const SETTINGS_ITEM: NavItem = { id: 'settings', label: 'Réglages', icon: '⚙️' }
const MORE_ITEM: NavItem = { id: 'more', label: 'Plus', icon: '☰' }

/** Espaces activés, dans l'ordre de l'app. `null` (espace créé avant le choix des espaces) = tous. */
export const enabledModules = (ids: readonly string[] | null | undefined): Module[] =>
  ids ? MODULES.filter((m) => ids.includes(m.id)) : [...MODULES]

/**
 * Barre du bas pour ces espaces : jusqu'à 4 espaces + Réglages ; au-delà, 4 + « Plus ».
 * `overflow` : espaces accessibles seulement depuis « Plus ».
 */
export function navFor(modules: readonly Module[]): { bar: NavItem[]; overflow: Module[] } {
  if (modules.length <= IN_BAR) return { bar: [...modules, SETTINGS_ITEM], overflow: [] }
  return { bar: [...modules.slice(0, IN_BAR), MORE_ITEM], overflow: modules.slice(IN_BAR) }
}

/** Nom d'un écran (affiché dans le bouton retour « ‹ Plus »). */
export const labelFor = (view: View): string =>
  view.endsWith(':settings') ? 'Réglages' : ([...MODULES, SETTINGS_ITEM, MORE_ITEM].find((m) => m.id === view)?.label ?? '')

/** Thème de l'écran affiché : celui de l'espace ; neutre pour les réglages et « Plus ». */
export const themeFor = (view: View): Theme =>
  view === 'settings' || view === 'more' ? 'neutre' : (MODULES.find((m) => m.id === spaceOf(view))?.theme ?? 'rose')

/** Applique le thème à toute la page, barre d'état du téléphone comprise. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'rose') delete root.dataset.theme
  else root.dataset.theme = theme
  syncStatusBar()
}

/** Espaces qui ont leur propre onglet « Réglages », listés en raccourci dans les réglages globaux. */
export const withSettings = (modules: readonly Module[]) => modules.filter((m) => 'settings' in m && m.settings)
