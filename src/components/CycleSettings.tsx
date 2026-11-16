import { useState, type FormEvent } from 'react'
import { api, cycleLabel, type CycleInfo } from '../lib/api'
import { CyclePicker } from './CyclePicker'
import { NotificationSwitches } from './NotificationSwitches'
import { Button, cx, Group, inputClass, Select, Sheet } from './ui'

const CYCLES = Array.from({ length: 26 }, (_, i) => ({ value: i + 20, label: `${i + 20} jours` }))

interface Props {
  cycles: CycleInfo[]
  /** Cycle dont on règle les paramètres (le même que celui affiché dans l'espace). */
  cycle: CycleInfo
  onCycle: (id: string) => void
  /** Prénoms des membres, proposés pour nommer un cycle. */
  names: string[]
  other: string
  onChange: () => void
}

/** Réglages propres au suivi des règles : un ou plusieurs cycles suivis, et les rappels. */
export function CycleSettings({ cycles, cycle, onCycle, names, other, onChange }: Props) {
  const [msg, setMsg] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const several = cycles.length > 1
  const label = cycleLabel(cycles, cycle)

  const call = async <T,>(path: string, method: string, body?: unknown): Promise<T | null> => {
    setMsg('')
    try {
      const res = await api<T>(path, { method, body })
      onChange()
      return res
    } catch (e) {
      setMsg((e as Error).message)
      return null
    }
  }
  const update = (patch: Partial<CycleInfo>) => call('cycles', 'PATCH', { id: cycle.id, ...patch })

  const remove = async () => {
    setBusy(true)
    const next = await call<CycleInfo[]>(`cycles?id=${encodeURIComponent(cycle.id)}`, 'DELETE')
    setBusy(false)
    if (!next) return
    setRemoving(false)
    onCycle(next[0].id)
  }

  return (
    <div className="flex flex-col gap-5">
      {several && <CyclePicker cycles={cycles} value={cycle.id} onChange={onCycle} />}

      <Group title={several ? `Suivi de ${label}` : 'Suivi'}>
        <NameField key={cycle.id} value={cycle.name} optional={!several} onSave={(name) => update({ name })} />
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="shrink-0 font-medium">Pose du stérilet</span>
          <input
            type="date"
            className={cx(inputClass, 'max-w-[55%] py-2.5')}
            value={cycle.iud_inserted_on ?? ''}
            onChange={(e) => update({ iud_inserted_on: e.target.value || null })}
          />
        </label>
        <Select
          label="Cycle par défaut"
          value={cycle.default_cycle_length}
          items={CYCLES}
          onChange={(default_cycle_length) => update({ default_cycle_length })}
        />
        <p className="text-sm text-ink-2">Utilisé tant qu’il n’y a pas deux cycles complets notés.</p>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
        {several && (
          <Button variant="link" className="mt-2 text-accent" onClick={() => setRemoving(true)}>
            Ne plus suivre le cycle de {label}
          </Button>
        )}
      </Group>

      <Group title="Cycles suivis">
        <p className="text-sm">
          {several
            ? `${cycles.length} cycles suivis dans cet espace : ${cycles.map((c) => cycleLabel(cycles, c)).join(', ')}. Chacun a son calendrier, ses prévisions et ses rappels.`
            : 'Un couple de femmes, des sœurs… Vous pouvez suivre plusieurs cycles ici : chacun a son calendrier, ses prévisions et ses rappels.'}
        </p>
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setAdding(true)}>
          Suivre un autre cycle
        </Button>
      </Group>

      <NotificationSwitches
        items={[
          { kind: 'reminders', label: several ? 'Rappels des cycles' : 'Rappels du cycle' },
          { kind: 'cycle', label: `Quand ${other} note ${several ? 'un cycle' : 'le cycle'}` },
        ]}
      >
        <p className="mt-1 text-sm text-ink-2">
          Rappels : un par jour{several ? ' et par cycle' : ''}, vers 19 h (jour de règles non noté, fin probable, 2 jours avant les prochaines
          règles, jour prévu, retard), sur les téléphones de l’espace. Quand {other} note {several ? 'un cycle' : 'le cycle'}, une seule
          notification résume ses saisies, environ 20 secondes après la dernière.
        </p>
      </NotificationSwitches>

      <AddCycle
        open={adding}
        onClose={() => setAdding(false)}
        cycles={cycles}
        names={names}
        onAdded={(id) => {
          setAdding(false)
          onChange()
          onCycle(id)
        }}
      />

      <Sheet open={removing} onClose={() => setRemoving(false)} title={`Ne plus suivre ${label} ?`}>
        <p>Toutes les journées notées pour {label} seront effacées, pour vous deux. Les autres cycles ne changent pas.</p>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={remove} busy={busy}>
            Effacer le cycle de {label}
          </Button>
          <Button variant="secondary" onClick={() => setRemoving(false)} disabled={busy}>
            Annuler
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

/** Prénom de la personne dont c'est le cycle, enregistré en quittant le champ. */
function NameField({ value, optional, onSave }: { value: string; optional: boolean; onSave: (name: string) => void }) {
  const [name, setName] = useState(value)
  const save = () => {
    const next = name.trim()
    if (!next && !optional) return setName(value)
    if (next !== value) onSave(next)
  }
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 font-medium">Prénom</span>
      <input
        className={cx(inputClass, 'max-w-[55%] py-2.5')}
        value={name}
        placeholder={optional ? 'Facultatif' : undefined}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}

/** Ajout d'un cycle : son prénom, et celui du premier cycle s'il n'en avait pas encore. */
function AddCycle({
  open,
  onClose,
  cycles,
  names,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  cycles: CycleInfo[]
  names: string[]
  onAdded: (id: string) => void
}) {
  const unnamed = cycles.length === 1 && !cycles[0].name.trim() ? cycles[0] : null
  const [first, setFirst] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const taken = new Set(cycles.map((c) => c.name.trim().toLowerCase()))
  const suggestions = names.filter((n) => n.trim() && !taken.has(n.trim().toLowerCase()) && n !== first && n !== name)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      if (unnamed) await api('cycles', { method: 'PATCH', body: { id: unnamed.id, name: first.trim() } })
      const next = await api<CycleInfo[]>('cycles', { method: 'POST', body: { name: name.trim() } })
      const added = next.find((c) => !cycles.some((o) => o.id === c.id))
      setFirst('')
      setName('')
      onAdded(added?.id ?? next.at(-1)!.id)
    } catch (err) {
      setMsg((err as Error).message)
    }
    setBusy(false)
  }

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input className={inputClass} value={value} onChange={(e) => set(e.target.value)} maxLength={40} required />
      {suggestions.length > 0 && !value && (
        <span className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" className="sk-key min-h-9 rounded-full px-3 py-1 text-sm" onClick={() => set(s)}>
              {s}
            </button>
          ))}
        </span>
      )}
    </label>
  )

  return (
    <Sheet open={open} onClose={onClose} title="Suivre un autre cycle">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">Chaque cycle a son calendrier, ses prévisions et ses rappels. Vous passez de l’un à l’autre en haut de l’espace Cycle.</p>
        {unnamed && field('Prénom pour le cycle déjà suivi', first, setFirst)}
        {field('Prénom de la personne à ajouter', name, setName)}
        {msg && <p className="text-sm text-accent">{msg}</p>}
        <Button type="submit" busy={busy}>
          Ajouter
        </Button>
      </form>
    </Sheet>
  )
}
