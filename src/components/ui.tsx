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

const buttonVariants = {
  primary: 'accent-fill font-bold active:translate-y-px',
  secondary: 'raised text-ink font-semibold active:translate-y-px',
  outline: 'raised text-ink font-semibold active:translate-y-px',
  link: 'bg-transparent text-accent font-semibold !p-0 !min-h-0 self-start active:opacity-60',
  ghost: 'bg-transparent text-ink-2 font-medium !p-0 !min-h-0 active:opacity-60',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<typeof BaseButton> & { variant?: keyof typeof buttonVariants }) {
  return (
    <BaseButton
      className={cx(
        'min-h-12 rounded-2xl px-4 py-3 tracking-[-0.01em] select-none transition-[transform,box-shadow,opacity] duration-150 disabled:opacity-45 disabled:saturate-50',
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
      className={cx('raised grid size-10 place-items-center rounded-full text-ink transition-[box-shadow,transform] active:scale-95', focus, className as string)}
      {...props}
    />
  )
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('card p-4', className)} {...props} />
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="eyebrow mb-2">{children}</h3>
}

export const inputClass = 'field'

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
            'raised min-h-10 rounded-full px-3.5 py-2 text-sm font-medium transition-[box-shadow,color]',
            'data-pressed:bg-accent-soft data-pressed:bg-none data-pressed:font-bold data-pressed:text-accent data-pressed:shadow-[inset_0_0_0_1.5px_var(--color-accent)]',
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
    <label className="flex min-h-11 items-center justify-between gap-3 py-2">
      <span className="font-medium">{label}</span>
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className={cx(
          // Pouce centré : 3 px de marge tout autour, il glisse de 50 − 2×3 − 24 = 20 px.
          'well relative inline-flex h-7.5 w-12.5 shrink-0 items-center rounded-full p-0.75 transition-colors duration-200 data-checked:bg-accent data-checked:shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)]',
          focus,
        )}
      >
        <BaseSwitch.Thumb className="block size-6 rounded-full bg-linear-to-b from-white to-[#f1eff0] shadow-[inset_0_1px_0_#fff,0_1px_2px_rgb(0_0_0/0.25),0_2px_5px_rgb(0_0_0/0.18)] transition-transform duration-200 ease-out data-checked:translate-x-5" />
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
        <BaseSelect.Trigger
          aria-label={label}
          className={cx('raised flex min-h-11 min-w-32 items-center justify-between gap-3 rounded-[0.875rem] px-3.5 py-2.5 font-medium', focus)}
        >
          <BaseSelect.Value />
          <BaseSelect.Icon className="text-ink-2">
            <Icon name="chevron-down" className="size-4" strokeWidth={2} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="z-50 outline-none" sideOffset={6}>
            <BaseSelect.Popup className="max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) floating overflow-y-auto rounded-2xl p-1 text-ink transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              {items.map((i) => (
                <BaseSelect.Item
                  key={i.value}
                  value={i.value}
                  className="grid min-h-10 cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-xl px-3 py-2 outline-none select-none data-highlighted:bg-surface-2"
                >
                  <BaseSelect.ItemIndicator className="col-start-1 text-accent">
                    <Icon name="check" className="size-4" strokeWidth={2.4} />
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
          <Drawer.Popup className="-mb-12 max-h-[calc(88dvh+3rem)] w-full max-w-xl overflow-y-auto overscroll-contain sheet rounded-t-[1.75rem] px-4 pt-2.5 pb-[calc(1.25rem+env(safe-area-inset-bottom)+3rem)] text-ink outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:[transform:translateY(calc(100%-3rem+2px))] data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-swiping:select-none">
            <div className="mx-auto mb-3 h-1.25 w-10 rounded-full bg-ink/15" />
            <Drawer.Content>
              <div className="mb-2 flex items-center justify-between">
                <Drawer.Title className="text-[1.375rem] font-bold tracking-[-0.025em] first-letter:uppercase">{title}</Drawer.Title>
                <Drawer.Close className={cx('raised grid size-10 place-items-center rounded-full text-ink-2', focus)} aria-label="Fermer">
                  <Icon name="close" className="size-4.5" strokeWidth={2} />
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
