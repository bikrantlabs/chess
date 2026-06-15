import { Chess, Square } from "chess.js";
import prisma from "../lib/prisma.js";
import { EngineService } from "./engine.service.js";
import { config } from "../config.js";

type GameMode = "ai" | "pvp-local" | "pvp-online";

interface MoveResult {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  san: string;
  lan: string;
  [prop: string]: string | undefined;
}

interface PlayerMoveResponse {
  ok: boolean;
  fen?: string;
  move?: MoveResult;
  gameOver?: boolean;
  result?: string | null;
  turn?: "w" | "b";
  engineMove?: MoveResult | null;
}

export class GameService {
  private chess = new Chess();
  private gameId: number | null = null;
  private mode: GameMode = "ai";
  private engine: EngineService | null = null;
  private engineReady = false;

  async newGame(mode: GameMode = "ai", userId?: number, color?: "w" | "b") {
    this.chess.reset();
    this.mode = mode;
    this.gameId = null;

    if (mode === "ai") {
      if (!this.engine) {
        this.engine = new EngineService(config.engine.path);
        await this.engine.init();
      }
      this.engineReady = true;

      if (color === "b") {
        const best = await this.engine.go(10);
        if (best) {
          const from = best.slice(0, 2);
          const to = best.slice(2, 4);
          this.chess.move({ from, to });
        }
      }
    }

    if (userId) {
      const userColor = color ?? "w";
      const gameData: Record<string, unknown> = {
        mode,
        fen: this.chess.fen(),
      };
      if (userColor === "w") gameData.whiteUserId = userId;
      if (userColor === "b") gameData.blackUserId = userId;
      const game = await prisma.game.create({ data: gameData as never });
      this.gameId = game.id;
    }

    return {
      gameId: this.gameId,
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      gameOver: this.chess.isGameOver(),
    };
  }

  async playerMove(
    from: string,
    to: string,
    promotion = "q",
  ): Promise<PlayerMoveResponse> {
    let move;
    try {
      move = this.chess.move({ from, to, promotion });
    } catch {
      return { ok: false };
    }
    if (!move) return { ok: false };

    await this.saveMove(move);

    const result = this.getGameOverResult();
    if (result) {
      await this.endGame(result);
      return {
        ok: true,
        fen: this.chess.fen(),
        move: this.formatMove(move),
        gameOver: true,
        result,
        turn: this.chess.turn(),
        engineMove: null,
      };
    }

    if (this.mode === "ai" && this.engineReady && this.chess.turn() === "b") {
      const engineMoveResult = await this.doEngineMove();
      return {
        ok: true,
        fen: this.chess.fen(),
        move: this.formatMove(move),
        gameOver: !!this.getGameOverResult(),
        result: this.getGameOverResult(),
        turn: this.chess.turn(),
        engineMove: engineMoveResult,
      };
    }

    return {
      ok: true,
      fen: this.chess.fen(),
      move: this.formatMove(move),
      gameOver: false,
      result: null,
      turn: this.chess.turn(),
      engineMove: null,
    };
  }

  async resign(userId: number) {
    if (!this.gameId) return { ok: false };
    const game = await prisma.game.findUnique({ where: { id: this.gameId } });
    if (!game || game.status !== "active") return { ok: false };

    const result = game.whiteUserId === userId ? "0-1" : "1-0";
    await prisma.game.update({
      where: { id: this.gameId },
      data: { status: "completed", result, endedAt: new Date() },
    });
    return { ok: true, result };
  }

  drawOffer() {
    return { ok: true, message: "Draw offer sent" };
  }

  getStatus() {
    const result = this.getGameOverResult();
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      gameOver: this.chess.isGameOver(),
      result,
      history: this.chess.history({ verbose: true }),
    };
  }

  getLegalMoves(square: Square) {
    try {
      return this.chess.moves({ square, verbose: true });
    } catch {
      return [];
    }
  }

  getFen() {
    try {
      return this.chess.fen();
    } catch {
      return "start";
    }
  }

  getHistory() {
    try {
      return this.chess.history({ verbose: true });
    } catch {
      return [];
    }
  }

  loadFen(fen: string) {
    try {
      this.chess.load(fen);
    } catch {
      this.chess.reset();
    }
  }

  loadGame(id: number) {
    this.gameId = id;
  }

  private async doEngineMove(): Promise<MoveResult | null> {
    if (!this.engine || !this.engineReady) return null;

    this.engine.setPosition(this.chess.fen());
    const best = await this.engine.go(10);

    if (!best) return null;
    const from = best.slice(0, 2);
    const to = best.slice(2, 4);

    let move;
    try {
      move = this.chess.move({ from, to });
    } catch {
      return null;
    }
    if (!move) return null;

    await this.saveMove(move);

    const result = this.getGameOverResult();
    if (result) {
      await this.endGame(result);
    }

    return this.formatMove(move);
  }

  private async saveMove(move: { san: string }) {
    if (!this.gameId) return;
    await prisma.move.create({
      data: {
        gameId: this.gameId,
        moveNumber: this.chess.moveNumber(),
        fromSq: "",
        toSq: "",
        san: move.san,
        fen: this.chess.fen(),
      },
    });
    await prisma.game.update({
      where: { id: this.gameId },
      data: { fen: this.chess.fen() },
    });
  }

  private async endGame(result: string) {
    if (!this.gameId) return;
    await prisma.game.update({
      where: { id: this.gameId },
      data: { status: "completed", result, endedAt: new Date() },
    });
  }

  private getGameOverResult(): string | null {
    if (!this.chess.isGameOver()) return null;

    if (this.chess.isCheckmate()) {
      return this.chess.turn() === "w" ? "0-1" : "1-0";
    }
    return "1/2-1/2";
  }

  private formatMove(mv: {
    from: string;
    to: string;
    piece: string;
    captured?: string;
    promotion?: string;
    san: string;
    lan: string;
  }): MoveResult {
    const out: MoveResult = {
      from: mv.from,
      to: mv.to,
      piece: mv.piece,
      san: mv.san,
      lan: mv.lan,
    };
    if (mv.captured !== undefined) out.captured = mv.captured;
    if (mv.promotion !== undefined) out.promotion = mv.promotion;
    return out;
  }
}
