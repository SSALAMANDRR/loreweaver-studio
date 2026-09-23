import type { ManualRollSpec } from "@loreweaver/protocol"

export type DiceValues = Record<string, string[]>

/**
 * Natural die faces for the server-declared rolls, as entered — or null while any
 * field is empty or not a whole number. Ranges and all mechanics are the server's job.
 */
export function manualFaces(specs: ManualRollSpec[], values: DiceValues): Record<string, number[]> | null {
  const faces: Record<string, number[]> = {}
  for (const spec of specs) {
    const entered = values[spec.id] ?? []
    if (entered.length !== spec.count || entered.some((value) => !/^\s*-?\d+\s*$/.test(value))) return null
    faces[spec.id] = entered.map((value) => Number(value))
  }
  return faces
}
