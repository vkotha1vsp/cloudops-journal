import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: ["src/generated/**", ".next/**", "node_modules/**", "infra/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
