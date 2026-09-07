import { create } from "zustand"

export interface ManualRollRequest {
  type: "roll_request"
  request_id: string
  kind: string
  reason: string
  expression: string
  count: number
  sides: number
  keep?: "kh" | "kl"
  keep_count?: number
  modifier?: number
  target?: number
  effective_target?: number
  difficulty?: string
}

export interface ManualRollCancel {
  type: "roll_cancel"
  request_id: string
}

export type ManualRollServerFrame = ManualRollRequest | ManualRollCancel

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number"
}

export function isManualRollServerFrame(value: unknown): value is ManualRollServerFrame {
  if (!isRecord(value)) return false
  if (value.type === "roll_cancel") {
    return typeof value.request_id === "string" && value.request_id.length > 0
  }
  if (value.type !== "roll_request") return false
  return (
    typeof value.request_id === "string" &&
    value.request_id.length > 0 &&
    typeof value.kind === "string" &&
    typeof value.reason === "string" &&
    typeof value.expression === "string" &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 1 &&
    typeof value.sides === "number" &&
    Number.isInteger(value.sides) &&
    value.sides >= 2 &&
    isOptionalNumber(value.target) &&
    isOptionalNumber(value.effective_target) &&
    (value.difficulty === undefined || typeof value.difficulty === "string")
  )
}

interface ManualRollState {
  pending: ManualRollRequest | null
  ingest: (frame: ManualRollServerFrame) => void
  clear: () => void
}

export const useManualRollStore = create<ManualRollState>((set) => ({
  pending: null,
  ingest: (frame) => {
    if (frame.type === "roll_request") {
      set({ pending: frame })
      return
    }
    set((state) => ({
      pending: state.pending?.request_id === frame.request_id ? null : state.pending,
    }))
  },
  clear: () => set({ pending: null }),
}))
