export const config = {
  engine: {
    path: process.env.ENGINE_PATH ?? "./engine/stockfish",
    maxPoolSize: parseInt(process.env.ENGINE_POOL_SIZE ?? "4", 10),
  },
  timeControl: {
    default: process.env.TIME_CONTROL ?? "600+5",
  },
} as const;
