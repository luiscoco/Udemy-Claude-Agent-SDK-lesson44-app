import { test } from "node:test";
import assert from "node:assert/strict";
import { definitions, createSecurityAgent } from "./agents.js";
import { allowedTool } from "./policy.js";
import { validateConfig } from "./modes.js";
import { prepareWorkspace } from "./workspace.js";
import { extractAgentId, PROMPTS } from "./agent.js";
test("factory changes review prompt and model without granting write tools", () => {
  const a = createSecurityAgent("basic"),
    b = createSecurityAgent("strict");
  assert.equal(a.model, "sonnet");
  assert.equal(b.model, "opus");
  assert.notEqual(a.prompt, b.prompt);
  assert.deepEqual(a.tools, b.tools);
  assert.ok(!b.tools!.includes("Bash"));
});
test("automatic task leaves specialist name to description matching", () => {
  assert.ok(!PROMPTS.automatic.includes("security-reviewer"));
  assert.ok(PROMPTS.explicit.includes("security-reviewer"));
});
test("extract real agentId trailer without treating tool-use ID as agent ID", () => {
  assert.equal(
    extractAgentId([{ text: "report\nagentId: child-44" }]),
    "child-44",
  );
  assert.equal(extractAgentId([{ tool_use_id: "toolu_44" }]), undefined);
});
test("known agents and captured resume IDs are distinct policy inputs", () => {
  const names = Object.keys(definitions());
  assert.ok(
    allowedTool(
      "C:/lab",
      "Agent",
      { subagent_type: "endpoint-finder", prompt: "Read endpoints.txt" },
      names,
    ),
  );
  assert.ok(
    allowedTool(
      "C:/lab",
      "SendMessage",
      { to: "child44", message: "Recall route" },
      names,
      ["child44"],
    ),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "SendMessage",
      { to: "unknown", message: "Recall route" },
      names,
      ["child44"],
    ),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Agent",
      { subagent_type: "unknown", prompt: "x" },
      names,
    ),
  );
});
test("scoped reads and exact test command cannot grant edits or arbitrary shell", () => {
  assert.ok(allowedTool("C:/lab", "Read", { file_path: "endpoints.txt" }, []));
  assert.ok(!allowedTool("C:/lab", "Read", { file_path: "../.env" }, []));
  assert.ok(
    allowedTool("C:/lab", "Bash", { command: "node --test auth.test.cjs" }, []),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Bash",
      { command: "node --test auth.test.cjs; echo extra" },
      [],
    ),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Write",
      { file_path: "auth.cjs", content: "fix" },
      [],
    ),
  );
});
test("browser cannot inject definitions, resume IDs, model or paths", () => {
  assert.deepEqual(validateConfig({ mode: "resume" }), { mode: "resume" });
  for (const x of [
    { mode: "unknown" },
    { mode: "strict", model: "other" },
    { mode: "resume", resume: "other" },
  ])
    assert.throws(() => validateConfig(x));
});
test("actual fixture deliberately fails without changing classroom files", async () => {
  const w = await prepareWorkspace();
  try {
    const a = await w.snapshot(),
      r = await w.test(),
      b = await w.snapshot();
    assert.equal(r.passed, false);
    assert.ok(r.output?.includes("not-admin"));
    assert.equal(a.hash, b.hash);
    assert.ok(a.endpoints.includes("orderDetailsHandler"));
  } finally {
    await w.cleanup();
  }
});
