// The character screen learns every creation choice from `state`; no system ids,
// profile names or rule tables belong in the client.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
import { sheetWrite } from "./sheetWrite"

const SYSTEMS = [{ id: "coc7", make_char: "coc" }, { id: "dnd5e", make_char: "dnd" }, { id: "wod" }]

function stateFrame(extra: Record<string, unknown> = {}) {
  return {
    type: "state" as const,
    party: [],
    initiative: [],
    online: 1,
    systems: SYSTEMS,
    ...extra,
  }
}

const SHEET = {
  name: "Lin Quill",
  system: "coc7",
  resources: [{ id: "hp", label: "HP", value: 11, max: 11 }],
  attributes: { 力量: 55, 敏捷: 60, 职业: "档案员" },
  status_effects: [],
}

describe("CharacterScreen — creation", () => {
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
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest(stateFrame())
  })

  it("offers the systems the SERVER reported, not a hard-coded pair", () => {
    render(<CharacterScreen onBack={() => {}} />)

    const picker = screen.getByLabelText("Rule system") as HTMLSelectElement
    expect([...picker.options].map((option) => option.value)).toEqual(["coc7", "dnd5e"])
  })

  it("starts rolled creation through the hidden rich-client lane", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.type(screen.getByLabelText("Name"), "Lin Quill")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([
      { type: "input", text: ".__creation_action start coc7 |  | Lin Quill" },
    ])
  })

  it("renders the advertised profile catalog instead of a free-form rule id field", async () => {
    useSessionStore.getState().clear()
    useSessionStore.getState().ingest(
      stateFrame({
        systems: [
          {
            id: "profiled",
            make_char: "make",
            creation: {
              staged: true,
              requires_profile: true,
              profiles: [
                { id: "hive", label: "Hive World" },
                { id: "forge", label: "Forge World" },
              ],
            },
          },
        ],
      }),
    )
    render(<CharacterScreen onBack={() => {}} />)

    const picker = screen.getByLabelText(/Creation profile \(if required\)/) as HTMLSelectElement
    expect([...picker.options].map((option) => option.textContent)).toEqual(["Hive World", "Forge World"])
    await userEvent.selectOptions(picker, "forge")
    await userEvent.type(screen.getByLabelText("Name"), "Lin Quill")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([
      { type: "input", text: ".__creation_action start profiled | forge | Lin Quill" },
    ])
  })

  it("keeps a community pack generic: the server system id is enough", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText("Rule system"), "dnd5e")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([{ type: "input", text: ".__creation_action start dnd5e |  | " }])
  })

  it("drafts from a description through the server's own generator", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Describe" }))
    await userEvent.type(screen.getByLabelText("Name"), "Rhee")
    await userEvent.type(screen.getByLabelText("Who are they?"), "A harbour pilot.")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([{ type: "input", text: ".genchar coc7 Rhee | A harbour pilot." }])
  })

  it("imports a card as a PC", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Import a card" }))
    await userEvent.type(screen.getByLabelText("Card file"), "harbour/cards/pilot.png")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([{ type: "input", text: ".import harbour/cards/pilot.png coc7 pc" }])
  })

  it("says so plainly when the server reported no systems at all", () => {
    useSessionStore.getState().clear()
    useSessionStore.getState().ingest({ type: "state", party: [], initiative: [], online: 1 })
    render(<CharacterScreen onBack={() => {}} />)

    expect(screen.getByText(/no rule systems/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Create character" })).not.toBeInTheDocument()
  })
})

describe("CharacterScreen — editing", () => {
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
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest(stateFrame({ character: SHEET }))
  })

  it("writes one attribute through `.st`, using the sheet's own canonical name", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "55" }))
    const box = screen.getByLabelText("力量")
    await userEvent.clear(box)
    await userEvent.type(box, "70{Enter}")

    expect(sent).toEqual([{ type: "input", text: ".st 力量=70" }])
  })

  it("edits through a text box, because pasting into a number box took the app down", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "55" }))
    const box = screen.getByLabelText("力量")
    expect(box).toHaveAttribute("type", "text")
    expect(box).toHaveAttribute("inputMode", "numeric")

    await userEvent.clear(box)
    await userEvent.paste("  62  ")
    await userEvent.keyboard("{Enter}")
    expect(sent).toEqual([{ type: "input", text: ".st 力量=62" }])
  })

  it("writes through the explicit `=` form, so a negative or a digit-bearing key is exact", async () => {
    expect(sheetWrite("力量", 70)).toBe(".st 力量=70")
    expect(sheetWrite("mod", -3)).toBe(".st mod=-3")
    expect(sheetWrite("skill2", 30)).toBe(".st skill2=30")

    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "55" }))
    const box = screen.getByLabelText("力量")
    await userEvent.clear(box)
    await userEvent.type(box, "-5{Enter}")
    expect(sent).toEqual([{ type: "input", text: ".st 力量=-5" }])
  })

  it("keeps the picker honest across modes: a system chosen for Describe is not shown for Roll", async () => {
    useSessionStore.getState().clear()
    useSessionStore.getState().ingest(stateFrame())
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Describe" }))
    await userEvent.selectOptions(screen.getByLabelText("Rule system"), "wod")
    await userEvent.click(screen.getByRole("button", { name: "Roll" }))
    expect((screen.getByLabelText("Rule system") as HTMLSelectElement).value).toBe("coc7")
    expect(screen.getByRole("button", { name: "Create character" })).toBeEnabled()
  })

  it("clears the draft on Escape and does not write", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "55" }))
    const box = screen.getByLabelText("力量")
    await userEvent.clear(box)
    await userEvent.type(box, "70")
    await userEvent.keyboard("{Escape}")

    expect(sent).toEqual([])
    expect(screen.queryByLabelText("力量")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "55" })).toBeInTheDocument()
  })

  it("sends nothing when the value did not change", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "60" }))
    await userEvent.type(screen.getByLabelText("敏捷"), "{Enter}")

    expect(sent).toEqual([])
  })

  it("leaves a non-numeric field alone — `.st` could not express it", () => {
    render(<CharacterScreen onBack={() => {}} />)
    expect(screen.queryByRole("button", { name: "档案员" })).not.toBeInTheDocument()
    expect(screen.getByText("档案员")).toBeInTheDocument()
  })

  it("re-derives vitals with the canonical word, never a locale dialect one", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Re-derive vitals" }))

    expect(sent).toEqual([{ type: "input", text: ".st finalize" }])
  })

  it("asks before deleting a character", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Delete character" }))
    expect(sent).toEqual([])

    await userEvent.click(screen.getByRole("button", { name: "Delete for good" }))
    expect(sent).toEqual([{ type: "input", text: ".st delete" }])
  })
})
