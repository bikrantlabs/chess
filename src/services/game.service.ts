import { EngineService } from "./engine.service.js";
import prisma from "../lib/prisma.js";
import { ENGINE_PATH } from "../config.js";

export class GameService {
  private engine: EngineService | null = null;

  async newGame(
    mode: "ai" | "pvp-local" | "pvp-online" = "ai",
    color: "w" | "b" | "random" = "w",
    timeControl?: string,
  ) {
    const game = await prisma.game.create({
      data: {
        mode,
        timeControl: timeControl ?? null,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        status: "active",
      },
    });
    return { gameId: game.id };
  }

  async requestAIMove(
    fen: string,
  ): Promise<{ from: string; to: string; promotion?: string } | null> {
    console.log("=== requestAIMove called with fen:", fen);

    if (!this.engine) {
      console.log("Creating new EngineService with path:", ENGINE_PATH);
      console.log("ENGINE_PATH value:", ENGINE_PATH);
      this.engine = new EngineService(ENGINE_PATH);
      try {
        console.log("Calling engine.init()...");
        await this.engine.init();
        console.log("engine.init() completed successfully");
      } catch (err) {
        console.error("Failed to load engine:", err);
        this.engine = null;
        return null;
      }
    } else {
      console.log("Reusing existing EngineService instance");
    }
    console.log("AI IS MOVING...");

    try {
      this.engine.setPosition(fen);
      let bestMove: string;
      try {
        bestMove = await this.engine.go(8, 10000);
      } catch {
        console.error("AI Engine error");
        try {
          await this.engine.stop();
        } catch {
          /* ignore */
        }
        return null;
      }

      if (!bestMove || bestMove.length < 4) return null;
      const from = bestMove.slice(0, 2);
      const to = bestMove.slice(2, 4);
      const promotion = bestMove.length > 4 ? bestMove[4] : undefined;
      return { from, to, ...(promotion ? { promotion } : {}) };
    } catch {
      return null;
    }
  }

  async saveGame(
    gameId: number,
    data: { fen?: string; pgn?: string; result?: string; status?: string },
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.fen !== undefined) updateData.fen = data.fen;
    if (data.pgn !== undefined) updateData.pgn = data.pgn;
    if (data.result !== undefined) {
      updateData.result = data.result;
      updateData.status = "completed";
      updateData.endedAt = new Date();
    }
    if (data.status !== undefined) updateData.status = data.status;
    await prisma.game.update({
      where: { id: gameId },
      data: updateData,
    });
  }

  async loadGame(gameId: number) {
    return prisma.game.findUnique({
      where: { id: gameId },
      include: { moves: { orderBy: { moveNumber: "asc" as const } } },
    });
  }

  async cleanupEngine() {
    if (this.engine) {
      try {
        await this.engine.quit();
      } catch {
        /* ignore */
      }
      this.engine = null;
    }
  }
}
