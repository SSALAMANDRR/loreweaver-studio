import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import type { CreationState } from "./creation"
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

describe("CreationWizard advancement stage", () => {
  beforeEach(() => {
    vi.mocked(transportSend).mockClear()
    vi.mocked(transportSend).mockResolvedValue(undefined)
    useConnectionStore.setState({ status: "online" })
  })

  it("renders pack-authored guidance and localized advancement labels", () => {
    render(<CreationWizard creation={advancementCreation(1000)} />)

    expect(screen.getByText("Стартовый опыт")).toBeInTheDocument()
    expect(screen.getByText(/Потратьте стартовые 1000 XP/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Навык Рукопашной.*Простое.*30.*35.*250 XP/ }),
    ).toBeEnabled()
  })

  it("enables a purchase when its cost fits the current server budget", async () => {
    const user = userEvent.setup()
    render(<CreationWizard creation={advancementCreation(1000)} />)

    const purchase = screen.getByRole("button", {
      name: /Навык Рукопашной.*Простое.*30.*35.*250 XP/,
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
      screen.getByRole("button", { name: /Навык Рукопашной.*Простое.*30.*35.*250 XP/ }),
    ).toBeDisabled()
  })
})
