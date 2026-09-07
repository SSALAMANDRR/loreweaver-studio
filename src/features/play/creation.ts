import type { RuleSystemEntry, StateFrame } from "@loreweaver/protocol"

export interface CreationProfile {
  id: string
  label: string
}

export interface CreationCatalog {
  staged: boolean
  requires_profile: boolean
  profiles: CreationProfile[]
}

export interface CreationChoiceOption {
  id: string
  label: string
  specialization?: boolean
}

export interface CreationChoiceGroup {
  id: string
  label: string
  free: boolean
  family?: string
  options: CreationChoiceOption[]
}

export interface CreationLayerOption {
  id: string
  label: string
  fixed: boolean
  choices: CreationChoiceGroup[]
  detail?: string[]
  source?: string
}

export interface CreationRerollTarget {
  id: string
  label: string
  value?: number
}

export interface CreationDuplicateRequirement {
  field: string
  count: number
  choices: Array<{ id: string; label: string }>
}

export interface CreationAdvancementPurchase {
  category: string
  target: string
  label: string
  stage: string
  current: number
  next: number
  cost: number
  affordable: boolean
}

export interface CreationEquipmentItem {
  id: string
  label: string
  kind: string
  availability: number
}

export interface CreationStage {
  id: string
  kind: "profile_reroll" | "layer" | "duplicates" | "advancement" | "starting_equipment" | string
  can_skip?: boolean
  targets?: CreationRerollTarget[]
  layer?: string
  fixed?: boolean
  options?: CreationLayerOption[]
  requirements?: CreationDuplicateRequirement[]
  budget?: Record<string, number>
  purchases?: CreationAdvancementPurchase[]
  items?: CreationEquipmentItem[]
}

export interface CreationState {
  active: boolean
  complete: boolean
  profile_id: string
  stage_index: number
  stage_count: number
  completed_stages: string[]
  stage: CreationStage | null
}

export type CreationRuleSystemEntry = RuleSystemEntry & { creation?: CreationCatalog }
export type CreationAwareState = StateFrame & {
  systems?: CreationRuleSystemEntry[]
  creation?: CreationState
}

export function creationSystems(game: StateFrame | null): CreationRuleSystemEntry[] {
  return ((game as CreationAwareState | null)?.systems ?? []) as CreationRuleSystemEntry[]
}

export function currentCreation(game: StateFrame | null): CreationState | null {
  return (game as CreationAwareState | null)?.creation ?? null
}

export function startCreationAction(system: string, profile: string, name: string): string {
  return `.__creation_action start ${system} | ${profile} | ${name}`
}

export function creationStepAction(payload: string): string {
  return `.__creation_action create ${payload}`
}

export function advancementAction(category: string, target: string): string {
  return `.__creation_action advance ${category} ${target}`
}

export function layerAction(option: CreationLayerOption, values: Record<string, string>): string {
  const assignments = option.choices.map((group) => `${group.id}=${values[group.id] ?? ""}`)
  const body = option.fixed
    ? assignments.join(" | ")
    : [option.id, ...assignments].filter(Boolean).join(" | ")
  return creationStepAction(body)
}

export function duplicateAction(
  requirements: CreationDuplicateRequirement[],
  values: Record<string, string[]>,
): string {
  const assignments = requirements.map(
    (requirement) => `${requirement.field}=${(values[requirement.field] ?? []).join("; ")}`,
  )
  return creationStepAction(assignments.join(" | "))
}
