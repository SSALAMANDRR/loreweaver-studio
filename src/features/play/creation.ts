import type {
  RuleSystemEntry,
  StateFrame,
  CreationState,
  CreationLayerOption,
  CreationDuplicateRequirement,
} from "@loreweaver/protocol"

export type {
  CreationPresentation,
  CreationProfile,
  CreationCatalog,
  CreationEffectValue,
  CreationEffect,
  CreationChoiceOption,
  CreationChoiceGroup,
  CreationLayerOption,
  CreationRerollTarget,
  CreationDuplicateRequirement,
  CreationAdvancementPurchase,
  CreationEquipmentItem,
  CharacterContextChoice,
  CharacterContextField,
  CharacterContextState,
  CreationStage,
  CreationState,
} from "@loreweaver/protocol"

export interface CreationCharacterSnapshot {
  attributes: Record<string, unknown>
  attribute_labels?: Record<string, string>
}

export type CreationRuleSystemEntry = RuleSystemEntry
export type CreationAwareState = StateFrame

export function creationSystems(game: StateFrame | null): CreationRuleSystemEntry[] {
  return game?.systems ?? []
}

export function currentCreation(game: StateFrame | null): CreationState | null {
  return game?.creation ?? null
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
