import { act, render, screen, within } from "@testing-library/react"
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

const attackSpec = { id: "attack", label: "Server attack roll", expression: "1d100", count: 1, sides: 100 }
const manualTurn: CombatSurface = {
  ...myTurn,
  actions: [
    {
      ...myTurn.actions[0],
      modes: [{ ...myTurn.actions[0].modes[0], manual_rolls: [attackSpec] }],
    },
  ],
}

it("in manual mode asks only for the server-declared dice and sends the faces as entered", async () => {
  useSessionStore.setState({ game: { ...surface(manualTurn), roll_mode: "manual" } })
  render(<CombatActionPanel />)
  const user = userEvent.setup()
  const submit = screen.getByRole("button", { name: "Resolve action" })
  expect(submit).toBeDisabled()
  await user.type(screen.getByLabelText("Server attack roll"), "57")
  await user.click(submit)
  const frame = vi.mocked(transportSend).mock.calls[0][0] as unknown as Record<string, unknown>
  expect(frame).toMatchObject({
    roll_source: "manual",
    manual_rolls: { attack: [57] },
    action: "custom_attack",
  })
  // Only raw faces travel: the client computes no target, success, location or damage.
  for (const computed of ["attack_roll", "attack_target", "success", "hit_location", "damage_rolls"]) {
    expect(frame).not.toHaveProperty(computed)
  }
})

it("in automatic mode shows no dice fields and lets the server roll", async () => {
  useSessionStore.setState({ game: { ...surface(manualTurn), roll_mode: "auto" } })
  render(<CombatActionPanel />)
  expect(screen.queryByLabelText("Server attack roll")).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole("button", { name: "Resolve action" }))
  const frame = vi.mocked(transportSend).mock.calls[0][0] as unknown as Record<string, unknown>
  expect(frame).not.toHaveProperty("roll_source")
  expect(frame).not.toHaveProperty("manual_rolls")
})

it("a manual reaction sends its own dice; declining needs none", async () => {
  const reactionSpec = { ...attackSpec, id: "reaction", label: "Server reaction roll" }
  const defender: CombatSurface = {
    actor: "Ada",
    actions: [],
    state: encounter({
      pending_reaction: {
        id: "p-3",
        attacker: "Beast",
        defender: "Ada",
        action: "x",
        mode: "y",
        hit_count: 1,
      },
    }),
    reaction: {
      id: "p-3",
      actor: "Ada",
      attacker: "Beast",
      action: "Server attack",
      hit_count: 1,
      choices: [
        { id: "server-evade", label: "Server evade", manual_rolls: [reactionSpec] },
        { id: "decline", label: "No reaction", manual_rolls: [] },
      ],
    },
  }
  useSessionStore.setState({ game: { ...surface(defender), roll_mode: "manual" } })
  render(<CombatActionPanel />)
  const user = userEvent.setup()
  expect(screen.getByRole("button", { name: "Server evade" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "No reaction" })).toBeEnabled()
  await user.type(screen.getByLabelText("Server reaction roll"), "34")
  await user.click(screen.getByRole("button", { name: "Server evade" }))
  expect(transportSend).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "reaction",
      mode: "server-evade",
      pending_id: "p-3",
      roll_source: "manual",
      manual_rolls: { reaction: [34] },
    }),
  )
})

const rangedMode = {
  id: "single",
  label: "Server single",
  weapons: [{ id: "gun-1", label: "Server gun" }],
  reactions: [],
  manual_rolls: [],
  accepts_distance: true,
}
const meleeMode = {
  id: "single",
  label: "Server single",
  weapons: [{ id: "knife-1", label: "Server knife" }],
  reactions: [],
  manual_rolls: [],
  accepts_distance: false,
}

it("offers a distance field only for modes the server declares distance-capable", async () => {
  const ranged: CombatSurface = {
    actor: "Ada",
    state: encounter(),
    actions: [{ id: "shoot", label: "Server shoot", targets: ["Beast"], modes: [rangedMode] }],
  }
  useSessionStore.setState({ game: surface(ranged) })
  const { unmount } = render(<CombatActionPanel />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("Distance"), "15")
  await user.click(screen.getByRole("button", { name: "Resolve action" }))
  expect(vi.mocked(transportSend).mock.calls[0][0]).toMatchObject({ action: "shoot", distance: 15 })
  unmount()

  const melee: CombatSurface = {
    ...ranged,
    actions: [{ id: "stab", label: "Server stab", targets: ["Beast"], modes: [meleeMode] }],
  }
  useSessionStore.setState({ game: surface(melee) })
  render(<CombatActionPanel />)
  expect(screen.queryByLabelText("Distance")).not.toBeInTheDocument()
})

it("rebuilds the form from a fresh surface so no stale choice or distance is sent", async () => {
  const adaTurn: CombatSurface = {
    actor: "Ada",
    state: encounter(),
    actions: [{ id: "shoot", label: "Server shoot", targets: ["Beast"], modes: [rangedMode] }],
  }
  useSessionStore.setState({ game: surface(adaTurn) })
  render(<CombatActionPanel />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("Distance"), "15")

  // The server ends Ada's turn: the keeper now controls Beast, who only has a melee attack.
  const beastTurn: CombatSurface = {
    actor: "Beast",
    state: encounter({ current_actor: "Beast" }),
    actions: [{ id: "stab", label: "Server stab", targets: ["Ada"], modes: [meleeMode] }],
  }
  act(() => useSessionStore.setState({ game: surface(beastTurn) }))
  expect(screen.queryByLabelText("Distance")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Resolve action" }))
  const frame = vi.mocked(transportSend).mock.calls[0][0] as unknown as Record<string, unknown>
  expect(frame).toMatchObject({
    actor: "Beast",
    action: "stab",
    weapon_instance_id: "knife-1",
    target: "Ada",
  })
  expect(frame).not.toHaveProperty("distance")
})
