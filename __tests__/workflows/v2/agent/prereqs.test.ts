import { planEdits, checkPrerequisites } from "@/src/lib/workflows/builder/agent/planner"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"

describe("planner prerequisites", () => {
  const blankFlow = FlowSchema.parse({
    id: "flow",
    name: "Test",
    version: 1,
    nodes: [],
    edges: [],
    trigger: { type: "manual", enabled: true },
    interface: { inputs: [], outputs: [] },
  })

  test("detects missing Slack secret", () => {
    const result = planEdits({ prompt: "Send summary to Slack", flow: blankFlow })
    expect(result.prerequisites).toEqual(
      expect.arrayContaining(["secret:SLACK_WEBHOOK"])
    )
  })

  test("checkPrerequisites spots placeholders", () => {
    const flow = FlowSchema.parse({
      ...blankFlow,
      nodes: [
        {
          id: "notify-1",
          type: "notify.dispatch",
          label: "Notify",
          config: { webhookUrl: "{{secret:SLACK_WEBHOOK}}" },
          inPorts: [],
          outPorts: [],
          io: { inputSchema: undefined, outputSchema: undefined },
          policy: { timeoutMs: 60000, retries: 0 },
          costHint: 0,
          metadata: {},
        },
      ],
    })
    const prereqs = checkPrerequisites(flow)
    expect(prereqs).toEqual([])
  })
})
