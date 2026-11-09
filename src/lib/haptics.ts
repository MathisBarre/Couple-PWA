// Petit retour tactile, au mieux de ce que permet le téléphone.
// Android : l'API de vibration. iPhone (iOS 18+) : Safari n'a pas d'API, mais basculer un
// interrupteur natif (<input type="checkbox" switch>) produit un « tic » ; on en garde un invisible.

let iosSwitch: HTMLLabelElement | null = null

export function haptic() {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(8)
      return
    }
    if (!iosSwitch) {
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      input.id = 'haptic-switch'
      input.tabIndex = -1
      input.ariaHidden = 'true'
      iosSwitch = document.createElement('label')
      iosSwitch.htmlFor = input.id
      iosSwitch.ariaHidden = 'true'
      for (const el of [input, iosSwitch]) el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px'
      document.body.append(input, iosSwitch)
    }
    iosSwitch.click()
  } catch {
    /* pas de retour tactile, tant pis */
  }
}
