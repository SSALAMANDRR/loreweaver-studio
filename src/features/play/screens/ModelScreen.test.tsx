import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: unknown[] = []
const transportSend = vi.fn(async (frame: unknown) => {
  sent.push(frame)
})
vi.mock("../../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: (frame: unknown) => transportSend(frame),
}))

import i18n from "../../../i18n"
import { useAdminStore } from "../../../store/admin"
import { useSessionStore } from "../../../store/session"
import ModelScreen from "./ModelScreen"

function config(savedProviders: string[] = [], provider = "openai", usingDemo = true) {
  useAdminStore.setState({
    config: {
      type: "admin_config",
      provider,
      chat_model: provider === "chatgpt" ? "gpt-5.4" : "demo",
      base_url: "",
      api_key_masked: "",
      providers: ["openai", "chatgpt"],
      saved_providers: savedProviders,
      override_active: false,
      using_demo: usingDemo,
    },
    models: [],
    modelsProvider: "",
    lastError: null,
    busy: false,
  })
}

describe("ModelScreen — ChatGPT subscription OAuth", () => {
  beforeEach(async () => {
    sent.length = 0
    transportSend.mockClear()
    transportSend.mockImplementation(async (frame: unknown) => {
      sent.push(frame)
    })
    useSessionStore.setState({ entries: [] })
    config()
    await i18n.changeLanguage("en")
  })

  it("starts device login, shows the server instructions and switches automatically after authorization", async () => {
    const user = userEvent.setup()
    render(<ModelScreen onBack={() => {}} />)

    expect(screen.getByText(/fixed fallback reply/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }))

    expect(sent).toContainEqual({ type: "input", text: ".model login chatgpt" })
    expect(screen.getByText("Waiting for browser confirmation…")).toBeInTheDocument()

    act(() => {
      useSessionStore.getState().ingest({
        type: "system",
        level: "info",
        text: "Login started for chatgpt. Open https://auth.openai.com/codex/device and enter code: ABCD-EFGH.",
      })
    })
    expect(screen.getByText(/ABCD-EFGH/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open the OpenAI login page" })).toHaveAttribute(
      "href",
      "https://auth.openai.com/codex/device",
    )

    act(() => config(["chatgpt"]))
    await waitFor(() =>
      expect(sent).toContainEqual({
        type: "admin_set_model",
        provider: "chatgpt",
        chat_model: "gpt-5.4",
        base_url: "",
      }),
    )
  })

  it("does not offer API-key fields for the ChatGPT subscription path", async () => {
    const user = userEvent.setup()
    config(["chatgpt"])
    render(<ModelScreen onBack={() => {}} />)

    await user.selectOptions(screen.getByLabelText("Provider"), "chatgpt")
    expect(screen.queryByLabelText("API key (write-only)")).toBeNull()
    expect(screen.queryByLabelText("Base URL (optional)")).toBeNull()
  })
})
