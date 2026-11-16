// Petites briques d'interface : Base UI pour le comportement, Tailwind pour le style.
import { Button as BaseButton } from '@base-ui/react/button'
import { Drawer } from '@base-ui/react/drawer'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from './icons'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// Boutons : un aplat d'encre de couleur (primary), un cadre au filet noir (secondary, outline),
// ou un simple mot souligné (link, ghost). Coins droits, aucune ombre.
const buttonVariants = {
  primary: 'bg-accent text-on-accent font-semibold',
  secondary: 'border border-ink bg-transparent text-ink font-semibold',
  outline: 'border border-ink bg-transparent text-ink font-semibold',
  link: 'bg-transparent text-accent font-medium underline decoration-1 underline-offset-4 !px-0 !py-2 !min-h-11 self-start text-left',
  ghost: 'bg-transparent text-ink-2 font-medium underline decoration-1 underline-offset-4 !px-0 !py-2 !min-h-11',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<typeof BaseButton> & { variant?: keyof typeof buttonVariants }) {
  return (
    <BaseButton
      className={cx(
        'min-h-12 px-4 py-3 leading-tight select-none transition-opacity active:opacity-60 disabled:opacity-40',
        focus,
        buttonVariants[variant],
        className as string,
      )}
      {...props}
    />
  )
}

export function IconButton({ className, ...props }: ComponentProps<typeof BaseButton>) {
  return (
    <BaseButton
      className={cx('grid size-11 place-items-center text-ink transition-opacity active:opacity-50', focus, className as string)}
      {...props}
    />
  )
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('border-t border-ink pt-3 pb-1.5', className)} {...props} />
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="rubrique-titre etiquette mb-2.5 text-ink">{children}</h3>
}

export const inputClass = cx('w-full rounded-none border border-ink bg-transparent px-3 py-3 text-ink placeholder:text-ink-2 placeholder:italic', focus)

/** Choix unique parmi des options (flux, douleur…) : un nouvel appui sur l'option active ne la désélectionne pas. */
export function SingleChoice<T extends number>({
  value,
  onChange,
  options,
  label,
  className,
  itemClassName,
}: {
  value: T | null
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; className?: string }[]
  label: string
  className?: string
  itemClassName?: string
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value == null ? [] : [String(value)]}
      onValueChange={(v) => v.length && onChange(Number(v[0]) as T)}
      className={className}
    >
      {options.map((o) => (
        <Toggle key={o.value} value={String(o.value)} className={cx(focus, itemClassName, o.className)}>
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
          className={cx(
            'min-h-11 border border-ink px-3 py-2 text-[0.95rem]',
            'data-pressed:bg-ink data-pressed:font-medium data-pressed:text-bg',
            focus,
          )}
        >
          {o}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 py-2">
      <span>{label}</span>
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className={cx(
          // Interrupteur à glissière : un cadre au filet, un plomb carré qui glisse de 50 − 2×(1+3) − 20 = 22 px.
          'group relative inline-flex h-7 w-12.5 shrink-0 items-center border border-ink p-0.75 transition-colors data-checked:bg-accent data-checked:border-accent',
          focus,
        )}
      >
        <BaseSwitch.Thumb className="block size-5 bg-ink transition-transform duration-200 ease-out data-checked:translate-x-5.5 data-checked:bg-on-accent" />
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
    <div className="flex min-h-12 items-center justify-between gap-3 py-2">
      <span>{label}</span>
      <BaseSelect.Root items={items} value={value} onValueChange={(v) => v != null && onChange(v as T)}>
        <BaseSelect.Trigger
          aria-label={label}
          className={cx('flex min-h-11 min-w-32 items-center justify-between gap-3 border border-ink px-3 py-2', focus)}
        >
          <BaseSelect.Value />
          <BaseSelect.Icon className="rotate-90 text-ink">
            <Icon name="next" className="size-3.5" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="z-50 outline-none" sideOffset={6}>
            <BaseSelect.Popup className="max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto border border-ink bg-bg py-1 text-ink transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              {items.map((i) => (
                <BaseSelect.Item
                  key={i.value}
                  value={i.value}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2.5 outline-none select-none data-highlighted:bg-surface-2"
                >
                  <BaseSelect.ItemIndicator className="col-start-1 text-accent">
                    <Icon name="check" className="size-4" strokeWidth={2} />
                  </BaseSelect.ItemIndicator>
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
        <Drawer.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black opacity-[calc(0.45*(1-var(--drawer-swipe-progress)))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
          <Drawer.Popup className="-mb-12 max-h-[calc(88dvh+3rem)] rubriques w-full max-w-xl overflow-y-auto overscroll-contain border-t-2 border-ink bg-bg px-4 pt-2.5 pb-[calc(1.25rem+env(safe-area-inset-bottom)+3rem)] text-ink outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:[transform:translateY(calc(100%-3rem+2px))] data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-swiping:select-none">
            <div className="mx-auto mb-2 h-0.5 w-10 bg-ink" />
            <Drawer.Content>
              <div className="mb-4 flex items-center justify-between border-b border-ink pb-1">
                <Drawer.Title className="text-[1.6rem] leading-tight font-medium tracking-[-0.01em] first-letter:uppercase">{title}</Drawer.Title>
                <Drawer.Close className={cx('-mr-2.5 grid size-11 shrink-0 place-items-center active:opacity-50', focus)} aria-label="Fermer">
                  <Icon name="close" />
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

export const flowBg = ['bg-surface-2', 'bg-flow-1', 'bg-flow-2', 'bg-flow-3', 'bg-flow-4', 'bg-flow-5'] as const
/** Texte lisible sur chaque niveau de flux. */
export const flowText = ['text-ink', 'text-ink', 'text-ink', 'text-on-flow', 'text-on-flow', 'text-on-flow'] as const
