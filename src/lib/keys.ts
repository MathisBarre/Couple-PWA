/** La touche part dans un champ de saisie : les raccourcis clavier ne s'en mêlent pas. */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}
