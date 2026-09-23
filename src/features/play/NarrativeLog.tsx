import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  stripControlChars,
  type ActionResultFrame,
  type ErrorFrame,
  type NarrativeFrame,
  type SystemFrame,
} from "@loreweaver/protocol"
import { useSessionStore, type LogEntry, type PendingEcho } from "../../store/session"
import DiceLine from "./DiceLine"
import UiBlocks from "./UiBlocks"

function speakerLabel(frame: NarrativeFrame, systemLabel: string): string {
  if (frame.speaker === "kp") return "KP"
  if (frame.speaker === "npc") return stripControlChars(frame.name ?? "NPC")
  if (frame.speaker === "system") return systemLabel
  return stripControlChars(frame.name ?? "?")
}

function NarrativeEntry({ frame, draft }: { frame: NarrativeFrame; draft?: boolean }) {
  const { t } = useTranslation()
  const text = stripControlChars(frame.text)
  return (
    <article className={`log-entry speaker-${frame.speaker}`}>
      <header className="entry-speaker">{speakerLabel(frame, t("log.system"))}</header>
      <div className="entry-body">
        {frame.format === "markdown" ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        ) : (
          <p className="entry-plain">{text}</p>
        )}
        {draft ? <span className="stream-cursor" aria-hidden="true" /> : null}
      </div>
    </article>
  )
}

/** A line this client sent, dimmed until the table reflects it back. */
function PendingEntry({ pending }: { pending: PendingEcho }) {
  const { t } = useTranslation()
  return (
    <article className={`log-entry speaker-player pending${pending.failed ? " failed" : ""}`}>
      <header className="entry-speaker">{stripControlChars(pending.speaker)}</header>
      <div className="entry-body">
        <p className="entry-plain">{stripControlChars(pending.text)}</p>
        <span className="pending-mark">
          {pending.failed ? t("session.echoFailed") : t("session.echoPending")}
        </span>
      </div>
    </article>
  )
}

function SystemEntry({ frame }: { frame: SystemFrame }) {
  return (
    <div className={`system-line level-${frame.level}`}>
      {frame.spinner ? <span className="spinner spinner-inline" aria-hidden="true" /> : null}
      <span>{stripControlChars(frame.text)}</span>
    </div>
  )
}

/** The server refusing something, told where the player is already looking. */
function ErrorEntry({ frame }: { frame: ErrorFrame }) {
  const { t } = useTranslation()
  const detail = stripControlChars(frame.message).trim()
  return (
    <div className="system-line level-error" role="status">
      <span>{t("session.serverRefused", { message: detail || frame.code })}</span>
    </div>
  )
}

function ActionResultEntry({ frame }: { frame: ActionResultFrame }) {
  const { t } = useTranslation()
  if (!frame.ok || !frame.result) {
    return <div className="system-line level-error" role="status">{t("combat.invalid", { reason: stripControlChars(frame.validation_failure ?? "") })}</div>
  }
  const result = frame.result
  const actor = stripControlChars(result.actor) || t("combat.unknownAttacker")
  const target = stripControlChars(result.target)
  const weapon = stripControlChars(frame.labels?.weapon ?? result.weapon_profile_id)
  const reaction = result.reaction
  const declined = reaction?.declined === true
  const hasRoll = result.attack_roll !== null
  return <article className="log-entry combat-result" aria-label={t("combat.result")}>
    <header className="entry-speaker">{t("combat.result")}</header>
    <div className="entry-body">
      <p>{actor}{target ? ` → ${target}` : ""} · {stripControlChars(frame.labels?.action ?? result.action)}{weapon ? ` · ${weapon}` : ""}</p>
      {hasRoll ? <p>{t("combat.roll")}: {result.attack_roll}{result.attack_target !== null ? ` / ${result.attack_target}` : ""} · {result.success ? t("combat.hit") : t("combat.miss")} · {t("combat.degrees")}: {result.degrees}</p> : null}
      {result.pending_reaction ? <p role="status">{t("combat.awaitingReaction", { defender: result.pending_reaction.defender })}</p> : null}
      {result.hits.map((hit, index) => {
        const location = stripControlChars(frame.labels?.locations[String(hit.location)] ?? String(hit.location ?? ""))
        const mitigated = hit.armour_after_penetration !== null && hit.tb_reduction !== null
        return <p key={index}>{t("combat.hitNumber", { number: index + 1 })}: {location} · {t("combat.damage")}: {mitigated ? `${String(hit.raw_damage)} − ${String(hit.armour_after_penetration)} − ${String(hit.tb_reduction)} = ` : ""}{String(hit.final_damage)}</p>
      })}
      {reaction ? <p>{t("combat.reaction")}: {stripControlChars(frame.labels?.reaction ?? String(reaction.type ?? ""))}{declined ? "" : ` · ${String(reaction.roll)}${reaction.target !== undefined ? ` / ${String(reaction.target)}` : ""} · ${reaction.success ? t("combat.success") : t("combat.failure")}`}</p> : null}
      {result.ammo_before !== null ? <p>{t("combat.ammo")}: {result.ammo_before} → {result.ammo_after}</p> : null}
      {hasRoll && !result.pending_reaction ? <p>{t("combat.damage")}: {result.final_damage}</p> : null}
      {result.target_defeated ? <p role="status">{t("combat.targetDefeated", { target: target || t("combat.unseenCombatant") })}</p> : null}
    </div>
  </article>
}

function Entry({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case "narrative":
      return <NarrativeEntry frame={entry.frame} draft={entry.draft} />
    case "dice":
      return <DiceLine frame={entry.frame} />
    case "action_result":
      return <ActionResultEntry frame={entry.frame} />
    case "system":
      return <SystemEntry frame={entry.frame} />
    case "error":
      return <ErrorEntry frame={entry.frame} />
    case "ui":
      return (
        <div className="log-ui">
          <UiBlocks frame={entry.frame} />
        </div>
      )
    case "pending":
      return <PendingEntry pending={entry.pending} />
  }
}

/** How close to the bottom (px) still counts as "following the stream". */
export const FOLLOW_SLACK_PX = 48

/** How often the log checks whether an un-echoed line has run out of time. */
export const ECHO_SWEEP_MS = 5_000

export default function NarrativeLog() {
  const { t } = useTranslation()
  const entries = useSessionStore((s) => s.entries)
  const expireEchoes = useSessionStore((s) => s.expirePendingEchoes)
  const scroller = useRef<HTMLDivElement>(null)
  // Streaming turns one reply into dozens of updates; only follow when the
  // reader is already pinned at the bottom, so scrolling up to reread history
  // is never yanked back down mid-stream.
  const pinned = useRef(true)

  const onScroll = () => {
    const el = scroller.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX
  }

  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries])

  // A line the table never reflected back has to say so rather than sit there
  // looking sent. The sweep only runs while something is actually waiting.
  const waiting = entries.some((entry) => entry.kind === "pending" && !entry.pending.failed)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => expireEchoes(Date.now()), ECHO_SWEEP_MS)
    return () => clearInterval(timer)
  }, [waiting, expireEchoes])

  return (
    <div className="narrative-log" ref={scroller} onScroll={onScroll}>
      {entries.length === 0 ? <p className="log-empty">{t("session.empty")}</p> : null}
      {entries.map((entry) => (
        <Entry key={entry.seq} entry={entry} />
      ))}
    </div>
  )
}
