import { useState } from 'react'
import { api, type Couple } from '../lib/api'
import { Card, cx, inputClass, SectionTitle, Select } from './ui'

const CYCLES = Array.from({ length: 26 }, (_, i) => ({ value: i + 20, label: `${i + 20} jours` }))

/** Réglages propres au suivi des règles (onglet « Réglages » de l'espace Cycle). */
export function CycleSettings({ couple, onChange }: { couple: Couple; onChange: () => void }) {
  const [msg, setMsg] = useState('')

  const updateCouple = async (patch: Partial<Couple>) => {
    setMsg('')
    try {
      await api('couple', { method: 'PATCH', body: patch })
      onChange()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Card>
        <SectionTitle>Suivi</SectionTitle>
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="shrink-0">Pose du stérilet</span>
          <input
            type="date"
            className={cx(inputClass, 'max-w-[55%] py-2.5')}
            value={couple.iud_inserted_on ?? ''}
            onChange={(e) => updateCouple({ iud_inserted_on: e.target.value || null })}
          />
        </label>
        <Select
          label="Cycle par défaut"
          value={couple.default_cycle_length}
          items={CYCLES}
          onChange={(default_cycle_length) => updateCouple({ default_cycle_length })}
        />
        <p className="text-sm text-ink-2">Utilisé tant qu’il n’y a pas deux cycles complets notés.</p>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
      </Card>

      <Card>
        <SectionTitle>Rappels</SectionTitle>
        <p className="text-sm">
          Un rappel par jour, vers 19 h : chaque jour de règles non noté, quand ça semble fini, 2 jours avant les prochaines règles, le jour prévu
          et en cas de retard. Il part sur les téléphones de vous deux.
        </p>
        <p className="mt-2 text-sm text-ink-2">Pour les recevoir, activez les notifications sur ce téléphone dans l’onglet Réglages en bas.</p>
      </Card>
    </div>
  )
}
