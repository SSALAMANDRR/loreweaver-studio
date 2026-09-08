import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/native", () => ({ pickDirectory: vi.fn() }))
vi.mock("../../lib/transport", () => ({ isTauri: () => true }))
vi.mock("../../store/connection", () => ({
  useConnectionStore: (selector: (state: unknown) => unknown) =>
    selector({ status: "online", lastError: null, connect: vi.fn() }),
}))
vi.mock("../../store/hostLocal", () => ({
  useHostLocalStore: (selector: (state: unknown) => unknown) => selector({ phase: "idle" }),
}))
vi.mock("./StatusPill", () => ({ default: () => null }))
vi.mock("./screens/MainMenuScreen", () => ({
  default: ({ onNavigate }: { onNavigate: (screen: string) => void }) => (
    <div>
      <span>Main menu screen</span>
      <button type="button" onClick={() => onNavigate("game")}>Open game</button>
      <button type="button" onClick={() => onNavigate("character")}>Open character from menu</button>
    </div>
  ),
}))
vi.mock("./SessionView", () => ({
  default: ({ onCharacter, onMenu }: { onCharacter?: () => void; onMenu?: () => void }) => (
    <div>
      <span>Live game screen</span>
      <button type="button" onClick={onCharacter}>Open character from game</button>
      <button type="button" onClick={onMenu}>Game menu</button>
    </div>
  ),
}))
vi.mock("./screens/CharacterScreen", () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div>
      <span>Character screen</span>
      <button type="button" onClick={onBack}>Character back</button>
    </div>
  ),
}))
vi.mock("./screens/KeysScreen", () => ({ default: () => null }))
vi.mock("./screens/ModelScreen", () => ({ default: () => null }))
vi.mock("./screens/ModuleScreen", () => ({ default: () => null }))
vi.mock("./screens/RulesScreen", () => ({ default: () => null }))
vi.mock("./screens/SettingsScreen", () => ({ default: () => null }))
vi.mock("./screens/SkillsScreen", () => ({ default: () => null }))

import PlayView from "./PlayView"

describe("PlayView character navigation", () => {
  it("returns to the live game when the character sheet was opened from the game", async () => {
    const user = userEvent.setup()
    render(<PlayView />)

    await user.click(screen.getByRole("button", { name: "Open game" }))
    expect(screen.getByText("Live game screen")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open character from game" }))
    expect(screen.getByText("Character screen")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Character back" }))
    expect(screen.getByText("Live game screen")).toBeInTheDocument()
  })

  it("returns to the main menu when the character sheet was opened from the main menu", async () => {
    const user = userEvent.setup()
    render(<PlayView />)

    await user.click(screen.getByRole("button", { name: "Open character from menu" }))
    expect(screen.getByText("Character screen")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Character back" }))
    expect(screen.getByText("Main menu screen")).toBeInTheDocument()
  })

  it("uses the same return target for Escape", async () => {
    const user = userEvent.setup()
    render(<PlayView />)

    await user.click(screen.getByRole("button", { name: "Open game" }))
    await user.click(screen.getByRole("button", { name: "Open character from game" }))

    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.getByText("Live game screen")).toBeInTheDocument()
  })
})
