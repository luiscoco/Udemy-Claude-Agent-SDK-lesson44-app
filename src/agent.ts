import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { prepareWorkspace } from "./workspace.js";
import { definitions } from "./agents.js";
import { allowedTool } from "./policy.js";
import { MODES, validateConfig } from "./modes.js";
import type {
  Mode,
  RunConfig,
  RunResult,
  Observation,
  Catalog,
  LabEvent,
  Evidence,
} from "./protocol.js";
export { MODES, validateConfig };
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = { mode: "automatic" };
const task = (name: string, body: string) =>
  `Use the ${name} agent for this task and wait for its completed report. Do not do the delegated work yourself. ${body}`;
export const PROMPTS: Record<Mode, string> = {
  automatic:
    "Arrange a specialist security review of auth.cjs. Choose the appropriate specialist from its description, wait for the report and summarize the flaw. Do not inspect the code yourself.",
  explicit: task(
    "security-reviewer",
    "Read auth.cjs and identify the role-check bug.",
  ),
  balanced: task(
    "security-reviewer",
    "Read auth.cjs and give a balanced security review.",
  ),
  strict: task(
    "security-reviewer",
    "Read auth.cjs and give a strict security review: exploit and repair recommendation, no edits.",
  ),
  detect: task(
    "endpoint-finder",
    "Read endpoints.txt and report all three method/path/handler entries.",
  ),
  resume: task(
    "endpoint-finder",
    "Read endpoints.txt once, remember the exact method/path/handler entries, and report all three.",
  ),
  readonly: task(
    "security-reviewer",
    "Read auth.cjs and explain the flaw. Report that your available tools are read-only; do not run shell or modify files.",
  ),
  tests: task(
    "test-runner",
    "Execute exactly node --test auth.test.cjs and report the real failing assertion.",
  ),
  precedence: task(
    "security-reviewer",
    "Read auth.cjs and identify the role-check bug. Follow your programmatic role prompt.",
  ),
};
export function extractAgentId(content: unknown): string | undefined {
  return JSON.stringify(content).match(/agentId:\s*([\w-]+)/)?.[1];
}
export function redact(text: string) {
  for (const s of [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].filter(Boolean) as string[])
    text = text.split(s).join("[REDACTED]");
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]");
}
export async function runAgent(
  value: RunConfig,
  emit: (e: LabEvent) => void,
  controller = new AbortController(),
) {
  const c = validateConfig(value),
    w = await prepareWorkspace(),
    before = await w.snapshot(),
    started = Date.now();
  const results: RunResult[] = [],
    delegations: any[] = [],
    childTools: any[] = [],
    reports: any[] = [],
    lifecycle: any[] = [],
    models = new Set<string>(),
    observations: Observation[] = [],
    exceptions: string[] = [];
  const observe = (kind: string, detail: any) => {
    const record = {
      sequence: observations.length + 1,
      atMs: Date.now() - started,
      kind,
      detail,
    };
    observations.push(record);
    emit({ type: "observation", record });
  };
  let sessionId: string | undefined;
  let agentId: string | undefined;
  let phase = 1;
  const agentDefinitions = definitions(c.mode === "strict");
  const run = async (prompt = PROMPTS[c.mode], resume?: string) => {
    const names = Object.keys(agentDefinitions);
    const options: Options = {
      cwd: w.cwd,
      model: MODEL,
      agents: agentDefinitions,
      resume,
      tools: ["Agent", "SendMessage", "Read", "Grep", "Glob", "Bash"],
      allowedTools: ["Agent", "SendMessage", "Read", "Grep", "Glob", "Bash"],
      permissionMode: "dontAsk",
      settingSources: ["project"],
      forwardSubagentText: true,
      maxTurns: 8,
      maxBudgetUsd: 0.6,
      effort: "low",
      thinking: { type: "disabled" },
      abortController: controller,
      systemPrompt:
        "You are a classroom coordinator. Delegate specialized work to the best matching declared specialist. Wait for completed reports. Never do the child task yourself, modify files or invoke undeclared agents. When asked to resume, use that exact existing child ID rather than starting a fresh child. Keep final answers under 100 words.",
      env: {
        ...process.env,
        HOME: w.home,
        USERPROFILE: w.home,
        CLAUDE_CONFIG_DIR: w.sdkHome,
        ANTHROPIC_AUTH_TOKEN: undefined,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name !== "PreToolUse") return {};
                observe("tool-policy", {
                  name: i.tool_name,
                  input: i.tool_input,
                  agentId: i.agent_id ?? null,
                });
                if (
                  phase === 2 &&
                  ["Agent", "Task", "Read", "Grep", "Glob", "Bash"].includes(
                    i.tool_name,
                  )
                )
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse",
                      permissionDecision: "deny",
                      permissionDecisionReason:
                        "Resume only: SendMessage to the captured child ID; no new child or file reads.",
                    },
                  };
                if (
                  allowedTool(
                    w.cwd,
                    i.tool_name,
                    i.tool_input,
                    names,
                    agentId ? [agentId] : [],
                  )
                )
                  return {};
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason:
                      "Use only declared classroom agents, fixed Read paths or the exact node --test auth.test.cjs command.",
                  },
                };
              },
            ],
          },
        ],
        SubagentStart: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name === "SubagentStart") {
                  const event = {
                    kind: "start",
                    atMs: Date.now() - started,
                    agentId: i.agent_id,
                    agentType: i.agent_type,
                  };
                  lifecycle.push(event);
                  observe("subagent-start", event);
                }
                return {};
              },
            ],
          },
        ],
        SubagentStop: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name === "SubagentStop") {
                  const event = {
                    kind: "stop",
                    atMs: Date.now() - started,
                    agentId: i.agent_id,
                    agentType: i.agent_type,
                    report: i.last_assistant_message ?? null,
                  };
                  lifecycle.push(event);
                  reports.push({ ...event, kind: "stop-report" });
                  observe("subagent-stop", event);
                }
                return {};
              },
            ],
          },
        ],
      },
    };
    observe("query-options", {
      phase,
      resume: resume ?? null,
      agents: options.agents ?? null,
      model: MODEL,
      forwardSubagentText: true,
      tools: options.tools,
      settingSources: options.settingSources,
    });
    try {
      for await (const message of query({ prompt, options })) {
        if ("session_id" in message) sessionId = message.session_id;
        if (message.type === "assistant" || message.type === "user") {
          const extracted = extractAgentId(message.message.content);
          if (extracted) agentId = extracted;
          if (message.parent_tool_use_id)
            observe("child-correlation", {
              phase,
              parentId: message.parent_tool_use_id,
              agentId: "agent_id" in message ? message.agent_id : null,
            });
        }
        if (message.type === "assistant") {
          const parentId = message.parent_tool_use_id;
          models.add(message.message.model);
          for (const b of message.message.content) {
            if (b.type === "tool_use") {
              const record = {
                phase,
                agentId: "agent_id" in message ? message.agent_id : null,
                id: b.id,
                name: b.name,
                input: b.input,
                parentId,
              };
              if (!parentId && (b.name === "Agent" || b.name === "Task")) {
                delegations.push(record);
                observe("delegation", record);
              } else if (parentId) {
                childTools.push(record);
                observe("child-tool", record);
              } else
                observe(
                  b.name === "SendMessage" ? "resume-message" : "parent-tool",
                  record,
                );
            }
            if (b.type === "text") {
              if (parentId)
                observe("child-text", {
                  phase,
                  parentId,
                  agentId: message.agent_id ?? null,
                  text: b.text,
                });
              else emit({ type: "answer", text: redact(b.text) });
            }
          }
        }
        if (message.type === "user")
          for (const b of typeof message.message.content === "string"
            ? []
            : message.message.content) {
            if (b.type === "tool_result") {
              const record = {
                toolUseId: b.tool_use_id,
                parentId: message.parent_tool_use_id,
                content: b.content,
                isError: b.is_error,
              };
              if (delegations.some((d) => d.id === b.tool_use_id)) {
                reports.push(record);
                observe("child-report", record);
              } else observe("tool-feedback", record);
            }
          }
        if (
          message.type === "system" &&
          ["task_started", "task_notification", "task_progress"].includes(
            message.subtype,
          )
        )
          observe(message.subtype, message);
        if (message.type === "result") {
          const record = {
            index: results.length + 1,
            label:
              c.mode +
              (phase === 2 ? " · resumed child follow-up" : " · parent result"),
            sessionId: message.session_id,
            status: message.subtype,
            text:
              message.subtype === "success"
                ? message.result
                : message.errors.join("\n"),
            costUsd: message.total_cost_usd,
            modelUsage: message.modelUsage,
          };
          results.push(record);
          emit({ type: "result", record });
        }
      }
    } catch (e) {
      exceptions.push(redact(e instanceof Error ? e.message : String(e)));
      observe("exception", exceptions.at(-1));
    }
  };
  emit({
    type: "options",
    config: c,
    options: {
      model: MODEL,
      definitions: agentDefinitions,
      forwardSubagentText: true,
      telemetryBoundary:
        "Child messages are forwarded to the host inspector; this does not mean every child tool result is inserted into the parent model context.",
      maxBudgetUsd: 0.6,
      fixture:
        "Deliberately flawed classroom role check. No production authentication or real secrets.",
      cleanup:
        "All temporary fixtures, configuration and transcripts are removed after evidence collection.",
    },
  });
  try {
    await run();
    if (c.mode === "resume") {
      if (!sessionId || !agentId)
        throw new Error(
          "No resumable child Agent result ID was observed; no follow-up was fabricated.",
        );
      phase = 2;
      observe("resume-request", {
        sessionId,
        agentId,
        definitionsUnchanged: true,
      });
      await run(
        `Resume agent ${agentId}. From your existing history, without any Read, Grep, Glob or Bash calls, give the method and handler for /orders/:id. Use SendMessage with to equal to this exact agent ID and message containing the question. Wait for its background completion report. Do not call Agent or start a new child.`,
        sessionId,
      );
    }
    const catalog: Catalog = {
      delegations: delegations.map((d) => ({
        id: d.id,
        title: d.input.subagent_type || d.name,
      })),
      messages: delegations.map((d) => ({
        parentToolUseId: d.id,
        messages: observations.filter(
          (o) =>
            o.detail?.parentId === d.id ||
            (o.kind === "child-report" && o.detail.toolUseId === d.id),
        ),
      })),
    };
    emit({ type: "catalog", catalog });
    const after = await w.snapshot();
    const evidence: Evidence = {
      mode: c.mode,
      results,
      delegations,
      childTools,
      reports,
      lifecycle,
      models: [...models],
      catalog,
      definitions: agentDefinitions,
      continuation: {
        requests: observations
          .filter((o) => o.kind === "resume-request")
          .map((o) => o.detail),
        sends: observations
          .filter((o) => o.kind === "resume-message")
          .map((o) => o.detail),
        childMessages: observations
          .filter((o) => o.kind === "child-correlation")
          .map((o) => o.detail),
      },
      fixtureUnchanged: before.hash === after.hash,
      fixture: after,
      observations,
      exceptions,
    };
    emit({ type: "evidence", ...evidence });
  } finally {
    await w.cleanup();
  }
}
