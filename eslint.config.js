// Vérification du code des pages : npm run lint
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**", "web/prototypes/**", "web/public/**"] },
  {
    files: ["web/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser } },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-const-assign": "error",
      "no-import-assign": "error",
    },
  },
];
