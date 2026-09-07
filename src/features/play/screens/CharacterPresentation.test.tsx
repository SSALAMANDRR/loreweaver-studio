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

function presentedState(): StateFrame {
  return {
    type: "state",
    party: [],
    initiative: [],
    online: 1,
    character: {
      name: "Mordecai",
      system: "dh2",
      system_label: "DH2",
      resources: [],
      attributes: { WS: 55 },
      attribute_labels: { WS: "Навык Рукопашной" },
      status_effects: [],
    },
  } as unknown as StateFrame
}

describe("CharacterScreen server-authored presentation", () => {
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
        locale: "ru",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest(presentedState())
  })

  it("renders localized labels but writes the unchanged storage key", async () => {
    const user = userEvent.setup()
    render(<CharacterScreen onBack={() => {}} />)

    expect(screen.getByText("DH2")).toBeInTheDocument()
    expect(screen.getByText("Навык Рукопашной")).toBeInTheDocument()
    expect(screen.queryByText("WS")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "55" }))
    const input = screen.getByLabelText("Навык Рукопашной")
    await user.clear(input)
    await user.type(input, "60{Enter}")

    expect(sent).toEqual([{ type: "input", text: ".st WS=60" }])
  })
})
