import { useState } from "react"
import { saveRefresh } from "@/api"
import { ActionDialog } from "@/components/action-dialog"
import { Choice } from "@/components/choice"
import { LabelledSegmented } from "@/components/segmented"
import { Input } from "@/components/ui/input"
import { refreshError, toRefreshSettings, type RefreshUnit, type RefreshValues } from "@/forms/refresh"
import { useI18n } from "@/i18n"
import { saveErrorMessage } from "@/save-error"

export function RefreshFields({ prefix, values, onChange }: { prefix: string; values: RefreshValues; onChange: (values: RefreshValues) => void }) {
  const { t } = useI18n()
  const one = values.interval.trim() === "1"
  return (
    <div className="grid gap-3">
      <LabelledSegmented label={t("form.refreshLabel")} value={values.type} onChange={(type) => onChange({ ...values, type: type as RefreshValues["type"] })} options={[{ value: "interval", label: t("form.refreshEvery") }, { value: "scheduled", label: t("form.refreshDaily") }]} />
      {values.type === "interval" ? (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
          <Input id={`${prefix}-interval`} aria-label={t("form.refreshEvery")} className="min-h-10 tabular-nums" inputMode="numeric" autoComplete="off" value={values.interval} onChange={(event) => onChange({ ...values, interval: event.target.value })} />
          <Choice<RefreshUnit> id={`${prefix}-unit`} label={t("settings.unit")} value={values.unit} onChange={(unit) => onChange({ ...values, unit })} options={[
            { value: "minute", label: t(one ? "settings.minute" : "settings.minutes") },
            { value: "hour", label: t(one ? "settings.hour" : "settings.hours") },
            { value: "day", label: t(one ? "form.day" : "form.days") },
          ]} />
        </div>
      ) : (
        <Input id={`${prefix}-time`} type="time" step={900} aria-label={t("form.refreshDaily")} className="min-h-10 w-fit" value={values.time} onChange={(event) => onChange({ ...values, time: event.target.value })} />
      )}
    </div>
  )
}

export function ScheduleDialog({ pluginId, instance, current, opener, onClose, onDone }: { pluginId: string; instance: string; current: RefreshValues; opener: string; onClose: () => void; onDone: (values: RefreshValues) => void }) {
  const { t } = useI18n()
  const [refresh, setRefresh] = useState(current)
  return (
    <ActionDialog
      title={t("form.schedule")}
      description={t("form.scheduleHelp")}
      confirm={t("action.save")}
      opener={opener}
      onClose={onClose}
      onSubmit={async () => {
        const invalid = refreshError(refresh)
        if (invalid) return t(invalid)
        try {
          await saveRefresh(pluginId, instance, toRefreshSettings(refresh))
          onDone(refresh)
          return null
        } catch (error) {
          return saveErrorMessage(error, t)
        }
      }}
    >
      <RefreshFields prefix="edit" values={refresh} onChange={setRefresh} />
    </ActionDialog>
  )
}
