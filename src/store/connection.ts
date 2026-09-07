import { create } from "zustand"
import { isServerFrame, protocolMismatch, type WelcomeFrame } from "@loreweaver/protocol"
import i18n from "../i18n"
import {
  createConnection,
  isTauri,
  transportConnect,
  transportDisconnect,
  type DialParams,
  type TransportEvent,
  type TransportStatus,
} from "../lib/transport"
import { useAdminStore } from "./admin"
import { useAudioStore } from "./audio"
import { isManualRollServerFrame, useManualRollStore } from "./manualRoll"
import { useMediaStore } from "./media"
import { useSessionStore } from "./session"

/** Tolerate the ticket shapes people actually paste: the engine writes
 * `ticket=endpoint…` into iroh-ticket.txt, its console announce line reads
 * `Ticket：endpoint…`, and terminals wrap long tickets across lines. The real
 * ticket is the bare `endpoint…` string — slice from that marker when present
 * and strip all whitespace; anything else passes through for the transport's
 * own error message. */
export function sanitizeTicket(raw: string): string {
  const flat = raw.replace(/\s+/g, "")
  const at = flat.toLowerCase().indexOf("endpoint")
  return at > 0 ? flat.slice(at) : flat
}

/** Does this frame claim to be the handshake, whatever else is wrong with it?
 * Only the `type` is trusted here — that is the whole point: everything else
 * failed validation. */
function looksLikeWelcome(frame: unknown): boolean {
  return typeof frame === "object" && frame !== null && (frame as { type?: unknown }).type === "welcome"
}

interface ConnectionState {
  status: TransportStatus
  attempt: number
  lastError: string | null
  welcome: WelcomeFrame | null
  /**
   * The live Tauri-bridge generation. Events stamped with any other id are
   * dropped at `handleEvent` — including ones already sitting in the JS
   * queue when this is overwritten. `null` after disconnect, so a queued
   * Offline/Frame from the dying actor cannot write back.
   */
  connectionId: string | null
  /** A handshake this store refused. While set, transport statuses are ignored
   * — see `handleEvent`. Cleared only by an explicit new connect. */
  refused: boolean
  connect: (params: DialParams) => Promise<void>
  disconnect: () => Promise<void>
  /** Single entry point for everything the Rust bridge emits. */
  handleEvent: (event: TransportEvent) => void
}

type Setter = (partial: Partial<ConnectionState>) => void
type Getter = () => ConnectionState

/** Refuse the handshake: go offline with a reason, latch it so the statuses
 * already in flight cannot undo it, and drop the connection rather than letting
 * the bridge redial into the same wall. */
function refuse(set: Setter, get: Getter, reason: string): void {
  set({ status: "offline", attempt: 0, welcome: null, lastError: reason, refused: true })
  void get().disconnect()
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "offline",
  attempt: 0,
  lastError: null,
  welcome: null,
  connectionId: null,
  refused: false,

  connect: async (params) => {
    set({ refused: false })
    if (!isTauri()) {
      set({
        status: "offline",
        lastError: "transport is only available inside the app shell",
        connectionId: null,
      })
      return
    }
    const generation = createConnection()
    set({
      status: "connecting",
      attempt: 0,
      lastError: null,
      welcome: null,
      connectionId: generation.connectionId,
    })
    useSessionStore.getState().clear()
    useManualRollStore.getState().clear()
    useMediaStore.getState().reset()
    useAudioStore.getState().reset()
    let failure: string | null = null
    try {
      await transportConnect({
        ...params,
        ticket: sanitizeTicket(params.ticket),
        key: params.key.trim(),
        generation,
      })
    } catch (err) {
      failure = String(err)
    }
    if (get().connectionId !== generation.connectionId || failure === null) return
    set({ status: "offline", lastError: failure, connectionId: null })
  },

  disconnect: async () => {
    const lastError = get().refused ? get().lastError : null
    const connectionId = get().connectionId
    set({ connectionId: null, status: "offline", attempt: 0, welcome: null, lastError })
    useManualRollStore.getState().clear()
    if (!isTauri()) return
    try {
      await transportDisconnect(connectionId)
    } catch {
      // A failed disconnect only means there was nothing to disconnect.
    }
  },

  handleEvent: (event) => {
    if (event.connectionId !== get().connectionId) return
    if (event.kind === "status") {
      if (get().refused) return
      set((state) => ({
        status: event.status,
        attempt: event.attempt,
        lastError: event.error ?? null,
        welcome: event.status === "offline" ? null : state.welcome,
      }))
      return
    }
    const frame = event.frame
    if (isManualRollServerFrame(frame)) {
      useManualRollStore.getState().ingest(frame)
      return
    }
    if (!isServerFrame(frame)) {
      if (looksLikeWelcome(frame)) refuse(set, get, i18n.t("connect.welcomeUnreadable"))
      return
    }
    if (frame.type === "welcome") {
      const mismatch = protocolMismatch(frame.protocol)
      if (mismatch) {
        refuse(set, get, i18n.t("connect.protocolMismatch", { ...mismatch }))
        return
      }
      set({ welcome: frame })
      return
    }
    // Rich-client plumbing still rides the normal hidden command lane. The engine
    // echoes matched commands to the sender, but service verbs are not table history.
    if (
      frame.type === "narrative" &&
      frame.speaker === "player" &&
      (frame.text.startsWith(".__roll_submit ") ||
        frame.text === ".__roll_pending" ||
        frame.text.startsWith(".__creation_action "))
    ) {
      return
    }
    if (useAdminStore.getState().ingest(frame)) return
    if (useMediaStore.getState().ingest(frame)) return
    if (useAudioStore.getState().ingest(frame)) return
    useSessionStore.getState().ingest(frame)
  },
}))
