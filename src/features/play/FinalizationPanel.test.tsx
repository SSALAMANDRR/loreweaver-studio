import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { StateFrame } from "@loreweaver/protocol"
import { beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import CharacterScreen from "./screens/CharacterScreen"

vi.mock("../../lib/transport", async (original) => ({
  ...(await original<typeof import("../../lib/transport")>()),
  transportSend: vi.fn().mockResolvedValue(undefined),
}))
import { transportSend } from "../../lib/transport"

function state(): StateFrame {
  return {
    type: "state",
    party: [],
    initiative: [],
    online: 1,
    character: {
      name: "Acolyte",
      system: "custom-system",
      resources: [],
      attributes: { Ag: 30 },
      status_effects: [],
    },
    creation: {
      active: true,
      complete: true,
      profile_id: "custom-profile",
      stage_index: 2,
      stage_count: 2,
      completed_stages: [],
      stage: null,
    },
    readiness: {
      ready: false,
      managed: true,
      phase: "finalization",
      blocked_reference: "",
      message: "Требуется завершающий бросок.",
    },
    finalization: { can_roll: true, can_resolve: false, complete: false, expression: "1d100", choices: [] },
  }
}

function receive(frame: StateFrame) {
  act(() =>
    useConnectionStore.getState().handleEvent({ kind: "frame", connectionId: "finalization-test", frame }),
  )
}

describe("server-driven character finalization", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru")
    useSessionStore.getState().clear()
    useConnectionStore.setState({ status: "online", connectionId: "finalization-test", refused: false })
    vi.mocked(transportSend).mockReset().mockResolvedValue(undefined)
  })

  it("waits for authoritative state after the final roll and reflects completion", async () => {
    receive(state())
    render(<CharacterScreen onBack={() => {}} />)
    expect(screen.getByText("Создание ещё не завершено")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Бросить 1d100 для завершения создания" }))
    const sent = vi.mocked(transportSend).mock.calls[0][0]
    expect(sent.type).toBe("input")
    expect(JSON.parse(decodeURIComponent((sent as { text: string }).text.split(" ")[2]))).toEqual({
      character: "Acolyte",
      action: "roll",
    })
    expect(screen.queryByText("Готов к игре")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Бросить 1d100/ })).toBeDisabled()
    const complete = state()
    complete.readiness = { ready: true, managed: true, phase: "ready", blocked_reference: "" }
    complete.finalization = {
      ...complete.finalization!,
      can_roll: false,
      complete: true,
      result: { roll: 100, id: "result", label: "Дар", source: "Книга", rules: [] },
    }
    receive(complete)
    expect(screen.getByText("Готов к игре")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Бросить 1d100/ })).not.toBeInTheDocument()
  })

  it("renders server choices and sends Unicode and separators losslessly", async () => {
    const frame = state()
    frame.finalization = {
      ...frame.finalization!,
      can_roll: false,
      can_resolve: true,
      result: {
        roll: 14,
        id: "opaque",
        label: "Предсказание",
        source: "Книга",
        rules: ["Правило результата"],
      },
      choices: [
        { id: "target", label: "Объект ненависти", free: true, options: [] },
        {
          id: "option",
          label: "Повысить характеристику",
          free: false,
          options: [{ id: "agility", label: "Ловкость" }],
        },
      ],
    }
    receive(frame)
    render(<CharacterScreen onBack={() => {}} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Объект ненависти"), "Враг | союз=ложь")
    await user.selectOptions(screen.getByLabelText("Повысить характеристику"), "agility")
    await user.click(screen.getByRole("button", { name: "Применить выборы и завершить создание" }))
    const text = (vi.mocked(transportSend).mock.calls[0][0] as { text: string }).text
    expect(JSON.parse(decodeURIComponent(text.split(" ")[2]))).toEqual({
      character: "Acolyte",
      action: "resolve",
      roll: 14,
      row_id: "opaque",
      selections: { target: "Враг | союз=ложь", option: "agility" },
    })
    expect(screen.queryByText("Готов к игре")).not.toBeInTheDocument()
  })

  it("shows a preserved blocked result without inventing an escape action", () => {
    const frame = state()
    frame.readiness = {
      ready: false,
      managed: true,
      phase: "blocked",
      blocked_reference: "table_8_15_rudiments",
      message: "Нет требуемой таблицы. Бросок сохранён.",
    }
    frame.finalization = {
      ...frame.finalization!,
      can_roll: false,
      result: { roll: 1, id: "blocked", label: "Мутация", source: "Книга", rules: [] },
    }
    receive(frame)
    render(<CharacterScreen onBack={() => {}} />)
    expect(screen.getByText("Нет требуемой таблицы. Бросок сохранён.")).toBeInTheDocument()
    expect(screen.getByText("Завершающий бросок 1: Мутация")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Бросить|Применить выборы/ })).not.toBeInTheDocument()
    expect(transportSend).not.toHaveBeenCalled()
  })

  it("does not infer readiness from completed creation when old servers omit it", () => {
    const frame = state()
    delete frame.readiness
    delete frame.finalization
    receive(frame)
    render(<CharacterScreen onBack={() => {}} />)
    expect(screen.queryByText("Готов к игре")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Бросить 1d100/ })).not.toBeInTheDocument()
  })

  it("blocks offline input and permits retry after a transport failure", async () => {
    receive(state())
    useConnectionStore.setState({ status: "offline" })
    render(<CharacterScreen onBack={() => {}} />)
    expect(screen.getByRole("button", { name: /Бросить 1d100/ })).toBeDisabled()
    act(() => useConnectionStore.setState({ status: "online" }))
    vi.mocked(transportSend).mockRejectedValueOnce(new Error("offline"))
    await userEvent.click(screen.getByRole("button", { name: /Бросить 1d100/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось выполнить действие")
    expect(screen.getByRole("button", { name: /Бросить 1d100/ })).toBeEnabled()
  })
})
