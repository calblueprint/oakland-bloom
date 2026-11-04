import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

/** Validates provider/model environment settings and returns the live model plus a printable label. */
export function resolveAgentModel(env: Record<string, string | undefined>): {
  model: LanguageModel;
  label: string;
} {
  // Configuration chooses the model. Importing this module alone makes no API call.
  const provider = env.WHATSAPP_AGENT_PROVIDER?.trim() || "gateway";
  const modelId = env.WHATSAPP_AGENT_MODEL?.trim();
  if (!modelId) throw new Error("Set WHATSAPP_AGENT_MODEL in .env.local.");

  if (provider === "anthropic") {
    // Direct Anthropic requests use its own model ID and API key.
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY in .env.local.");
    if (modelId.includes("/")) {
      throw new Error(
        "Anthropic direct requires a native model ID, without a provider/ prefix.",
      );
    }
    return {
      model: createAnthropic({
        apiKey,
        baseURL: "https://api.anthropic.com/v1",
      })(modelId),
      label: `Anthropic ${modelId}`,
    };
  }

  if (provider === "gateway") {
    // The SDK resolves a model string through its default Gateway provider.
    if (!env.AI_GATEWAY_API_KEY?.trim()) {
      throw new Error("Set AI_GATEWAY_API_KEY in .env.local.");
    }
    return { model: modelId, label: `AI Gateway ${modelId}` };
  }

  throw new Error("WHATSAPP_AGENT_PROVIDER must be anthropic or gateway.");
}
