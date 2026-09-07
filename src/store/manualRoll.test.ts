import { beforeEach, describe, expect, it } from "vitest"
import { isManualRollServerFrame, useManualRollStore } from "./manualRoll"

const request = {
  type: "roll_request" as const,
  request_id: "req-1",
  kind: "check",
  reason: "Awareness",
  expression: "1d100",
  count: 1,
  sides: 100,
  target: 42,
  effective_target: 22,
  difficulty: "hard",
}

describe("manual roll store", () => {
  beforeEach(() => useManualRollStore.getState().clear())

  it("accepts a valid request and rejects malformed frames", () => {
    expect(isManualRollServerFrame(request)).toBe(true)
    expect(isManualRollServerFrame({ ...request, count: 0 })).toBe(false)
    expect(isManualRollServerFrame({ ...request, sides: "100" })).toBe(false)
  })

  it("keeps the current request until its matching cancel arrives", () => {
    useManualRollStore.getState().ingest(request)
    expect(useManualRollStore.getState().pending?.request_id).toBe("req-1")

    useManualRollStore.getState().ingest({ type: "roll_cancel", request_id: "other" })
    expect(useManualRollStore.getState().pending?.request_id).toBe("req-1")

    useManualRollStore.getState().ingest({ type: "roll_cancel", request_id: "req-1" })
    expect(useManualRollStore.getState().pending).toBeNull()
  })
})
