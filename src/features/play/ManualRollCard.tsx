import { useEffect, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useManualRollStore } from "../../store/manualRoll"

export default function ManualRollCard() {
  const { t } = useTranslation()
  const pending = useManualRollStore((s) => s.pending)
  const status = useConnectionStore((s) => s.status)
  const restoreRequested = useRef(false)
  const [faces, setFaces] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const pendingRequestId = pending?.request_id
  const pendingCount = pending?.count ?? 0

  useEffect(() => {
    setFaces(Array.from({ length: pendingCount }, () => ""))
    setSending(false)
    setSendFailed(false)
  }, [pendingRequestId, pendingCount])

  // The engine persists a pending physical roll in room state, while this store is
  // intentionally transient and is cleared when a connection is replaced. Ask once
  // per online generation for the persisted request. This also covers mounting the
  // play screen after the join has already settled. Keep the one-shot latch set after
  // a normal roll completes so roll_cancel -> pending=null does not immediately issue
  // a pointless second query; reconnecting resets it for the next generation.
  useEffect(() => {
    if (status !== "online") {
      restoreRequested.current = false
      return
    }
    if (pending !== null || restoreRequested.current) return
    restoreRequested.current = true
    void transportSend({ type: "input", text: ".__roll_pending" }).catch(() => {
      // A failed send may be retried if this online generation renders again after
      // another dependency change; the transport itself owns the visible error state.
      restoreRequested.current = false
    })
  }, [status, pending])

  if (!pending) return null

  const parsed = faces.map((value) => Number(value))
  const valid =
    faces.length === pending.count &&
    faces.every((value) => value.trim().length > 0) &&
    parsed.every((value) => Number.isInteger(value) && value >= 1 && value <= pending.sides)
  const canSubmit = status === "online" && valid && !sending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setSending(true)
    setSendFailed(false)
    const text = `.__roll_submit ${pending.request_id} ${parsed.join(" ")}`
    void transportSend({ type: "input", text }).catch(() => {
      setSending(false)
      setSendFailed(true)
    })
  }

  const setFace = (index: number, value: string) => {
    setFaces((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  const target = pending.effective_target ?? pending.target

  return (
    <section className="panel-notice" aria-live="polite">
      <form onSubmit={submit} style={{ width: "100%", display: "grid", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
          <strong>{pending.reason || t("manualRoll.title")}</strong>
          {pending.difficulty ? <span>{t("manualRoll.difficulty", { value: pending.difficulty })}</span> : null}
          {target !== undefined ? <span>{t("manualRoll.target", { value: target })}</span> : null}
        </div>
        <div>{t("manualRoll.throw", { expression: pending.expression })}</div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
          {faces.map((face, index) => (
            <label className="field" key={index} style={{ minWidth: pending.count === 1 ? "10rem" : "7rem" }}>
              {pending.count === 1 ? t("manualRoll.result") : t("manualRoll.die", { index: index + 1 })}
              <input
                autoFocus={index === 0}
                type="number"
                inputMode="numeric"
                min={1}
                max={pending.sides}
                step={1}
                value={face}
                onChange={(event) => setFace(index, event.target.value)}
                aria-label={pending.count === 1 ? t("manualRoll.result") : t("manualRoll.die", { index: index + 1 })}
                disabled={status !== "online" || sending}
              />
            </label>
          ))}
          <button type="submit" disabled={!canSubmit}>
            {sending ? t("manualRoll.submitting") : t("manualRoll.submit")}
          </button>
        </div>
        {sendFailed ? <p className="connect-error">{t("manualRoll.sendFailed")}</p> : null}
      </form>
    </section>
  )
}
