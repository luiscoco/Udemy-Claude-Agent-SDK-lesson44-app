import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
export function createSecurityAgent(
  level: "basic" | "strict",
): AgentDefinition {
  const strict = level === "strict";
  return {
    description:
      "Security reviewer for auth.cjs role checks. Delegate authentication security analysis here.",
    prompt: `You are a ${strict ? "strict" : "balanced"} security reviewer. Read auth.cjs once. ${strict ? "Explain the exploit and recommend exact role equality." : "Identify the substring role-check bug."} Do not modify files. Report under 60 words.`,
    tools: ["Read", "Grep", "Glob"],
    model: strict ? "opus" : "sonnet",
    maxTurns: 5,
    effort: "low",
  };
}
export function definitions(strict = false): Record<string, AgentDefinition> {
  return {
    "security-reviewer": createSecurityAgent(strict ? "strict" : "basic"),
    "endpoint-finder": {
      description:
        "Catalogs classroom API routes and answers follow-up questions about them.",
      prompt:
        "Read endpoints.txt only when asked to discover endpoints. Remember their methods, paths and handler names. For a follow-up use your earlier history, do not read again. Report under 60 words.",
      tools: ["Read", "Grep", "Glob"],
      model: "inherit",
      maxTurns: 5,
    },
    "test-runner": {
      description:
        "Runs the classroom auth.test.cjs assertion suite and reports failures.",
      prompt:
        "Run Bash exactly once: node --test auth.test.cjs. No cd, extra commands, edits or fixes. Report actual failures under 50 words.",
      tools: ["Bash", "Read", "Grep"],
      model: "inherit",
      maxTurns: 5,
    },
  };
}
