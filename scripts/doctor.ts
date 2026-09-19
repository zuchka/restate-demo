import { accessSync, constants, existsSync, mkdirSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";
import { loadLocalEnvironment } from "./env";

const root = process.cwd();
loadLocalEnvironment(root);

type Check = {
  level: "pass" | "warn" | "fail";
  label: string;
  detail: string;
};

const checks: Check[] = [];

function add(level: Check["level"], label: string, detail: string) {
  checks.push({ level, label, detail });
}

function packageInstalled(name: string) {
  return existsSync(resolve(root, "node_modules", ...name.split("/"), "package.json"));
}

async function portIsOpen(port: number) {
  return new Promise<boolean>((resolvePromise) => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (open: boolean) => {
      socket.destroy();
      resolvePromise(open);
    };
    socket.setTimeout(450);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function main() {
  const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
  const nodeSupported = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13);
  add(
    nodeSupported ? "pass" : "fail",
    "Node.js",
    `${process.versions.node}${nodeSupported ? "" : "; version 22.13 or newer is required for unflagged node:sqlite"}`,
  );

  const packageJsonPath = resolve(root, "package.json");
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const required = [
      "next",
      "react",
      "react-dom",
      "ai",
      "@ai-sdk/anthropic",
      "@restatedev/restate-sdk",
      "@restatedev/vercel-ai-middleware",
      "@restatedev/restate-server",
      "@restatedev/restate",
      "zod",
    ];
    const missing = required.filter((name) => !packageInstalled(name));
    add(
      missing.length === 0 ? "pass" : "fail",
      "Dependencies",
      missing.length === 0 ? "All required packages are installed." : `Run pnpm install; missing ${missing.join(", ")}.`,
    );
    add(
      "pass",
      "Pinned stack",
      `Restate server ${packageJson.devDependencies?.["@restatedev/restate-server"] ?? "unknown"}, SDK ${packageJson.dependencies?.["@restatedev/restate-sdk"] ?? "unknown"}, AI SDK ${packageJson.dependencies?.ai ?? "unknown"}.`,
    );
    add(
      existsSync(resolve(root, "pnpm-lock.yaml")) ? "pass" : "warn",
      "Dependency lock",
      existsSync(resolve(root, "pnpm-lock.yaml"))
        ? "pnpm-lock.yaml is present."
        : "The first successful pnpm install should create pnpm-lock.yaml; preserve it before rehearsal.",
    );
  } else {
    add("fail", "Project", "package.json was not found; run the command from the repository root.");
  }

  const key = process.env.ANTHROPIC_API_KEY;
  add(
    key && !key.includes("...") ? "pass" : "fail",
    "Anthropic key",
    key && !key.includes("...") ? "Configured without exposing its value." : "Add ANTHROPIC_API_KEY to .env.local.",
  );
  add(
    process.env.CONTROLLER_INTERNAL_TOKEN && process.env.CONTROLLER_INTERNAL_TOKEN !== "change-me-for-shared-environments"
      ? "pass"
      : "warn",
    "Controller token",
    "The default is acceptable for localhost; change it before binding any service publicly.",
  );

  try {
    const dataDirectory = resolve(root, ".data");
    mkdirSync(dataDirectory, { recursive: true });
    accessSync(dataDirectory, constants.R_OK | constants.W_OK);
    add("pass", "Local data", `${dataDirectory} is writable.`);
  } catch (error) {
    add("fail", "Local data", error instanceof Error ? error.message : String(error));
  }

  add(
    existsSync(resolve(root, "restate.toml")) ? "pass" : "fail",
    "Restate config",
    existsSync(resolve(root, "restate.toml")) ? "restate.toml is present." : "restate.toml is missing.",
  );

  const ports = [
    [3000, "Web"],
    [Number(process.env.CONTROLLER_PORT ?? 3_100), "Controller"],
    [Number(process.env.WORKER_PORT ?? 9_080), "Agent worker"],
    [8080, "Restate ingress"],
    [9070, "Restate admin"],
  ] as const;
  for (const [port, label] of ports) {
    const open = await portIsOpen(port);
    add(
      open ? "warn" : "pass",
      `${label} port`,
      open ? `${port} is already in use; stop the existing service or reuse that stack.` : `${port} is available.`,
    );
  }

  const symbols = { pass: "✓", warn: "!", fail: "×" } as const;
  process.stdout.write("\nBreak My Agent environment check\n\n");
  for (const check of checks) {
    process.stdout.write(`${symbols[check.level]} ${check.label}: ${check.detail}\n`);
  }
  const failures = checks.filter((check) => check.level === "fail");
  process.stdout.write(
    failures.length === 0
      ? "\nReady for pnpm dev.\n"
      : `\n${failures.length} blocking check${failures.length === 1 ? "" : "s"} must be fixed.\n`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

void main();
