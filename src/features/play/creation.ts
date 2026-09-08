import type { RuleSystemEntry, StateFrame } from "@loreweaver/protocol"

export interface CreationPresentation {
  title?: string
  description?: string
  choice?: string
  effect?: string
}

export interface CreationProfile {
  id: string
  label: string
  detail?: string[]
  source?: string
  effect?: CreationEffect
  choices?: CreationChoiceGroup[]
}

export interface CreationCatalog {
  staged: boolean
  requires_profile: boolean
  profiles: CreationProfile[]
  presentation?: CreationPresentation
}

export interface CreationEffectValue {
  label: string
  value: unknown
}

export interface CreationEffect {
  grants?: string[]
  skills?: CreationEffectValue[]
  equipment?: string[]
  attributes?: CreationEffectValue[]
}

export interface CreationChoiceOption {
  id: string
  label: string
  specialization?: boolean
  effect?: CreationEffect
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
  effect?: CreationEffect
}

export interface CreationRerollTarget {
  id: string
  label: string
  value?: number
}

export interface CreationDuplicateRequirement {
  field: string
  count: number
  current?: string[]
  choices: Array<{ id: string; label: string }>
}

export interface CreationAdvancementPurchase {
  category: string
  category_label?: string
  target: string
  label: string
  stage: string
  stage_label?: string
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

export interface CharacterContextChoice {
  id: string
  label: string
}

export interface CharacterContextField {
  id: string
  kind: "choice" | "text" | "textarea"
  required: boolean
  label: string
  placeholder?: string
  options?: CharacterContextChoice[]
}

export interface CharacterContextState {
  available: boolean
  optional: boolean
  complete: boolean
  skipped: boolean
  fields: CharacterContextField[]
  values: Record<string, string>
}

export interface CreationStage {
  id: string
  kind: "profile_reroll" | "layer" | "duplicates" | "advancement" | "starting_equipment" | string
  presentation?: CreationPresentation
  can_skip?: boolean
  targets?: CreationRerollTarget[]
  layer?: string
  fixed?: boolean
  options?: CreationLayerOption[]
  requirements?: CreationDuplicateRequirement[]
  budget?: Record<string, number>
  purchases?: CreationAdvancementPurchase[]
  items?: CreationEquipmentItem[]
  inventory?: string[]
}

export interface CreationState {
  active: boolean
  complete: boolean
  profile_id: string
  stage_index: number
  stage_count: number
  completed_stages: string[]
  stage: CreationStage | null
  context?: CharacterContextState
}

export interface CreationCharacterSnapshot {
  attributes: Record<string, unknown>
  attribute_labels?: Record<string, string>
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

export function characterContextAction(values: Record<string, string>): string {
  return `.__creation_action context set ${encodeURIComponent(JSON.stringify(values))}`
}

export function skipCharacterContextAction(): string {
  return ".__creation_action context skip"
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
