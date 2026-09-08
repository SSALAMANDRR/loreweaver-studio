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

function config(
  savedProviders: string[] = [],
  provider = "openai",
  usingDemo = true,
  subscriptionStatus = "",
) {
  const nextConfig = {
    type: "admin_config" as const,
    provider,
    chat_model: provider === "chatgpt" ? "gpt-5.4" : "demo",
    base_url: "",
    api_key_masked: "",
    providers: ["openai", "chatgpt"],
    saved_providers: savedProviders,
    override_active: false,
    using_demo: usingDemo,
    subscription_status: subscriptionStatus,
  }
  useAdminStore.setState({
    config: nextConfig,
    models: [],
    modelsProvider: "",
    lastError: null,
    busy: false,
  })
}

describe("ModelScreen ChatGPT subscription OAuth", () => {
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

  it("waits for this login session before auto-switching", async () => {
    const user = userEvent.setup()
    render(<ModelScreen onBack={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }))
    expect(screen.getByText("Waiting for browser confirmation…")).toBeInTheDocument()

    act(() => config(["chatgpt"], "openai", true, "chatgpt:pending"))
    expect(sent).not.toContainEqual(
      expect.objectContaining({ type: "admin_set_model", provider: "chatgpt" }),
    )

    act(() => config(["chatgpt"], "openai", true, "chatgpt:logged_in"))
    await waitFor(() =>
      expect(sent).toContainEqual({
        type: "admin_set_model",
        provider: "chatgpt",
        chat_model: "gpt-5.4",
        base_url: "",
      }),
    )
  })

  it("surfaces the stable server error code", async () => {
    const user = userEvent.setup()
    render(<ModelScreen onBack={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }))
    act(() => config([], "openai", true, "chatgpt:pending"))
    act(() => config([], "openai", true, "chatgpt:error:subscription_poll_failed"))

    expect(await screen.findByText("Authorization failed: subscription_poll_failed")).toBeInTheDocument()
    expect(screen.queryByText("Waiting for browser confirmation…")).toBeNull()
  })

  it("can explicitly replace an existing ChatGPT login", async () => {
    const user = userEvent.setup()
    config(["chatgpt"], "chatgpt", false, "logged_in")
    render(<ModelScreen onBack={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Sign in again" }))

    const commands = sent
      .filter((frame): frame is { type: string; text: string } => {
        if (!frame || typeof frame !== "object") return false
        return "type" in frame && "text" in frame
      })
      .map((frame) => frame.text)
    expect(commands).toContain(".model logout chatgpt")
    expect(commands).toContain(".model login chatgpt")
    expect(commands.indexOf(".model login chatgpt")).toBeGreaterThan(
      commands.indexOf(".model logout chatgpt"),
    )
  })

  it("shows server login instructions and hides key fields for ChatGPT", async () => {
    const user = userEvent.setup()
    render(<ModelScreen onBack={() => {}} />)
    await user.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }))

    act(() => {
      useSessionStore.getState().ingest({
        type: "system",
        level: "info",
        text: "Login started for chatgpt. Open https://auth.openai.com/codex/device and enter code: ABCD-EFGH.",
      })
    })
    expect(screen.getByText(/ABCD-EFGH/)).toBeInTheDocument()

    act(() => config(["chatgpt"]))
    await user.selectOptions(screen.getByLabelText("Provider"), "chatgpt")
    expect(screen.queryByLabelText("API key (write-only)")).toBeNull()
    expect(screen.queryByLabelText("Base URL (optional)")).toBeNull()
  })
})
