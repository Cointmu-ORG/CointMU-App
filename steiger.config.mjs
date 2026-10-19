import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      // Advisory merge suggestions, not part of docs/ARCHITECTURE.md.
      "fsd/insignificant-slice": "off",
    },
  },
]);
