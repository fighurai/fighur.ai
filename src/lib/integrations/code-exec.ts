import { createContext, runInContext } from "node:vm";

export type CodeExecResult =
  | { ok: true; language: string; stdout: string; result: string }
  | { ok: false; error: string };

const MAX_CODE_CHARS = 8_000;
const TIMEOUT_MS = 1_500;

/**
 * Sandboxed JS execution for agent tool use.
 * Python/other languages are not available on this serverless runtime yet.
 */
export async function runSandboxedCode(
  code: string,
  language: string,
): Promise<CodeExecResult> {
  const lang = (language || "javascript").toLowerCase().trim();
  if (lang !== "javascript" && lang !== "js" && lang !== "typescript" && lang !== "ts") {
    return {
      ok: false,
      error:
        "Only JavaScript is supported in run_code on this host. Rewrite the calculation in JavaScript, or explain steps for the user to run elsewhere.",
    };
  }

  const src = code.trim();
  if (!src) return { ok: false, error: "code is required" };
  if (src.length > MAX_CODE_CHARS) {
    return { ok: false, error: `code too long (max ${MAX_CODE_CHARS} chars)` };
  }

  // Block obvious escape attempts
  if (/\b(process|require|globalThis|Function|eval|import\s*\(|fetch\s*\()\b/.test(src)) {
    return {
      ok: false,
      error:
        "Code uses forbidden APIs (process/require/fetch/eval). Use pure computation only.",
    };
  }

  const logs: string[] = [];
  const sandbox = {
    console: {
      log: (...args: unknown[]) => {
        logs.push(args.map(stringify).join(" "));
      },
      warn: (...args: unknown[]) => {
        logs.push(args.map(stringify).join(" "));
      },
      error: (...args: unknown[]) => {
        logs.push(args.map(stringify).join(" "));
      },
    },
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    parseInt,
    parseFloat,
    isFinite,
    isNaN,
  };

  try {
    const context = createContext(sandbox);
    // Wrap so expression results are captured
    const wrapped = `(function(){\n"use strict";\n${src}\n})()`;
    const value = runInContext(wrapped, context, {
      timeout: TIMEOUT_MS,
      displayErrors: true,
    });
    return {
      ok: true,
      language: "javascript",
      stdout: logs.join("\n").slice(0, 8_000),
      result: stringify(value).slice(0, 8_000),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Code execution failed",
    };
  }
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}
