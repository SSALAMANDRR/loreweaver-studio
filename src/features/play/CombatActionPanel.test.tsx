import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { StateFrame } from "@loreweaver/protocol"
import { beforeEach, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import CombatActionPanel from "./CombatActionPanel"

vi.mock("../../lib/transport", async (original) => ({
  ...(await original<typeof import("../../lib/transport")>()),
  transportSend: vi.fn().mockResolvedValue(undefined),
}))
import { transportSend } from "../../lib/transport"

const state: StateFrame = {
  type: "state",
  party: [],
  initiative: [],
  online: 1,
  combat: {
    actor: "Ada",
    state: null,
    actions: [
      {
        id: "custom_attack",
        label: "Server attack",
        targets: ["Beast"],
        modes: [
          {
            id: "burst",
            label: "Server burst",
            weapons: [{ id: "item-7", label: "Server weapon" }],
            reactions: [],
          },
        ],
      },
    ],
  },
}

beforeEach(() => {
  vi.mocked(transportSend).mockClear()
  useConnectionStore.setState({ status: "online" })
  useSessionStore.setState({ game: state })
})

it("submits server-authored action ids without knowing a rule system", async () => {
  render(<CombatActionPanel />)
  expect(screen.getByText("Server attack")).toBeInTheDocument()
  expect(screen.getByText("Server burst")).toBeInTheDocument()
  expect(screen.getByText("Server weapon")).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole("button", { name: "Resolve action" }))
  expect(transportSend).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "action_request",
      actor: "Ada",
      target: "Beast",
      action: "custom_attack",
      mode: "burst",
      weapon_instance_id: "item-7",
    }),
  )
})
