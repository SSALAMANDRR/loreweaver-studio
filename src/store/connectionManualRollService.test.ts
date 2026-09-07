import { beforeEach, describe, expect, it } from "vitest"
import type { TransportEvent } from "../lib/transport"
import { useConnectionStore } from "./connection"
import { useSessionStore } from "./session"

const CONNECTION = "manual-service-test"

function deliver(text: string): void {
  useConnectionStore.getState().handleEvent({
    kind: "frame",
    connectionId: CONNECTION,
    frame: {
      type: "narrative",
      id: `n-${text}`,
      speaker: "player",
      text,
      format: "plain",
    },
  } as TransportEvent)
}

describe("hidden rich-client service echoes", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      connectionId: CONNECTION,
      status: "online",
      refused: false,
    })
  })

  it("filters manual-roll and creation plumbing but keeps ordinary player text", () => {
    deliver(".__roll_pending")
    deliver(".__roll_submit req-17 17")
    deliver(".__creation_action create done")

    expect(useSessionStore.getState().entries).toHaveLength(0)

    deliver("I roll the bones on the table.")
    expect(useSessionStore.getState().entries).toHaveLength(1)
    expect(useSessionStore.getState().entries[0]).toMatchObject({
      kind: "narrative",
      frame: { text: "I roll the bones on the table." },
    })
  })
})
