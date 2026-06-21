import { join } from "path";
import { platform } from "os";

export const ENGINE_PATH = join(
  process.cwd(),
  "engine",
  platform() === "win32" ? "endgame.exe" : "endgame",
);
export const ENGINE_POOL_SIZE = 4;
export const DEFAULT_TIME_CONTROL = "600+5";
