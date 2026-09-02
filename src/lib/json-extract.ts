/**
 * Shared JSON extraction + repair for LLM text output.
 * Lifted verbatim from claude.ts so every provider (Claude, Luna, …)
 * parses model output the same way. Handles fenced blocks, trailing junk,
 * and truncated JSON.
 */

export function extractJSON<T>(text: string): T {
  // Try 1: Extract from ```json ... ``` code block
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fenceMatch) {
    return parseWithRepair<T>(fenceMatch[1].trim());
  }

  // Try 2: Strip leading/trailing fences (response is entirely fenced)
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Try 3: Find first { or [ and parse from there
    const start = stripped.search(/[\[{]/);
    if (start >= 0) {
      return parseWithRepair<T>(stripped.slice(start));
    }
    throw new Error(`Failed to parse JSON from model response: ${stripped.slice(0, 200)}`);
  }
}

function parseWithRepair<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    console.log(`[json-extract] parse failed: ${msg}, attempting repair...`);

    const extracted = extractRootObject(json);
    if (extracted !== json) {
      try { return JSON.parse(extracted) as T; } catch { /* fall through */ }
    }
    try { return JSON.parse(repairTruncatedJSON(json)) as T; } catch { /* fall through */ }
    try { return JSON.parse(repairTruncatedJSON(extracted)) as T; } catch { throw e; }
  }
}

function extractRootObject(json: string): string {
  if (!json || (json[0] !== '{' && json[0] !== '[')) return json;
  let depth = 0;
  let inString = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (ch === '"' && (i === 0 || json[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return json.substring(0, i + 1);
    }
  }
  return json;
}

function repairTruncatedJSON(json: string): string {
  let s = json;

  let inString = false;
  let lastOutsideString = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      if (inString) lastOutsideString = i;
    }
    if (!inString) lastOutsideString = i;
  }
  if (inString) {
    s = s.substring(0, lastOutsideString);
  }

  s = s.replace(/,\s*$/, "");
  s = s.replace(/:\s*$/, "");
  s = s.replace(/,?\s*"[^"]*"\s*$/, "");
  s = s.replace(/,\s*$/, "");

  const stack: string[] = [];
  inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  s = s.replace(/,\s*$/, "");
  while (stack.length > 0) s += stack.pop();
  return s;
}
