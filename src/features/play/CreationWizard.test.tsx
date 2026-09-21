import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../i18n"
import { useConnectionStore } from "../../store/connection"
import type { CreationInputPresentation, CreationState } from "./creation"
import CreationWizard from "./CreationWizard"

vi.mock("../../lib/transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/transport")>()
  return { ...actual, transportSend: vi.fn().mockResolvedValue(undefined) }
})

import { transportSend } from "../../lib/transport"

function advancementCreation(available: number): CreationState {
  return {
    active: true,
    complete: false,
    profile_id: "hive_world",
    stage_index: 6,
    stage_count: 8,
    completed_stages: [],
    stage: {
      id: "advancement",
      kind: "advancement",
      presentation: {
        title: "Стартовый опыт",
        description: "Потратьте стартовые 1000 XP на развитие персонажа.",
        choice: "Купите нужные улучшения и завершите этап, когда будете готовы.",
        effect: "Неистраченный опыт сохраняется.",
      },
      budget: { starting: 1000, available, spent: 1000 - available },
      purchases: [
        {
          category: "characteristic",
          category_label: "Характеристика",
          target: "WS",
          label: "Навык Рукопашной",
          stage: "simple",
          stage_label: "Простое",
          current: 30,
          next: 35,
          cost: 250,
          // The budget is the authoritative snapshot for the button. Keeping a stale
          // false here reproduces the rich-client failure that made affordable rows
          // look clickable while the native button was actually disabled.
          affordable: false,
        },
      ],
    },
  }
}

function backgroundCreation(): CreationState {
  return {
    active: true,
    complete: false,
    profile_id: "hive_world",
    stage_index: 3,
    stage_count: 8,
    completed_stages: [],
    stage: {
      id: "background",
      kind: "layer",
      fixed: false,
      options: [
        {
          id: "adeptus_administratum",
          label: "Адептус Администратум",
          fixed: false,
          detail: ["Мастер бумажной работы позволяет легче находить доступное снаряжение."],
          effect: {
            grants: ["Мастер Бумажной Работы"],
            equipment: ["медпакет"],
          },
          choices: [
            {
              id: "trained_skill",
              label: "Обученное умение",
              free: false,
              options: [
                {
                  id: "commerce",
                  label: "Коммерция",
                  effect: { skills: [{ label: "Коммерция", value: 1 }] },
                },
                {
                  id: "medicae",
                  label: "Медицина",
                  effect: { skills: [{ label: "Медицина", value: 1 }] },
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

function equipmentCreation(used: number, inventory: string[]): CreationState {
  return {
    active: true,
    complete: false,
    profile_id: "hive_world",
    stage_index: 7,
    stage_count: 8,
    completed_stages: [],
    stage: {
      id: "starting_equipment",
      kind: "starting_equipment",
      budget: { total: 2, used, remaining: 2 - used },
      inventory,
      items: [
        { id: "chain_blade", label: "Цепной клинок", kind: "weapon", availability: -10 },
        { id: "flak_coat", label: "Флак-пальто", kind: "armour", availability: 0 },
      ],
    },
  }
}

describe("CreationWizard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru")
    vi.mocked(transportSend).mockClear()
    vi.mocked(transportSend).mockResolvedValue(undefined)
    useConnectionStore.setState({ status: "online" })
  })

  it("keeps the current characteristics visible while creation is still active", () => {
    render(
      <CreationWizard
        creation={advancementCreation(1000)}
        character={{
          attributes: { WS: 30, Ag: 37 },
          attribute_labels: { WS: "Навык Рукопашной", Ag: "Ловкость" },
        }}
      />,
    )

    expect(screen.getByText("Текущие характеристики")).toBeInTheDocument()
    expect(screen.getByText("Навык Рукопашной")).toBeInTheDocument()
    expect(screen.getByText("Ловкость")).toBeInTheDocument()
    expect(screen.getByText("37")).toBeInTheDocument()
  })

  it("renders pack-authored guidance and localized advancement labels", () => {
    render(<CreationWizard creation={advancementCreation(1000)} />)

    expect(screen.getByText("Стартовый опыт")).toBeInTheDocument()
    expect(screen.getByText(/Потратьте стартовые 1000 XP/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Характеристика.*Навык Рукопашной.*Простое.*30.*35.*250 опыта/ }),
    ).toBeEnabled()
  })

  it("enables a purchase when its cost fits the current server budget", async () => {
    const user = userEvent.setup()
    render(<CreationWizard creation={advancementCreation(1000)} />)

    const purchase = screen.getByRole("button", {
      name: /Навык Рукопашной.*Простое.*30.*35.*250 опыта/,
    })
    expect(purchase).toBeEnabled()

    await user.click(purchase)

    expect(transportSend).toHaveBeenCalledWith({
      type: "input",
      text: ".__creation_action advance characteristic WS",
    })
  })

  it("disables a purchase whose cost exceeds the current budget", () => {
    render(<CreationWizard creation={advancementCreation(100)} />)

    expect(
      screen.getByRole("button", { name: /Навык Рукопашной.*Простое.*30.*35.*250 опыта/ }),
    ).toBeDisabled()
  })

  it("shows the open mechanical effects of a layer and of the selected choice", async () => {
    const user = userEvent.setup()
    render(<CreationWizard creation={backgroundCreation()} />)

    await user.selectOptions(screen.getByLabelText("Выберите вариант"), "adeptus_administratum")

    expect(screen.getByText("Получаете:").closest("p")).toHaveTextContent("Мастер Бумажной Работы")
    expect(screen.getByText("Снаряжение:").closest("p")).toHaveTextContent("медпакет")

    await user.selectOptions(screen.getByLabelText("Обученное умение"), "medicae")

    expect(screen.getByText("Умения:").closest("p")).toHaveTextContent("Медицина (1)")
    expect(screen.queryByText("Медика")).not.toBeInTheDocument()
  })

  it("makes an equipment click visibly pending until the authoritative state changes", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <CreationWizard creation={equipmentCreation(0, ["Флак-пальто"])} />,
    )

    expect(screen.getByText("Текущий инвентарь")).toBeInTheDocument()
    expect(screen.getByText("Флак-пальто")).toBeInTheDocument()

    const chainBlade = screen.getByRole("button", { name: /Цепной клинок.*оружие.*доступность -10/ })
    await user.click(chainBlade)

    expect(transportSend).toHaveBeenCalledWith({
      type: "input",
      text: ".__creation_action create chain_blade",
    })
    expect(screen.getByRole("button", { name: /Цепной клинок.*добавляем/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Флак-пальто/ })).toBeDisabled()

    rerender(
      <CreationWizard creation={equipmentCreation(1, ["Флак-пальто", "Цепной клинок"])} />,
    )

    expect(screen.getAllByText("Цепной клинок").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Цепной клинок.*оружие.*доступность -10/ })).toBeEnabled()
  })
})

function syntheticCreation(input?: CreationInputPresentation): CreationState {
  return {
    active: true,
    complete: false,
    profile_id: "wanderer",
    stage_index: 0,
    stage_count: 1,
    completed_stages: [],
    stage: {
      id: "crafts",
      kind: "layer",
      fixed: true,
      options: [
        {
          id: "artisan",
          label: "Artisan",
          fixed: true,
          choices: [
            { id: "subject", label: "Star craft", free: true, family: "StarCraft", options: [], input },
            {
              id: "training",
              label: "Training",
              free: false,
              options: [
                { id: "orbital", label: "Orbital craft", specialization: true, input },
                { id: "ordinary", label: "Ordinary craft" },
              ],
            },
          ],
        },
      ],
    },
  }
}

describe("generic creation text inputs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en")
    vi.mocked(transportSend).mockClear()
    useConnectionStore.setState({ status: "online" })
  })

  it("renders server guidance accessibly for both input forms and preserves encoding", async () => {
    const user = userEvent.setup()
    render(
      <CreationWizard
        creation={syntheticCreation({
          label: "Name your field",
          placeholder: "For example, comet weaving",
          description: "Enter only the field name.",
        })}
      />,
    )
    const free = screen.getByRole("textbox", { name: "Name your field" })
    expect(free).toHaveAttribute("placeholder", "For example, comet weaving")
    expect(free).toHaveAccessibleDescription("Enter only the field name.")
    const submit = screen.getByRole("button", { name: "Apply choice" })
    expect(submit).toBeDisabled()
    await user.type(free, "Comet weaving")
    await user.selectOptions(screen.getByLabelText("Training"), "orbital")
    const fields = screen.getAllByRole("textbox", { name: "Name your field" })
    expect(fields).toHaveLength(2)
    expect(fields[1]).toHaveAttribute("placeholder", "For example, comet weaving")
    expect(fields[1]).toHaveAccessibleDescription("Enter only the field name.")
    const descriptions = fields.map((field) => field.getAttribute("aria-describedby"))
    expect(new Set(descriptions).size).toBe(2)
    for (const id of descriptions) {
      expect(document.getElementById(id!)).toHaveTextContent("Enter only the field name.")
    }
    await user.type(fields[1], "   ")
    expect(submit).toBeDisabled()
    await user.type(fields[1], "Moon glass   ")
    await user.click(submit)
    expect(transportSend).toHaveBeenCalledWith({
      type: "input",
      text: ".__creation_action create subject=Comet weaving | training=orbital::Moon glass",
    })
  })

  it.each(["en", "ru", "zh"])("localizes generic fallbacks without pack metadata (%s)", async (locale) => {
    await i18n.changeLanguage(locale)
    const user = userEvent.setup()
    render(<CreationWizard creation={syntheticCreation()} />)
    const free = screen.getByRole("textbox", {
      name: i18n.t("play.character.creation.freeInput.label", { label: "Star craft" }),
    })
    expect(free).toHaveAttribute("placeholder", i18n.t("play.character.creation.freeInput.placeholder"))
    expect(free).toHaveAccessibleDescription(i18n.t("play.character.creation.freeInput.description"))
    await user.selectOptions(screen.getByLabelText("Training"), "orbital")
    const specialization = screen.getByRole("textbox", {
      name: i18n.t("play.character.creation.specializationInput.label", { label: "Orbital craft" }),
    })
    expect(specialization).toHaveAttribute(
      "placeholder",
      i18n.t("play.character.creation.specializationInput.placeholder"),
    )
    expect(specialization).toHaveAccessibleDescription(
      i18n.t("play.character.creation.specializationInput.description"),
    )
    await user.selectOptions(screen.getByLabelText("Training"), "ordinary")
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    await user.type(free, "Glass")
    await user.click(screen.getByRole("button", { name: i18n.t("play.character.creation.apply") }))
    expect(transportSend).toHaveBeenCalledWith({
      type: "input",
      text: ".__creation_action create subject=Glass | training=ordinary",
    })
  })

  it("falls back per missing presentation field", () => {
    render(<CreationWizard creation={syntheticCreation({ label: "Custom subject" })} />)
    const input = screen.getByRole("textbox", { name: "Custom subject" })
    expect(input).toHaveAttribute("placeholder", "Enter your choice")
    expect(input).toHaveAccessibleDescription("Enter the name or value for this choice.")
  })
})
