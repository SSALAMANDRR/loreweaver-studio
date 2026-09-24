import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { StateFrame } from "@loreweaver/protocol"
import { beforeEach, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import RollModeToggle from "./RollModeToggle"

vi.mock("../../lib/transport", async (original) => ({
  ...(await original<typeof import("../../lib/transport")>()),
  transportSend: vi.fn().mockResolvedValue(undefined),
}))
import { transportSend } from "../../lib/transport"

const state = (roll_mode?: "auto" | "manual"): StateFrame => ({
  type: "state",
  party: [],
  initiative: [],
  online: 1,
  ...(roll_mode ? { roll_mode } : {}),
})

beforeEach(() => {
  vi.mocked(transportSend).mockClear()
  useConnectionStore.setState({ status: "online" })
})

it("shows the server's dice mode and asks the server to switch it", async () => {
  useSessionStore.setState({ game: state("auto") })
  render(<RollModeToggle />)
  expect(screen.getByRole("radio", { name: "System rolls" })).toHaveAttribute("aria-checked", "true")
  await userEvent.setup().click(screen.getByRole("radio", { name: "I roll myself" }))
  expect(transportSend).toHaveBeenCalledWith({ type: "input", text: ".rollmode manual" })
})

it("stays hidden against a server that does not report a dice mode", () => {
  useSessionStore.setState({ game: state() })
  const { container } = render(<RollModeToggle />)
  expect(container).toBeEmptyDOMElement()
})

it("keeps the server's dice mode across state updates, including the one that ends a fight", () => {
  useSessionStore.setState({
    game: { ...state("manual"), combat: { actor: "Ada", actions: [], state: null } },
  })
  render(<RollModeToggle />)
  expect(screen.getByRole("radio", { name: "I roll myself" })).toHaveAttribute("aria-checked", "true")
  act(() => {
    useSessionStore.setState({ game: state("manual") })
  })
  expect(screen.getByRole("radio", { name: "I roll myself" })).toHaveAttribute("aria-checked", "true")
})
