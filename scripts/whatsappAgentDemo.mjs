import { randomUUID } from "node:crypto";
import { MockLanguageModelV4 } from "ai/test";

export const FICTIONAL_CHEF = {
  id: "demo-chef",
  name: "Fictional Chef",
  phone: "15555550123",
};

export const FICTIONAL_SEED = {
  chefs: [FICTIONAL_CHEF],
  opportunities: [
    {
      reference: "OB12",
      title: "Fictional community lunch",
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      location: "Fictional Oakland community kitchen",
      headcount: 30,
      pay: "$240 total (fictional example)",
      details:
        "Prepare a vegetarian lunch. This is fictional demonstration data.",
      status: "open",
      chefIds: [FICTIONAL_CHEF.id],
    },
  ],
};

export const DEMO_TURNS = [
  "tell me about OB12",
  "that works, count me in",
  "confirm",
];

function result(content, reason) {
  return {
    content,
    finishReason: { unified: reason, raw: reason },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  };
}

function call(toolName, input) {
  return result(
    [
      {
        type: "tool-call",
        toolCallId: randomUUID(),
        toolName,
        input: JSON.stringify(input),
      },
    ],
    "tool-calls",
  );
}

function text(value) {
  return result([{ type: "text", text: value }], "stop");
}

function latestToolOutput(prompt, name) {
  const output = prompt
    .filter(message => message.role === "tool")
    .flatMap(message => message.content)
    .findLast(
      part => part.type === "tool-result" && part.toolName === name,
    )?.output;
  if (output?.type !== "json" || output.value?.error) {
    throw new Error(`Scripted demo expected a successful ${name} tool result.`);
  }
  return output.value;
}

/** Scripted model decisions; the SDK still executes the real agent tools. */
export function createDemoModel() {
  let step = 0;
  return new MockLanguageModelV4({
    modelId: "scripted-offline-demo",
    doGenerate: async ({ prompt }) => {
      switch (step++) {
        case 0:
          return call("get_opportunity", { reference: "OB12" });
        case 1: {
          const opportunity = latestToolOutput(prompt, "get_opportunity");
          return text(
            `I'm Oakland Bloom's automated assistant. ${opportunity.reference}: ${opportunity.title}, ${opportunity.startsAt}, at ${opportunity.location}, for ${opportunity.headcount} people. Pay: ${opportunity.pay ?? "not specified"}. ${opportunity.details}`,
          );
        }
        case 2:
          return call("propose_interest", {
            reference: "OB12",
            interested: true,
            sourceQuote: DEMO_TURNS[1],
          });
        case 3:
          latestToolOutput(prompt, "propose_interest");
          return text("Please confirm your proposed interest response.");
        case 4:
          return call("record_interest", {});
        case 5:
          latestToolOutput(prompt, "record_interest");
          return text("Your interest response was recorded.");
        default:
          throw new Error(
            "The scripted demo received an unexpected model step.",
          );
      }
    },
  });
}
