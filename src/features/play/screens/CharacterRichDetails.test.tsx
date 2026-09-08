import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { StateFrame } from "@loreweaver/protocol"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: async () => undefined,
}))

import i18n from "../../../i18n"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import CharacterScreen from "./CharacterScreen"

function richState(): StateFrame {
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
      attributes: { WS: 44 },
      attribute_labels: { WS: "Навык Рукопашной" },
      skills: { Medicae: 2, "Navigation::Варп": 1 },
      skill_labels: { Medicae: "Медицина", "Navigation::Варп": "Навигация (Варп)" },
      talents: ["Вскочить", "Выучка с Оружием (Лазерное)"],
      equipment: ["Лазган", "Флак-пальто"],
      status_effects: [],
    },
  } as unknown as StateFrame
}

describe("CharacterScreen rich details", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru")
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
    useSessionStore.getState().ingest(richState())
  })

  it("renders skills, talents and equipment received through state", async () => {
    const user = userEvent.setup()
    render(<CharacterScreen onBack={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Навыки" }))
    expect(screen.getByText("Медицина")).toBeInTheDocument()
    expect(screen.getByText("Навигация (Варп)")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Таланты" }))
    expect(screen.getByText("Вскочить")).toBeInTheDocument()
    expect(screen.getByText("Выучка с Оружием (Лазерное)")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Снаряжение" }))
    expect(screen.getByText("Лазган")).toBeInTheDocument()
    expect(screen.getByText("Флак-пальто")).toBeInTheDocument()
  })
})
