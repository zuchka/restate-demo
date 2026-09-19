import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function decodeValue(rawValue: string) {
  const value = rawValue.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).replaceAll("\\n", "\n");
  }
  const commentIndex = value.indexOf(" #");
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trimEnd();
}

export function loadLocalEnvironment(root = process.cwd()) {
  const inheritedKeys = new Set(Object.keys(process.env));
  for (const filename of [".env", ".env.local"]) {
    const path = resolve(root, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || inheritedKeys.has(match[1])) continue;
      process.env[match[1]] = decodeValue(match[2]);
    }
  }
}
