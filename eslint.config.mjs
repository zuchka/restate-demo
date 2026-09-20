import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const compatibility = new FlatCompat({ baseDirectory: directory });

const config = [
  ...compatibility.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      ".next-build/**",
      ".data/**",
      "next-env.d.ts",
      "node_modules/**",
      "outputs/**",
    ],
  },
];

export default config;
