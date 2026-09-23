import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { CombatSurface, StateFrame } from "@loreweaver/protocol"
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

const encounter = (
  overrides: Partial<NonNullable<CombatSurface["state"]>> = {},
): NonNullable<CombatSurface["state"]> => ({
  round_number: 3,
  current_actor: "Ada",
  order: [
    { name: "Ada", initiative: 14, current: true, controlled: true, keeper_controlled: false },
    { name: "Beast", initiative: 6, current: false, controlled: false, keeper_controlled: true },
  ],
  combatants: { Ada: { action_budget: 2 } },
  pending_reaction: null,
  ...overrides,
})

const surface = (combat: CombatSurface): StateFrame => ({
  type: "state",
  party: [],
  initiative: [],
  online: 1,
  combat,
})

const myTurn: CombatSurface = {
  actor: "Ada",
  state: encounter(),
  end_turn: { id: "server-end", label: "Server end turn" },
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
          reactions: [{ id: "server-evade", label: "Server evade" }],
        },
      ],
    },
  ],
}

beforeEach(() => {
  vi.mocked(transportSend).mockClear()
  useConnectionStore.setState({ status: "online" })
})

it("submits server-authored action ids without knowing a rule system or choosing a reaction", async () => {
  useSessionStore.setState({ game: surface(myTurn) })
  render(<CombatActionPanel />)
  expect(screen.getByText("Server attack")).toBeInTheDocument()
  expect(screen.getByText("Server weapon")).toBeInTheDocument()
  expect(screen.queryByText("Server evade")).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole("button", { name: "Resolve action" }))
  const frame = vi.mocked(transportSend).mock.calls[0][0] as unknown as Record<string, unknown>
  expect(frame).toMatchObject({
    type: "action_request",
    actor: "Ada",
    target: "Beast",
    action: "custom_attack",
    mode: "burst",
    weapon_instance_id: "item-7",
  })
  expect(frame).not.toHaveProperty("reaction_type")
})

it("renders the server's round, order and current turn and sends the server's end-turn id", async () => {
  useSessionStore.setState({ game: surface(myTurn) })
  render(<CombatActionPanel />)
  expect(screen.getByText("Round 3")).toBeInTheDocument()
  const order = screen.getByRole("list")
  expect(within(order).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step")
  expect(within(order).getByText(/Beast \(6\)/)).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole("button", { name: "Server end turn" }))
  expect(transportSend).toHaveBeenCalledWith(
    expect.objectContaining({ type: "action_request", actor: "Ada", action: "server-end" }),
  )
})

it("shows no controls when it is someone else's turn", () => {
  const waiting: CombatSurface = {
    actor: "Ada",
    actions: [],
    state: encounter({
      current_actor: "Beast",
      order: [
        { name: "Ada", initiative: 14, current: false, controlled: true, keeper_controlled: false },
        { name: "Beast", initiative: 6, current: true, controlled: false, keeper_controlled: true },
      ],
    }),
  }
  useSessionStore.setState({ game: surface(waiting) })
  render(<CombatActionPanel />)
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
  expect(screen.getByText(/Beast \(6\)/).closest("li")).toHaveAttribute("aria-current", "step")
})

it("offers the reaction only when the server authorised this viewer and sends the pending id", async () => {
  const pending = { id: "p-9", attacker: "Beast", defender: "Ada", action: "x", mode: "y", hit_count: 1 }
  const bystander: CombatSurface = { actor: "", actions: [], state: encounter({ pending_reaction: pending }) }
  useSessionStore.setState({ game: surface(bystander) })
  const { unmount } = render(<CombatActionPanel />)
  expect(screen.getByText("Waiting for Ada to react.")).toBeInTheDocument()
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
  unmount()

  const defender: CombatSurface = {
    ...bystander,
    actor: "Ada",
    reaction: {
      id: "p-9",
      actor: "Ada",
      attacker: "Beast",
      action: "Server attack",
      hit_count: 1,
      choices: [
        { id: "server-evade", label: "Server evade" },
        { id: "decline", label: "No reaction" },
      ],
    },
  }
  useSessionStore.setState({ game: surface(defender) })
  render(<CombatActionPanel />)
  expect(screen.getByText(/Ada is hit by Beast \(Server attack\)/)).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole("button", { name: "Server evade" }))
  expect(transportSend).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "action_request",
      actor: "Ada",
      action: "reaction",
      mode: "server-evade",
      pending_id: "p-9",
    }),
  )
})

it("masks a hidden acting combatant exactly as the server did", () => {
  const hidden: CombatSurface = {
    actor: "Ada",
    actions: [],
    state: encounter({
      current_actor: null,
      order: [{ name: "Ada", initiative: 14, current: false, controlled: true, keeper_controlled: false }],
      pending_reaction: { id: "p", attacker: "", defender: "Ada", action: "x", mode: "y", hit_count: 1 },
    }),
    reaction: {
      id: "p",
      actor: "Ada",
      attacker: "",
      action: "Server attack",
      hit_count: 1,
      choices: [{ id: "decline", label: "No reaction" }],
    },
  }
  useSessionStore.setState({ game: surface(hidden) })
  render(<CombatActionPanel />)
  expect(screen.getByText("An unseen combatant is acting.")).toBeInTheDocument()
  expect(screen.getByText(/hit by Unseen attacker/)).toBeInTheDocument()
})

it("marks a combatant the server reported as defeated without deciding anything itself", () => {
  const afterDefeat: CombatSurface = {
    actor: "Ada",
    actions: [],
    state: encounter({
      order: [
        { name: "Ada", initiative: 14, current: true, controlled: true, keeper_controlled: false },
        {
          name: "Beast",
          initiative: 6,
          current: false,
          controlled: false,
          keeper_controlled: true,
          defeated: true,
        },
      ],
    }),
  }
  useSessionStore.setState({ game: surface(afterDefeat) })
  render(<CombatActionPanel />)
  const beast = screen.getByText(/Beast \(6\)/).closest("li")
  expect(beast).toHaveTextContent("out of the fight")
  expect(beast).toHaveClass("defeated")
  expect(screen.getByText(/Ada \(14\)/).closest("li")).not.toHaveTextContent("out of the fight")
})
