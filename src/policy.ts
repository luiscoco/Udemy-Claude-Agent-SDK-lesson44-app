import { resolve, relative, isAbsolute } from "node:path";
export function allowedTool(
  cwd: string,
  name: string,
  value: unknown,
  names: string[],
  resumeIds: string[] = [],
) {
  if (!value || typeof value !== "object") return false;
  const i = value as Record<string, unknown>;
  if (name === "Agent" || name === "Task")
    return (
      typeof i.subagent_type === "string" &&
      names.includes(i.subagent_type) &&
      typeof i.prompt === "string" &&
      !i.resume
    );
  if (name === "SendMessage")
    return (
      typeof i.to === "string" &&
      resumeIds.includes(i.to) &&
      typeof i.message === "string"
    );
  if (name === "Bash")
    return (
      typeof i.command === "string" &&
      i.command.trim() === "node --test auth.test.cjs"
    );
  if (name === "Read")
    return (
      typeof i.file_path === "string" &&
      ["auth.cjs", "auth.test.cjs", "endpoints.txt", "CLAUDE.md"].some(
        (f) => resolve(cwd, i.file_path as string) === resolve(cwd, f),
      )
    );
  if (name === "Grep" || name === "Glob") {
    const path = typeof i.path === "string" ? resolve(cwd, i.path) : cwd,
      r = relative(cwd, path);
    return (
      !r.startsWith("..") &&
      !isAbsolute(r) &&
      typeof i.pattern === "string" &&
      i.pattern.length <= 120 &&
      !i.pattern.includes("..")
    );
  }
  return false;
}
