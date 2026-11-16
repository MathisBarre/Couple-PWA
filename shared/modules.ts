// Ids des espaces (modules) de l'app, connus du serveur pour valider ce qu'un espace active.
// Le détail de chaque espace (nom, icône, couleur…) est dans src/modules.ts.
export const MODULE_IDS = ['cycle', 'groceries', 'sport'] as const
export type ModuleId = (typeof MODULE_IDS)[number]

/** Espaces activés, lus en base : null (espace créé avant le choix) = tous. */
export function parseModules(raw: unknown): ModuleId[] | null {
  if (raw == null) return null
  try {
    const list = JSON.parse(String(raw))
    return Array.isArray(list) ? MODULE_IDS.filter((id) => list.includes(id)) : null
  } catch {
    return null
  }
}

export const isEnabled = (modules: ModuleId[] | null, id: ModuleId) => !modules || modules.includes(id)

/** Liste reçue de l'app : seulement des ids connus, sans doublon, dans l'ordre de l'app. Au moins un. */
export function cleanModules(input: unknown): ModuleId[] | null {
  if (!Array.isArray(input)) return null
  const list = MODULE_IDS.filter((id) => input.includes(id))
  return list.length ? list : null
}
