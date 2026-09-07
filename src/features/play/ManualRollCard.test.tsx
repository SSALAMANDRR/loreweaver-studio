import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useManualRollStore } from "../../store/manualRoll"
import ManualRollCard from "./ManualRollCard"

vi.mock("../../lib/transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/transport")>()
  return { ...actual, transportSend: vi.fn().mockResolvedValue(undefined) }
})

import { transportSend } from "../../lib/transport"

const request = {
  type: "roll_request" as const,
  request_id: "req-17",
  kind: "check",
  reason: "Awareness",
  expression: "1d100",
  count: 1,
  sides: 100,
  target: 42,
  effective_target: 22,
  difficulty: "hard",
}

describe("ManualRollCard", () => {
  beforeEach(() => {
    vi.mocked(transportSend).mockClear()
    vi.mocked(transportSend).mockResolvedValue(undefined)
    useManualRollStore.getState().clear()
    useConnectionStore.setState({ status: "online" })
  })

  it("shows difficulty and effective target and submits the physical face", async () => {
    const user = userEvent.setup()
    useManualRollStore.getState().ingest(request)
    render(<ManualRollCard />)

    expect(screen.getByText("Awareness")).toBeInTheDocument()
    expect(screen.getByText(/hard/)).toBeInTheDocument()
    expect(screen.getByText(/22/)).toBeInTheDocument()

    const field = screen.getByRole("spinbutton")
    await user.type(field, "17")
    await user.click(screen.getByRole("button", { name: "Confirm" }))

    expect(transportSend).toHaveBeenCalledWith({
      type: "input",
      text: ".__roll_submit req-17 17",
    })
  })

  it("keeps invalid faces local and disappears only after the matching cancel", async () => {
    const user = userEvent.setup()
    useManualRollStore.getState().ingest(request)
    render(<ManualRollCard />)

    await user.type(screen.getByRole("spinbutton"), "101")
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled()
    expect(transportSend).not.toHaveBeenCalled()

    act(() => useManualRollStore.getState().ingest({ type: "roll_cancel", request_id: "req-17" }))
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
    // The live request already satisfied this online generation; its normal
    // cancellation must not provoke a redundant reconnect-refresh query.
    expect(transportSend).not.toHaveBeenCalled()
  })

  it("asks once per online generation for a persisted request when the transient store is empty", async () => {
    render(<ManualRollCard />)

    await waitFor(() =>
      expect(transportSend).toHaveBeenCalledWith({ type: "input", text: ".__roll_pending" }),
    )
    expect(transportSend).toHaveBeenCalledTimes(1)

    act(() => useConnectionStore.setState({ status: "reconnecting" }))
    act(() => useConnectionStore.setState({ status: "online" }))

    await waitFor(() => expect(transportSend).toHaveBeenCalledTimes(2))
    expect(vi.mocked(transportSend).mock.calls[1]?.[0]).toEqual({
      type: "input",
      text: ".__roll_pending",
    })
  })
})
