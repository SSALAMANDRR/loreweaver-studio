import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import type { CharacterContextState } from "./creation"
import CharacterContextSetup from "./CharacterContextSetup"

vi.mock("../../lib/transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/transport")>()
  return { ...actual, transportSend: vi.fn().mockResolvedValue(undefined) }
})

import { transportSend } from "../../lib/transport"

const context: CharacterContextState = {
  available: true,
  optional: true,
  complete: false,
  skipped: false,
  values: {},
  fields: [
    {
      id: "status",
      kind: "choice",
      required: true,
      label: "Текущее положение",
      options: [
        { id: "inquisition", label: "Служитель Инквизиции" },
        { id: "deserter", label: "Дезертир / беглец" },
      ],
    },
    {
      id: "goal",
      kind: "textarea",
      required: false,
      label: "Личная цель",
      placeholder: "Например: построить криминальную империю",
    },
  ],
}

describe("CharacterContextSetup", () => {
  beforeEach(() => {
    vi.mocked(transportSend).mockClear()
    vi.mocked(transportSend).mockResolvedValue(undefined)
    useConnectionStore.setState({ status: "online" })
  })

  it("does not assume Inquisition service and submits a deserter premise", async () => {
    const user = userEvent.setup()
    render(<CharacterContextSetup context={context} />)

    const save = screen.getByRole("button", { name: "Save context" })
    expect(save).toBeDisabled()

    await user.selectOptions(screen.getByLabelText("Текущее положение"), "deserter")
    await user.type(screen.getByLabelText("Личная цель"), "Build a criminal empire")
    expect(save).toBeEnabled()
    await user.click(save)

    const sent = vi.mocked(transportSend).mock.calls[0]?.[0]
    expect(sent?.type).toBe("input")
    expect(sent?.text.startsWith(".__creation_action context set ")).toBe(true)
    const encoded = sent?.text.replace(".__creation_action context set ", "") ?? ""
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual({
      status: "deserter",
      goal: "Build a criminal empire",
    })
  })

  it("can skip the narrative context entirely", async () => {
    const user = userEvent.setup()
    render(<CharacterContextSetup context={context} />)

    await user.click(screen.getByRole("button", { name: "Skip" }))

    expect(transportSend).toHaveBeenCalledWith({
      type: "input",
      text: ".__creation_action context skip",
    })
  })
})
