import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: vi.fn().mockResolvedValue(undefined),
}))

import "../../../i18n"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import CharacterScreen from "./CharacterScreen"

describe("CharacterScreen creation guidance", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
    useConnectionStore.setState({ status: "online" })
    useSessionStore.getState().ingest({
      type: "state",
      party: [],
      initiative: [],
      online: 1,
      systems: [
        {
          id: "example",
          make_char: "make",
          creation: {
            staged: true,
            requires_profile: true,
            presentation: {
              title: "Характеристики и родной мир",
              description: "Выберите родной мир перед генерацией характеристик.",
              choice: "Выберите один родной мир.",
              effect: "Выбор влияет на стартовые характеристики.",
            },
            profiles: [
              {
                id: "hive",
                label: "Мир-улей",
                detail: [
                  "Сильные характеристики: Ловкость и Восприятие.",
                  "Раны: 8+1к5. Судьба: 2.",
                ],
                source: "DH2 RU v1.8 p. 42",
                choices: [],
              },
            ],
          },
        },
      ],
    } as never)
  })

  it("renders server-authored guidance and the selected profile consequences", () => {
    render(<CharacterScreen onBack={() => {}} />)

    expect(screen.getByText("Характеристики и родной мир")).toBeInTheDocument()
    expect(screen.getByText(/Выберите родной мир перед генерацией/)).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Мир-улей" })).toBeInTheDocument()
    expect(screen.getByText(/Сильные характеристики: Ловкость и Восприятие/)).toBeInTheDocument()
    expect(screen.getByText(/Раны: 8\+1к5\. Судьба: 2/)).toBeInTheDocument()
    expect(screen.getByText("DH2 RU v1.8 p. 42")).toBeInTheDocument()
  })
})
