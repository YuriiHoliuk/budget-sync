import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TimeTrackingConfig } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_CONFIG: TimeTrackingConfig = {
  sessionGapThreshold: 15,      // Reduced from 30 - more realistic gap threshold
  prepTimeMinutes: 2,           // Reduced from 5 - minimal prep time
  complexAnalysisMinutes: 0,    // Removed - was double-counting time
  simpleAnalysisMinutes: 0,     // Removed - was double-counting time
  complexFileEditThreshold: 5,
  complexSubagentThreshold: 2,
};

export const CLAUDE_DATA_DIR = join(
  process.env.HOME || "~",
  ".claude"
);

export const DATA_DIR = join(__dirname, "..", "data");
