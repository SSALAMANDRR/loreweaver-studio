import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { StateFrame } from "@loreweaver/protocol"
import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: unknown[] = []
vi.mock("../../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: async (frame: unknown) => {
    sent.push(frame)
  },
}))

import "../../../i18n"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import CharacterScreen from "./CharacterScreen"

describe("CharacterScreen creation service actions", () => {
  beforeEach(() => {
    sent.length = 0
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "table",
        you: { id: "u1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest({
      type: "state",
      party: [],
      initiative: [],
      online: 1,
      character: {
        name: "Half Built",
        system: "generic",
        resources: [],
        attributes: { STR: 40 },
        status_effects: [],
      },
      creation: {
        active: true,
        complete: false,
        profile_id: "default",
        stage_index: 1,
        stage_count: 3,
        completed_stages: ["characteristics"],
        stage: {
          id: "reroll",
          kind: "profile_reroll",
          targets: [{ id: "STR", label: "Strength", value: 40 }],
          can_skip: true,
        },
      },
    } as unknown as StateFrame)
  })

  it("keeps delete available before staged creation is complete", async () => {
    const user = userEvent.setup()
    render(<CharacterScreen onBack={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Delete character" }))
    expect(sent).toEqual([])

    await user.click(screen.getByRole("button", { name: "Delete for good" }))
    expect(sent).toEqual([{ type: "input", text: ".st delete" }])
  })
})
