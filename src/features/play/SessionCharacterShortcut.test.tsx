import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../store/hostLocal", () => ({ quitTable: vi.fn() }))
vi.mock("./InputBox", () => ({ default: () => null }))
vi.mock("./ManualRollCard", () => ({ default: () => null }))
vi.mock("./NarrativeLog", () => ({ default: () => null }))
vi.mock("./panels/PanelDeck", () => ({ PanelSidebar: () => null, PanelTray: () => null }))
vi.mock("./panels/PanelMenu", () => ({ default: () => null }))
vi.mock("./panels/PanelModalHost", () => ({ default: () => null }))
vi.mock("./panels/PanelNotice", () => ({ default: () => null }))
vi.mock("./StatePanel", () => ({ default: () => null }))
vi.mock("./StatusPill", () => ({ default: () => null }))
vi.mock("./TurnStatus", () => ({ default: () => null }))
vi.mock("./VersionBadge", () => ({ default: () => null }))

import i18n from "../../i18n"
import { useConnectionStore } from "../../store/connection"
import SessionView from "./SessionView"

describe("SessionView character shortcut", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru")
    useConnectionStore.setState({
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "table",
        you: { id: "u1", name: "Nyx", role: "player" },
        locale: "ru",
        server: "loreweaver/1",
      },
    })
  })

  it("opens the character screen directly from the live game header", async () => {
    const user = userEvent.setup()
    const onCharacter = vi.fn()

    render(<SessionView onMenu={() => {}} onCharacter={onCharacter} />)

    await user.click(screen.getByRole("button", { name: "Мой персонаж" }))
    expect(onCharacter).toHaveBeenCalledTimes(1)
  })
})
