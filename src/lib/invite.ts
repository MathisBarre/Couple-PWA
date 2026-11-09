// Lien d'invitation « quick join » : https://…/join?code=ABC123
// Ouvert par le ou la partenaire, il garde le code sur l'appareil le temps de
// créer son compte (ou de se connecter), puis rejoint l'espace tout seul.

const KEY = 'invite'
const CODE = /^[A-Z0-9]{4,12}$/

/** Lien à envoyer pour rejoindre l'espace. */
export const inviteUrl = (code: string) => `${location.origin}/join?code=${encodeURIComponent(code)}`

/** À appeler au démarrage : mémorise le code d'un lien d'invitation et nettoie l'adresse. */
export function captureInvite() {
  if (location.pathname !== '/join') return
  const code = (new URLSearchParams(location.search).get('code') ?? '').trim().toUpperCase()
  try {
    if (CODE.test(code)) localStorage.setItem(KEY, code)
  } catch {
    /* stockage indisponible : le code reste à saisir à la main */
  }
  history.replaceState(null, '', '/')
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* rien à faire */
  }
}

/** Partage natif (feuille de partage iOS/Android) si possible, sinon copie dans le presse-papiers. */
export async function shareInvite(code: string, from: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = inviteUrl(code)
  const text = `${from ? `${from} t’invite` : 'Je t’invite'} sur notre app à deux. Ouvre ce lien pour nous rejoindre :`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'À deux', text, url })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  await copyInvite(code)
  return 'copied'
}

export async function copyInvite(code: string) {
  await navigator.clipboard.writeText(inviteUrl(code))
}
