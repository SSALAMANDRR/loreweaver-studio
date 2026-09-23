import { act, fireEvent, render, screen } from "@testing-library/react"
import type { ActionResultFrame } from "@loreweaver/protocol"
import { beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { PENDING_ECHO_TIMEOUT_MS, useSessionStore } from "../../store/session"
import NarrativeLog, { ECHO_SWEEP_MS } from "./NarrativeLog"

const ingest = useSessionStore.getState().ingest

describe("NarrativeLog", () => {
  beforeEach(() => useSessionStore.getState().clear())

  it("renders server-authored combat damage, ammo and reaction without recomputing", () => {
    ingest({
      type: "action_result", id: "r1", ok: true, validation_failure: null,
      labels: { action: "Server attack", mode: "single", weapon: "Server weapon", locations: { body: "Server body" }, reaction: "Server dodge" },
      result: {
        actor: "Ada", target: "Beast", action: "custom", weapon_instance_id: "i1", weapon_profile_id: "p1",
        attack_target: 60, attack_roll: 20, success: true, margin: 4, degrees: 4, hit_location: "body",
        reaction: { type: "dodge", roll: 70, target: 40, success: false }, raw_damage: 11, penetration: 0,
        armour_before: 3, armour_after_penetration: 3, tb_reduction: 5, final_damage: 3,
        ammo_before: 4, ammo_after: 3, state_delta: { ammo_before: 4, ammo_after: 3 },
        validation_failure: null, hits: [{ location: "body", raw_damage: 11, armour_after_penetration: 3, tb_reduction: 5, final_damage: 3 }], shots_fired: 1,
      },
    } as ActionResultFrame)
    render(<NarrativeLog />)
    expect(screen.getByText(/Server attack/)).toBeInTheDocument()
    expect(screen.getByText(/Server body/)).toBeInTheDocument()
    expect(screen.getByText(/Server dodge/)).toBeInTheDocument()
    expect(screen.getByText(/4 → 3/)).toBeInTheDocument()
  })

  it("renders a player-grade projected result without inventing hidden NPC values", () => {
    ingest({
      type: "action_result", id: "r2", ok: true, validation_failure: null,
      labels: { action: "Server attack", mode: "single", weapon: "Server weapon", locations: { body: "Server body" }, reaction: "Server parry" },
      result: {
        actor: "Ada", target: "Beast", action: "custom", weapon_instance_id: "i1", weapon_profile_id: "p1",
        attack_target: 60, attack_roll: 20, success: true, margin: 4, degrees: 4, hit_location: "body",
        reaction: { type: "parry", roll: 70, success: false }, raw_damage: 11, penetration: 0,
        armour_before: null, armour_after_penetration: null, tb_reduction: null, final_damage: 5,
        ammo_before: null, ammo_after: null, state_delta: { target_damage_after: null },
        validation_failure: null, hits: [{ location: "body", raw_damage: 11, armour_after_penetration: null, tb_reduction: null, final_damage: 5 }], shots_fired: 0,
      },
    } as ActionResultFrame)
    ingest({
      type: "action_result", id: "r3", ok: true, validation_failure: null,
      result: {
        actor: "", target: "Ada", action: "custom", weapon_instance_id: "", weapon_profile_id: "p1",
        attack_target: null, attack_roll: 7, success: true, margin: 2, degrees: 2, hit_location: "body",
        reaction: null, raw_damage: null, penetration: null, armour_before: null, armour_after_penetration: null,
        tb_reduction: null, final_damage: 0, ammo_before: null, ammo_after: null, state_delta: null,
        validation_failure: null, hits: [], shots_fired: 0,
        pending_reaction: { id: "p", attacker: "", defender: "Ada", action: "custom", mode: "single", hit_count: 1 },
      },
    } as ActionResultFrame)
    render(<NarrativeLog />)
    expect(screen.getByText(/Hit 1: Server body · Damage: 5$/)).toBeInTheDocument()
    expect(screen.getByText(/Server parry · 70 · Failure/)).toBeInTheDocument()
    expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument()
    expect(screen.getByText("Waiting for Ada to react.")).toBeInTheDocument()
    expect(screen.getByText(/Unseen attacker → Ada/)).toBeInTheDocument()
  })

  it("shows the server's defeat verdict and names no hidden target", () => {
    const base = {
      actor: "Ada", action: "custom", weapon_instance_id: "i1", weapon_profile_id: "p1",
      attack_target: 60, attack_roll: 20, success: true, margin: 4, degrees: 4, hit_location: "body",
      reaction: null, raw_damage: 9, penetration: 0, armour_before: null, armour_after_penetration: null,
      tb_reduction: null, final_damage: 7, ammo_before: null, ammo_after: null, state_delta: null,
      validation_failure: null, hits: [], shots_fired: 0, target_defeated: true,
    }
    ingest({ type: "action_result", id: "d1", ok: true, validation_failure: null, result: { ...base, target: "Beast" } } as ActionResultFrame)
    ingest({ type: "action_result", id: "d2", ok: true, validation_failure: null, result: { ...base, target: "" } } as ActionResultFrame)
    render(<NarrativeLog />)
    expect(screen.getByText("Beast is out of the fight.")).toBeInTheDocument()
    expect(screen.getByText("An unseen combatant is out of the fight.")).toBeInTheDocument()
  })

  it("renders markdown narrative as rich text", () => {
    ingest({
      type: "narrative",
      id: "n1",
      speaker: "kp",
      text: "The **lantern** dies.",
      format: "markdown",
    })
    render(<NarrativeLog />)
    expect(screen.getByText("lantern")).toBeInstanceOf(HTMLElement)
    expect(screen.getByText("lantern").tagName).toBe("STRONG")
  })

  it("labels NPC lines with the NPC name and players with theirs", () => {
    ingest({
      type: "narrative",
      id: "n2",
      speaker: "npc",
      name: "沈墨",
      text: "别碰那口井。",
      format: "markdown",
    })
    ingest({
      type: "narrative",
      id: "n3",
      speaker: "player",
      name: "Ash",
      text: "I step back.",
      format: "plain",
    })
    render(<NarrativeLog />)
    expect(screen.getByText("沈墨")).toBeInTheDocument()
    expect(screen.getByText("Ash")).toBeInTheDocument()
  })

  it("shows a blinking cursor only while the draft is open", () => {
    ingest({
      type: "narrative_delta",
      id: "s1",
      speaker: "kp",
      text: "The fog",
    })
    const { container, rerender } = render(<NarrativeLog />)
    expect(container.querySelector(".stream-cursor")).not.toBeNull()

    // The closing `narrative` (same id, full final text) seals the bubble.
    ingest({
      type: "narrative",
      id: "s1",
      speaker: "kp",
      text: "The fog settles.",
      format: "markdown",
    })
    rerender(<NarrativeLog />)
    expect(container.querySelector(".stream-cursor")).toBeNull()
    expect(screen.getByText("The fog settles.")).toBeInTheDocument()
  })

  it("follows a stream only while the reader is pinned near the bottom", () => {
    const delta = (text: string) =>
      act(() => ingest({ type: "narrative_delta", id: "s1", speaker: "kp", text }))
    delta("The fog ")
    const { container } = render(<NarrativeLog />)
    const log = container.querySelector(".narrative-log") as HTMLDivElement
    Object.defineProperty(log, "scrollHeight", { value: 1000, configurable: true })
    Object.defineProperty(log, "clientHeight", { value: 200, configurable: true })

    // Scrolled up to reread history: a new delta must not yank the view down.
    log.scrollTop = 100
    fireEvent.scroll(log)
    delta("thickens ")
    expect(log.scrollTop).toBe(100)

    // Back at the bottom: following resumes.
    log.scrollTop = 780
    fireEvent.scroll(log)
    delta("over the pier.")
    expect(log.scrollTop).toBe(1000)
  })

  it("renders a pending echo dimmed, and stops rendering it once the line lands", () => {
    act(() => {
      useSessionStore.getState().echoLocalInput("I check the ledger.", "Nyx")
    })
    const { container, rerender } = render(<NarrativeLog />)
    expect(container.querySelector(".log-entry.pending")).not.toBeNull()
    expect(screen.getByText("sending…")).toBeInTheDocument()

    act(() => {
      ingest({
        type: "narrative",
        id: "p1",
        speaker: "player",
        name: "Nyx",
        text: "I check the ledger.",
        format: "plain",
      })
    })
    rerender(<NarrativeLog />)
    expect(container.querySelector(".log-entry.pending")).toBeNull()
    // Once — never the echo and the real line side by side.
    expect(screen.getAllByText("I check the ledger.")).toHaveLength(1)
  })

  it("turns an un-echoed line into a failure notice after the timeout", () => {
    vi.useFakeTimers()
    try {
      act(() => {
        useSessionStore.getState().echoLocalInput("I check the ledger.", "Nyx", Date.now())
      })
      const { container } = render(<NarrativeLog />)
      act(() => {
        vi.advanceTimersByTime(PENDING_ECHO_TIMEOUT_MS + ECHO_SWEEP_MS)
      })
      expect(container.querySelector(".log-entry.pending.failed")).not.toBeNull()
      expect(screen.getByText("not delivered")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("renders system spinner notices with an animated spinner element", () => {
    ingest({ type: "system", level: "info", text: "Summoning the Keeper…", spinner: true })
    const { container } = render(<NarrativeLog />)
    expect(container.querySelector(".spinner")).not.toBeNull()
  })

  it("shows the turn-queued notice as a visible info line beside the still-pending echo", () => {
    // `net/session.py: notify_turn_queued` — sent privately to a member whose
    // input arrived while someone else's turn holds the room lock, well before
    // the queued line itself runs. The exact wire shape the engine sends.
    act(() => {
      useSessionStore.getState().echoLocalInput(".pack install gh:1A7432/antu@v1.0.0", "Nyx")
    })
    act(() => {
      ingest({ type: "system", level: "info", text: "Your input is queued behind the running turn." })
    })
    const { container } = render(<NarrativeLog />)

    // The held line is still there, dimmed…
    expect(container.querySelector(".log-entry.pending")).not.toBeNull()
    // …and the queue notice is its own visible line beside it, not swallowed.
    expect(screen.getByText("Your input is queued behind the running turn.")).toBeInTheDocument()
    const notice = container.querySelector(".system-line")
    expect(notice?.className).toContain("level-info")
    expect(notice?.className).not.toContain("level-error")
  })
})
