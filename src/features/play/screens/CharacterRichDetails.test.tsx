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
      attribute_help: {
        WS: "Навык Рукопашной: точность и мастерство в ближнем бою.",
      },
      skills: { Medicae: 2, "Navigation::Варп": 1 },
      skill_labels: { Medicae: "Медицина", "Navigation::Варп": "Навигация (Варп)" },
      skill_help: {
        Medicae: "Медицина: первая помощь, лечение ран и диагностика.",
        "Navigation::Варп": "Навигация: умение прокладывать путь в выбранной специализации.",
      },
      talents: ["Вскочить", "Выучка с Оружием (Лазерное)"],
      equipment: ["Лазган", "Флак-пальто"],
      equipment_details: {
        Лазган: { kind: "weapon", availability: 10, source: "CH05_H076" },
      },
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

  it("renders sheet data and contextual hover help received through state", async () => {
    const user = userEvent.setup()
    render(<CharacterScreen onBack={() => {}} />)

    expect(screen.getByText("Навык Рукопашной")).toHaveAttribute(
      "title",
      expect.stringContaining("ближнем бою"),
    )

    await user.click(screen.getByRole("button", { name: "Навыки" }))
    const medicae = screen.getByText("Медицина")
    const navigation = screen.getByText("Навигация (Варп)")
    expect(medicae.closest(".character-attribute-card")).toHaveAttribute(
      "title",
      expect.stringContaining("первая помощь"),
    )
    expect(navigation.closest(".character-attribute-card")).toHaveAttribute(
      "title",
      expect.stringContaining("прокладывать путь"),
    )

    await user.click(screen.getByRole("button", { name: "Таланты" }))
    expect(screen.getByText("Вскочить")).toBeInTheDocument()
    expect(screen.getByText("Выучка с Оружием (Лазерное)")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Снаряжение" }))
    const lasgun = screen.getByText("Лазган")
    expect(lasgun).toHaveAttribute("title", expect.stringContaining("Оружие"))
    expect(lasgun).toHaveAttribute("title", expect.stringContaining("Доступность: 10"))
    expect(lasgun).toHaveAttribute("title", expect.stringContaining("Источник: CH05_H076"))
    expect(screen.getByText("Флак-пальто")).toBeInTheDocument()
  })
})
