// Petites briques d'interface : Base UI pour le comportement, Tailwind pour la mise en page,
// et les classes « sk-… » de src/skeuo.css pour les matières (papier, pièces posées, creux…).
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button as BaseButton } from '@base-ui/react/button'
import { Drawer } from '@base-ui/react/drawer'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { haptic } from '../lib/haptics'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const buttonVariants = {
  primary: 'sk-btn-primary',
  secondary: 'sk-btn-secondary',
  outline: 'sk-btn-outline',
  link: 'sk-btn-link self-start',
  ghost: 'sk-btn-ghost',
}

/**
 * `busy` : envoi en cours. Le bouton reste enfoncé, garde sa taille, n'accepte plus d'appui (pas
 * de double envoi) et montre trois points à la place de son libellé.
 */
export function Button({
  variant = 'primary',
  className,
  busy,
  disabled,
  ...props
}: ComponentProps<typeof BaseButton> & { variant?: keyof typeof buttonVariants; busy?: boolean }) {
  return (
    <BaseButton
      className={cx('sk-btn', buttonVariants[variant], className as string)}
      disabled={disabled || busy}
      data-busy={busy || undefined}
      aria-busy={busy || undefined}
      {...props}
    />
  )
}

/**
 * Mot d'erreur ou d'information, sur un pense-bête : ce qui s'est passé, et de quoi réessayer.
 * `role="alert"` : lu tout de suite par un lecteur d'écran.
 */
export function Notice({ children, action, onAction, busy, className }: { children: ReactNode; action?: string; onAction?: () => void; busy?: boolean; className?: string }) {
  return (
    <div role="alert" className={cx('sk-postit sk-note text-on-soon', className)}>
      <p>{children}</p>
      {action && (
        <Button variant="link" className="sk-note-action" busy={busy} onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  )
}

/** Lignes laissées en blanc, le temps que le contenu arrive (trait de crayon très pâle, largeur donnée). */
export function Blank({ className }: { className?: string }) {
  return <span aria-hidden className={cx('sk-blank', className)} />
}

/** Petit bouton rond posé. */
export function IconButton({ className, ...props }: ComponentProps<typeof BaseButton>) {
  return <BaseButton className={cx('sk-round', className as string)} {...props} />
}

/** Feuille de papier ou panneau mat posé sur le plan de travail. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('sk-card p-4', className)} {...props} />
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx('sk-section-title', className)}>{children}</h3>
}

/** Rubrique : son titre au-dessus, hors du cadre, puis sa feuille. */
export function Group({ title, id, className, children }: { title: ReactNode; id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className="sk-group scroll-mt-4">
      <SectionTitle>{title}</SectionTitle>
      <Card className={className}>{children}</Card>
    </section>
  )
}

export const inputClass = 'sk-input'

/** Curseur d'un contrôle segmenté (`sk-seg`) : posé sous l'option n° `index` parmi `count` ; aucune choisie = pas de curseur. */
export function SegPill({ count, index }: { count: number; index: number }) {
  return <span aria-hidden className="sk-seg-pill" data-on={index >= 0 || undefined} style={{ '--n': count, '--i': Math.max(index, 0) } as CSSProperties} />
}

/** Choix unique parmi des options (flux, douleur…) : un nouvel appui sur l'option active ne la désélectionne pas. */
export function SingleChoice<T extends number>({
  value,
  onChange,
  options,
  label,
  className,
  itemClassName,
  pill,
}: {
  value: T | null
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; className?: string }[]
  label: string
  className?: string
  itemClassName?: string
  /** Contrôle segmenté : un curseur glisse sous l'option choisie. */
  pill?: boolean
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value == null ? [] : [String(value)]}
      onValueChange={(v) => v.length && onChange(Number(v[0]) as T)}
      className={className}
    >
      {pill && <SegPill count={options.length} index={options.findIndex((o) => o.value === value)} />}
      {options.map((o) => (
        <Toggle key={o.value} value={String(o.value)} className={cx(itemClassName, o.className)}>
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

export function MultiChoice({
  value,
  onChange,
  options,
  label,
}: {
  value: string[]
  onChange: (v: string[]) => void
  options: string[]
  label: string
}) {
  return (
    <ToggleGroup multiple aria-label={label} value={value} onValueChange={onChange} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Toggle
          key={o}
          value={o}
          className="sk-key min-h-11 rounded-full px-4 py-2 text-sm font-medium data-pressed:bg-flow-1 data-pressed:font-semibold data-pressed:text-ink"
        >
          {o}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

/** Interrupteur usiné : gorge en creux, bouton de métal brossé. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 py-2">
      <span>{label}</span>
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={(v) => {
          haptic()
          onChange(v)
        }}
        className="sk-switch"
      >
        <BaseSwitch.Thumb className="sk-switch-thumb" />
      </BaseSwitch.Root>
    </label>
  )
}

export function Select<T extends string | number>({
  value,
  onChange,
  items,
  label,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string }[]
  label: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="font-medium">{label}</span>
      <BaseSelect.Root items={items} value={value} onValueChange={(v) => v != null && onChange(v as T)}>
        <BaseSelect.Trigger aria-label={label} className="sk-btn sk-btn-secondary flex min-h-11 min-w-32 items-center justify-between gap-3 px-3.5 py-2 font-medium">
          <BaseSelect.Value />
          <BaseSelect.Icon className="text-ink-2">▾</BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="z-50 outline-none" sideOffset={6}>
            <BaseSelect.Popup className="max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-2xl border border-line bg-surface py-1.5 text-ink shadow-[0_12px_32px_-8px_rgb(0_0_0/0.3)] transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              {items.map((i) => (
                <BaseSelect.Item
                  key={i.value}
                  value={i.value}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2.5 outline-none select-none data-highlighted:bg-surface-2"
                >
                  <BaseSelect.ItemIndicator className="col-start-1 font-bold text-accent">✓</BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2">{i.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  )
}

/** Feuille qui monte du bas de l'écran, fermable d'un glissement vers le bas. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black opacity-[calc(0.32*(1-var(--drawer-swipe-progress)))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
          <Drawer.Popup className="sk-body sk-sheet -mb-12 max-h-[calc(88dvh+3rem)] w-full max-w-xl overflow-y-auto overscroll-contain px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom)+3rem)] text-ink outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:[transform:translateY(calc(100%-3rem+2px))] data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-swiping:select-none desk:pt-5 desk:mb-6 desk:max-h-[min(88dvh,calc(100dvh-48px))] desk:pb-6 desk:data-ending-style:[transform:translateY(calc(100%+32px))] desk:data-starting-style:[transform:translateY(calc(100%+32px))]">
            <div className="sk-grabber mx-auto mb-3 h-1.5 w-12 rounded-full" />
            <Drawer.Content>
              <div className="mb-3 flex items-center justify-between">
                <Drawer.Title className="text-[1.35rem] font-semibold tracking-tight first-letter:uppercase">{title}</Drawer.Title>
                <Drawer.Close className="sk-round" aria-label="Fermer">
                  <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </Drawer.Close>
              </div>
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/**
 * Demande de confirmation avant un geste lourd (déconnexion, réinitialisation…) : une fiche posée
 * au milieu de l'écran, « Annuler » et le geste lui-même. Reste ouverte pendant l'envoi.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirm,
  onConfirm,
  busy,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children?: ReactNode
  confirm: string
  onConfirm: () => void
  busy?: boolean
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/35 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <AlertDialog.Popup className="sk-dialog w-full max-w-sm p-5 text-center text-ink outline-none transition-[opacity,transform] duration-200 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <AlertDialog.Title className="text-[1.2rem] font-semibold tracking-tight">{title}</AlertDialog.Title>
            {children && <AlertDialog.Description className="mt-2 text-[0.95rem] leading-snug text-ink-2">{children}</AlertDialog.Description>}
            <div className="mt-5 flex flex-col gap-2.5">
              <Button busy={busy} onClick={onConfirm}>
                {confirm}
              </Button>
              <AlertDialog.Close render={<Button variant="secondary" disabled={busy} />}>Annuler</AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

/** Champ de mot de passe avec un œil pour le montrer ou le cacher (`className` : celui du champ). */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={shown ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(className, 'pr-12')} />
      <button
        type="button"
        className="sk-eye absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-2 outline-none"
        aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={shown}
        // Le clavier reste ouvert et le curseur dans le champ.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => setShown(!shown)}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-[1.3rem]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
          {shown || <path d="M4 20 20 4" />}
        </svg>
      </button>
    </div>
  )
}

export const flowBg = ['bg-surface-2', 'bg-flow-1', 'bg-flow-2', 'bg-flow-3', 'bg-flow-4', 'bg-flow-5'] as const
/** Texte lisible sur chaque niveau de flux. */
export const flowText = ['text-ink', 'text-ink', 'text-ink', 'text-on-flow', 'text-on-flow', 'text-on-flow'] as const
