import { IRuntimeConfig } from "./Runtime";

export const DEPENDENCIES = [
  "process-as-promised",
  "toobusy-js",
  "jitson",
  "debug",
  "bl",
];

export const DEFAULT_RUNTIME_CONFIG: Partial<IRuntimeConfig> = {
  branch: void 0,
  autoScale: false,
};

export const TEMPDIR_PREFIX = "λ_Temps--";
