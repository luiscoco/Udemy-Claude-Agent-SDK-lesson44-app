# Claude Agent SDK · Lesson 44 · Invoking and controlling subagents

Five linked student pages, large text, actual SDK experiments and coloured code in all thirteen UML steps.

## What you will learn

- Choose automatic or explicit invocation: Compare an unnamed specialist request with a prompt that names security-reviewer. Description matching is model behavior; inspect actual Agent calls to confirm selection.
- Build definitions at runtime: A typed factory changes the reviewer prompt and model: balanced uses Sonnet, strict uses Opus. Both keep the same read-only tools; stronger models do not guarantee better results.
- Trace parent and child identities: Distinguish the parent session_id, Agent tool-use ID, parent_tool_use_id and child agent_id. Display actual nested calls and lifecycle reports.
- Resume actual child history: Run discovery, capture the parent session and child ID, then query again with the same definitions and resume option. SendMessage targets that existing child; prove its ID stays stable.
- Use the smallest tool set: A reviewer can read and search. The test runner can run one exact Node test command. Independent fixture hashes confirm no edits.
- Troubleshoot missing delegation and collisions: Sharpen descriptions or name a specialist explicitly. Inspect a real same-name filesystem definition overridden by the programmatic agents option. New agents directories require a fresh session.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson44-app.git
cd .\Udemy-Claude-Agent-SDK-lesson44-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson44-invoking-subagents`. Open http://127.0.0.1:3144 and keep the terminal running. Node.js 24+, API credit and model access are required. Windows may require Git Bash.

## Create your .env file

Preserve an existing file. Enter your own model key, then restart. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3144
# Windows only, if needed:
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe

```

No GitHub token or Managed Agents IDs are required. Secrets, dependencies and teaching media stay outside Git.

## Run the experiments

### Compare invocation and factories

Automatic does not name a specialist in its task. Explicit does. Balanced and Strict build different prompt/model definitions at runtime, with identical read-only tools.

```powershell
npm run sample:env -- automatic
npm run sample:env -- explicit
npm run sample:env -- balanced
npm run sample:env -- strict
```

### Trace and resume a child

Detect shows native Agent tool IDs and correlated child messages. Resume performs two parent queries with the same definitions and session, then sends the existing child a follow-up. Inspect stable agent_id and the absence of file reads during follow-up.

```powershell
npm run sample:env -- detect
npm run sample:env -- resume
```

### Compare tool sets and precedence

Readonly permits analysis only. Tests executes a fixed real assertion suite with its intentional failure. Precedence verifies a programmatic reviewer overrides a same-name filesystem agent. All temporary fixtures and transcripts are removed after collection.

```powershell
npm run sample:env -- readonly
npm run sample:env -- tests
npm run sample:env -- precedence
npm test
```

## How the app was built

### 1. Choose automatic or explicit invocation

The automatic task asks for description-based selection without naming a specialist. The explicit task names security-reviewer. Both require actual delegation evidence.

Source: `src/agent.ts`, selected lines 21–25. Surrounding code omitted.

```typescript
automatic:
    "Arrange a specialist security review of auth.cjs. Choose the appropriate specialist from its description, wait for the report and summarize the flaw. Do not inspect the code yourself.",
  explicit: task(
    "security-reviewer",
    "Read auth.cjs and identify the role-check bug.",
```

### 2. Build a runtime reviewer definition

The typed factory selects a balanced or strict prompt at request time. Description tells the parent when to select the specialist.

Source: `src/agents.ts`, selected lines 2–8. Surrounding code omitted.

```typescript
export function createSecurityAgent(
  level: "basic" | "strict",
): AgentDefinition {
  const strict = level === "strict";
  return {
    description:
      "Security reviewer for auth.cjs role checks. Delegate authentication security analysis here.",
```

### 3. Select model and tools independently

Sonnet and Opus are runtime model aliases. Both reviewers retain the same read-only tools and bounded turns.

Source: `src/agents.ts`, selected lines 10–14. Surrounding code omitted.

```typescript
tools: ["Read", "Grep", "Glob"],
    model: strict ? "opus" : "sonnet",
    maxTurns: 5,
    effort: "low",
  };
```

### 4. Attach the same agents to each query

Attach stable definitions to the parent query. Enable Agent for initial delegation and SendMessage for current-runtime continuation.

Source: `src/agent.ts`, selected lines 103–108. Surrounding code omitted.

```typescript
agents: agentDefinitions,
      resume,
      tools: ["Agent", "SendMessage", "Read", "Grep", "Glob", "Bash"],
      allowedTools: ["Agent", "SendMessage", "Read", "Grep", "Glob", "Bash"],
      permissionMode: "dontAsk",
      settingSources: ["project"],
```

### 5. Detect the native Agent invocation

Retain the actual Agent tool-use ID and input. Match Task as well for compatibility with older emitted names.

Source: `src/agent.ts`, selected lines 249–253. Surrounding code omitted.

```typescript
if (!parentId && (b.name === "Agent" || b.name === "Task")) {
                delegations.push(record);
                observe("delegation", record);
              } else if (parentId) {
                childTools.push(record);
```

### 6. Correlate nested messages with child IDs

Child messages expose parent_tool_use_id and agent_id. These identify a delegation and child; neither is the parent session ID.

Source: `src/agent.ts`, selected lines 230–234. Surrounding code omitted.

```typescript
observe("child-correlation", {
              phase,
              parentId: message.parent_tool_use_id,
              agentId: "agent_id" in message ? message.agent_id : null,
            });
```

### 7. Extract the child ID from native returns

Parse the agentId trailer in actual returned message content. Do not substitute a tool-use ID or invent a resumable child.

Source: `src/agent.ts`, selected lines 56–58. Surrounding code omitted.

```typescript
export function extractAgentId(content: unknown): string | undefined {
  return JSON.stringify(content).match(/agentId:\s*([\w-]+)/)?.[1];
}
```

### 8. Require captured IDs before follow-up

Require both native parent session and child ID. Keep the same definitions and record the exact resume request.

Source: `src/agent.ts`, selected lines 339–349. Surrounding code omitted.

```typescript
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
```

### 9. Resume the owning parent session

The second query receives resume with the captured parent session ID and reuses the agent definitions. The parent session selects the stored conversation.

Source: `src/agent.ts`, selected lines 103–106. Surrounding code omitted.

```typescript
agents: agentDefinitions,
      resume,
      tools: ["Agent", "SendMessage", "Read", "Grep", "Glob", "Bash"],
      allowedTools: ["Agent", "SendMessage", "Read", "Grep", "Glob", "Bash"],
```

### 10. Target the existing child with SendMessage

Current runtime continuation uses SendMessage to the exact captured child ID. Reject unrelated recipients; a fresh Agent call is blocked during follow-up.

Source: `src/policy.ts`, selected lines 18–24. Surrounding code omitted.

```typescript
if (name === "SendMessage")
    return (
      typeof i.to === "string" &&
      resumeIds.includes(i.to) &&
      typeof i.message === "string"
    );
  if (name === "Bash")
```

### 11. Capture the native completion report

Record actual child stop events and final report. Consume the entire parent stream because resumed work can complete asynchronously.

Source: `src/agent.ts`, selected lines 195–202. Surrounding code omitted.

```typescript
if (i.hook_event_name === "SubagentStop") {
                  const event = {
                    kind: "stop",
                    atMs: Date.now() - started,
                    agentId: i.agent_id,
                    agentType: i.agent_type,
                    report: i.last_assistant_message ?? null,
                  };
```

### 12. Create a same-name filesystem definition

The project contains a same-name file agent with a different marker-only prompt. The programmatic definition takes precedence; verify actual review activity.

Source: `src/workspace.ts`, selected lines 39–40. Surrounding code omitted.

```typescript
join(cwd, ".claude", "agents", "security-reviewer.md"),
    "---\nname: security-reviewer\ndescription: Filesystem collision demonstration\ntools: Read\n---\nReply FILE-DEFINITION-44 only. Never read files.",
```

### 13. Independently verify file integrity

Hash the toy source, tests and endpoint fixture after the workflow. Native reports and unchanged files are independent evidence.

Source: `src/agent.ts`, selected lines 407–411. Surrounding code omitted.

```typescript
fixtureUnchanged: before.hash === after.hash,
      fixture: after,
      observations,
      exceptions,
    };
```

## Reference topics and limits

- Version detail: current child resume: The attached lesson uses an older Agent resume description. In the pinned current runtime, resume the parent query with options.resume and continue its child through SendMessage({to: agentId, message}). A new Agent invocation creates a new instance. Verify stable child IDs instead of assuming a successful parent answer proves resume.
- Four identifiers: session_id belongs to the parent conversation. The Agent tool-use ID identifies a delegation. parent_tool_use_id links nested messages to that delegation. agent_id identifies the actual child and remains stable across a real continuation.
- Automatic versus explicit: The automatic task does not name a specialist but asks the parent to choose by description. The explicit task names security-reviewer. Delegation is observed model behavior; the app does not implement a fake router or guarantee identical selections on every model.
- Runtime factory and model access: Balanced uses the sonnet alias; strict uses opus. Both have Read/Grep/Glob and no editing or shell capability. Inspect actual model IDs. Aliases and account availability vary; this is an educational comparison, not a controlled quality or cost benchmark.
- Child history proof: Resume discovers three routes, then asks the same child about /orders/:id without additional reads. The follow-up guard rejects new Agent calls and file tools. Evidence must show the same agent_id, the original parent session and a SendMessage addressed to that child.
- Tool scope and troubleshooting: Review tools are read-only. The test runner may execute only node --test auth.test.cjs. Programmatic definitions override same-name project agents. New .claude/agents directories need session restart; verify YAML and unique names when agents do not load.
- Partial output and lifetime: A child maxTurns limit can produce a partial report; that is not equivalent to completed work. Custom or general-purpose agents support continuation; Explore and Plan are one-shot. This lab bounds turns and removes all temporary transcripts after the experiment, so its captured IDs are explanatory evidence, not a permanent external resume API.

## References

- [Official SDK subagents documentation](https://code.claude.com/docs/en/agent-sdk/subagents)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)

Regenerate student pages with `python scripts/build-pages.py`. Run `npm test` for specialist definitions, bounded delegation, scoped tools, actual fixture behavior and startup checks.
