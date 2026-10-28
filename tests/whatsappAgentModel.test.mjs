import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAgentModel } from "../lib/whatsapp/agent/model.ts";

test("direct Anthropic configuration uses its own key without a Gateway key", () => {
  const configured = resolveAgentModel({
    WHATSAPP_AGENT_PROVIDER: "anthropic",
    WHATSAPP_AGENT_MODEL: "native-claude-model-for-test",
    ANTHROPIC_API_KEY: "fake-local-test-credential",
  });
  assert.equal(configured.model.modelId, "native-claude-model-for-test");
  assert.match(configured.model.provider, /^anthropic/);
  assert.equal(configured.label, "Anthropic native-claude-model-for-test");
});

test("Gateway configuration keeps provider/model routing", () => {
  assert.deepEqual(
    resolveAgentModel({
      WHATSAPP_AGENT_MODEL: "provider/model-for-test",
      AI_GATEWAY_API_KEY: "fake-local-test-credential",
    }),
    {
      model: "provider/model-for-test",
      label: "AI Gateway provider/model-for-test",
    },
  );
});

test("missing credentials and invalid provider configuration fail before making a request", () => {
  for (const config of [
    {},
    { WHATSAPP_AGENT_MODEL: "provider/model-for-test" },
    {
      WHATSAPP_AGENT_PROVIDER: "anthropic",
      WHATSAPP_AGENT_MODEL: "test-model",
    },
    {
      WHATSAPP_AGENT_PROVIDER: "unsupported",
      WHATSAPP_AGENT_MODEL: "test-model",
    },
    {
      WHATSAPP_AGENT_PROVIDER: "anthropic",
      WHATSAPP_AGENT_MODEL: "anthropic/test-model",
      ANTHROPIC_API_KEY: "fake-local-test-credential",
    },
  ]) {
    assert.throws(
      () => resolveAgentModel(config),
      /Set |must be|native model ID/,
    );
  }
});
