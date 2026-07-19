import baseConfig from "./base.mjs";

export default [
  ...baseConfig,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
];
