// One-click local hosting state. `start` brings the server up through the
// Rust bridge, the event stream lands here, and the moment the ticket +
// auto-minted keeper key arrive we dial the connection — the TUI's "Host
// locally & play" in one press. Quitting the table stops the server we
// started (and only then; reconnects never kill it).

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { guardedLocalStorage } from "../lib/persistStorage"
import {
  hostEventApplies,
  hostLocalStart,
  hostLocalStatus,
  hostLocalStop,
  mintHostId,
  onHostLocalEvent,
  type HostLocalEvent,
} from "../lib/hostLocal"
import { isTauri } from "../lib/transport"
import { useAiStore } from "../features/studio/ai/provider"
import { useConnectionStore } from "./connection"

const MAX_LOG_LINES = 400

export type HostLocalPhase = "idle" | "starting" | "ready" | "error"
export type HostLocalExitKind = "before-ready" | "unexpected"

interface HostLocalState {
  phase: HostLocalPhase
  log: string[]
  error: string | null
  /** Structured death of THIS host session. The connect screen translates it. */
  exitKind: HostLocalExitKind | null
  exitCode: number | null
  /** Host session the WebView currently accepts events for. Minted on start,
   * adopted from `host_local_status` after a reload. */
  hostId: string | null
  /** After an explicit stop, only the confirming Exit for this id is accepted. */
  stoppingHostId: string | null
  /** A Ready that arrived while an explicit stop was still in flight. HELD, not
   * applied: whether it belongs to a child the stop killed or to one still on
   * its way is a question only the stop's own answer settles, and it settles
   * after the event has already crossed the bridge. */
  parkedReady: HostLocalEvent | null
  /** Whether the CURRENT connection came from our own local server. */
  hostedSession: boolean
  /** User-picked server folder ("" = the TUI-shared default chain). Persisted. */
  homeOverride: string
  /** The resolved effective home, for display (refreshed by refreshHome). */
  effectiveHome: string
  /** The credentials the LAST server we started handed us, kept for the home they
   * belong to. Persisted, because the case they exist for is the front end coming
   * back without them: the WebView reloads, the Rust side is still serving, and
   * `start` can then only answer "a local server is already running" — a dead end
   * that made a keeper dig a ticket out of a text file to sit back down at their own
   * table (2026-08-20 play-test). Local credentials for a local server, stored beside
   * the API key this app already keeps. */
  lastTicket: string
  lastKey: string
  lastTicketHome: string
  /** The dev-room source root the RUNNING server was started with ("" = none).
   * `TRPG_DEV__SOURCE_ROOT` is read at startup, so a caller that needs a
   * different one has to restart rather than reconfigure. */
  devSourceRoot: string

  setHomeOverride: (path: string) => void
  refreshHome: () => Promise<void>
  start: (devSourceRoot?: string) => Promise<void>
  /** Sit back down at a server this app already started; false when there is none
   * to sit at (or its credentials belong to another home). */
  reconnectIfServing: () => Promise<boolean>
  stop: () => Promise<void>
  ingest: (event: HostLocalEvent) => void
}

let subscribed = false

async function subscribeOnce(ingest: (event: HostLocalEvent) => void): Promise<void> {
  if (subscribed) return
  subscribed = true
  await onHostLocalEvent(ingest)
}

export const useHostLocalStore = create<HostLocalState>()(
  persist(
    (set, get) => ({
      phase: "idle",
      log: [],
      error: null,
      exitKind: null,
      exitCode: null,
      hostId: null,
      stoppingHostId: null,
      parkedReady: null,
      hostedSession: false,
      homeOverride: "",
      effectiveHome: "",
      devSourceRoot: "",
      lastTicket: "",
      lastKey: "",
      lastTicketHome: "",

      setHomeOverride: (path) => {
        set({ homeOverride: path })
        void get().refreshHome()
      },

      refreshHome: async () => {
        if (!isTauri()) return
        try {
          const status = await hostLocalStatus(get().homeOverride.trim() || undefined)
          set({ effectiveHome: status.home })
        } catch {
          // Display-only; the start path surfaces real errors.
        }
      },

      start: async (devSourceRoot = "") => {
        if (!isTauri()) {
          set({ phase: "error", error: "local hosting needs the desktop app" })
          return
        }
        if (get().phase === "starting") return
        const hostId = mintHostId()
        set({
          phase: "starting",
          log: [],
          error: null,
          exitKind: null,
          exitCode: null,
          hostedSession: false,
          devSourceRoot,
          hostId,
          stoppingHostId: null,
          parkedReady: null,
        })
        // Does this press still own the store? A cancel that is still in flight
        // owns it too — it holds this id as `stoppingHostId` and may hand it
        // back — but a LATER press has replaced us outright, and an abandoned
        // start may neither seat a child nobody is listening for nor report a
        // verdict about a session that is no longer on screen.
        const owns = () => {
          const state = get()
          return state.hostId === hostId || state.stoppingHostId === hostId
        }
        let failure: string | null = null
        try {
          await subscribeOnce(get().ingest)
          if (!owns()) return
          // Already serving? Then this press means "sit me back down", not "start one":
          // the Rust side would refuse, and refusing is the whole dead end.
          if (await get().reconnectIfServing()) return
          if (!owns()) return
          await hostLocalStart(
            useAiStore.getState().engineRepoDir.trim() || undefined,
            get().homeOverride.trim() || undefined,
            devSourceRoot || undefined,
            hostId,
          )
        } catch (cause) {
          failure = cause instanceof Error ? cause.message : String(cause)
        }
        // One guard over BOTH continuations: whatever this dial has to say, only
        // the generation that still owns the store may say it.
        if (!owns() || failure === null) return
        // Nothing seated under this id — Rust either never spawned or killed
        // its own leftover — so let the id go, and with it any cancel that is
        // still waiting for a child this start will never deliver.
        set((s) => ({
          phase: "error",
          error: failure,
          hostId: null,
          stoppingHostId: s.stoppingHostId === hostId ? null : s.stoppingHostId,
        }))
      },

      reconnectIfServing: async () => {
        if (!isTauri()) return false
        let status
        try {
          status = await hostLocalStatus(get().homeOverride.trim() || undefined)
        } catch {
          return false
        }
        const { lastTicket, lastKey, lastTicketHome } = get()
        // Credentials belong to the home that minted them: a different folder is a
        // different server with different keys, and dialing it with these would fail
        // in a way that reads like a bug rather than a mismatch.
        if (!status.running || !lastTicket || !lastKey || lastTicketHome !== status.home) return false
        // Adopt the live child's id so a later Exit (and only that child's
        // Exit) still reaches ingest after a WebView reload.
        set({
          phase: "ready",
          hostedSession: true,
          error: null,
          exitKind: null,
          exitCode: null,
          hostId: status.hostId ?? get().hostId,
          stoppingHostId: null,
        })
        await useConnectionStore.getState().connect({ ticket: lastTicket, key: lastKey })
        return true
      },

      stop: async () => {
        // Invalidate the current id first so a late Ready cannot revive us.
        // Keep it as stoppingHostId so the confirming Exit is still applied
        // (and only as a confirmation — we are already idle).
        const current = get().hostId
        const wasStarting = get().phase === "starting"
        set({
          phase: "idle",
          hostedSession: false,
          devSourceRoot: "",
          error: null,
          exitKind: null,
          exitCode: null,
          hostId: null,
          stoppingHostId: current,
          parkedReady: null,
        })
        let stopped = false
        try {
          stopped = await hostLocalStop()
        } catch {
          // Nothing to stop is fine.
        }
        // A Ready that crossed the bridge during the await is parked, not
        // applied (see `ingest`). Reconcile it with the answer we just got:
        // a stop that killed something makes it a dead child's last word.
        const parked = get().parkedReady
        set({ parkedReady: null })
        if (stopped || !wasStarting || current === null) return
        // Nothing was there to stop, yet we were mid-start: the cancel landed
        // during ACQUISITION (checkout / verified cache / a download that may
        // take minutes), before Rust had a child to kill. That child is still
        // coming, and it will seat itself under this same id — so take the id
        // back. Dropping it would leave a server nobody can see: every event
        // it emits gets filtered out, and the next press of start is refused
        // with "a local server is already running". Back in `starting`, the
        // cancel button is still on screen and it will find a child this time.
        set((s) =>
          s.hostId === null && s.stoppingHostId === current
            ? { phase: "starting", hostId: current, stoppingHostId: null }
            : {},
        )
        // The id is ours again, so the Ready we parked belongs to us after all:
        // it announced the child this cancel could not find. Dropping it here
        // would leave the table `starting` forever with the only ticket it will
        // ever be handed already thrown away.
        if (parked !== null && get().hostId === current) get().ingest(parked)
      },

      ingest: (event) => {
        const { hostId, stoppingHostId } = get()
        // A stop in flight has cleared `hostId` but not yet learned whether it
        // killed anything. Hold this Ready until it does — see `stop`.
        if (event.kind === "ready" && hostId === null && stoppingHostId === event.hostId) {
          set({ parkedReady: event })
          return
        }
        if (!hostEventApplies(event, hostId, stoppingHostId)) return
        switch (event.kind) {
          case "log":
            set((s) => ({ log: [...s.log.slice(-(MAX_LOG_LINES - 1)), event.text] }))
            return
          case "ready":
            set({
              phase: "ready",
              hostedSession: true,
              lastTicket: event.ticket,
              lastKey: event.key,
              error: null,
              exitKind: null,
              exitCode: null,
            })
            // Which home these credentials belong to is a question only the Rust side
            // can answer, and `ingest` is synchronous — so ask, and record what comes
            // back. `effectiveHome` may never have been refreshed in this session.
            void hostLocalStatus(get().homeOverride.trim() || undefined)
              .then((status) => set({ lastTicketHome: status.home, effectiveHome: status.home }))
              .catch(() => {})
            void useConnectionStore.getState().connect({ ticket: event.ticket, key: event.key })
            return
          case "exit":
            set((s) => {
              if (s.stoppingHostId !== null && event.hostId === s.stoppingHostId) {
                return { stoppingHostId: null }
              }
              if (s.phase === "starting") {
                return {
                  phase: "error" as const,
                  hostedSession: false,
                  exitKind: "before-ready" as const,
                  exitCode: event.code,
                  hostId: null,
                }
              }
              if (s.phase === "ready" || s.hostedSession) {
                return {
                  phase: "error" as const,
                  hostedSession: false,
                  exitKind: "unexpected" as const,
                  exitCode: event.code,
                  hostId: null,
                }
              }
              // A readiness Error already named the failure. Clear the id so
              // a late Ready for this dead child cannot revive the session.
              return { hostId: null }
            })
            return
          case "error":
            // A readiness failure does not kill anything: `watch_output` emits
            // the Error and leaves the child and its drains exactly where they
            // were. Flipping `phase` alone therefore strands a LIVE server
            // under an id the screen has stopped showing — Start comes back,
            // and the next press is refused with "a local server is already
            // running" while a first run has no persisted credentials to sit
            // back down with. Nobody can adopt a server that never announced a
            // ticket, so answer the process question the only way left: stop
            // it, keeping the id as the stopping one so the Exit that confirms
            // the kill reads as a confirmation rather than a second failure.
            set((s) => ({
              phase: "error",
              error: event.message,
              hostedSession: false,
              hostId: null,
              stoppingHostId: s.hostId ?? s.stoppingHostId,
            }))
            void hostLocalStop().catch(() => {
              // Nothing to stop is fine — the child may have died already.
            })
            return
        }
      },
    }),
    {
      name: "loreweaver-studio-host-local",
      storage: guardedLocalStorage,
      partialize: (s) => ({
        homeOverride: s.homeOverride,
        lastTicket: s.lastTicket,
        lastKey: s.lastKey,
        lastTicketHome: s.lastTicketHome,
      }),
    },
  ),
)

/** Disconnect from the table; when we hosted the server ourselves, stop it
 * too (the TUI's quit semantics). Reconnect logic never routes through here. */
export async function quitTable(): Promise<void> {
  const host = useHostLocalStore.getState()
  await useConnectionStore.getState().disconnect()
  if (host.hostedSession) await host.stop()
}
