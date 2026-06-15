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
  gameOverReason?: string | null;
  turn?: "w" | "b";
  engineMove?: MoveResult | null;
  clocks?: { white: number; black: number } | null;
}

interface TimeConfig {
  initial: number;
  increment: number;
}

function parseTimeControl(tc: string): TimeConfig | null {
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return null;
  return {
    initial: parseInt(m[1]!, 10) * 1000,
    increment: parseInt(m[2] ?? "0", 10) * 1000,
  };
}

export class GameService {
  private chess = new Chess();
  private gameId: number | null = null;
  private mode: GameMode = "ai";
  private engine: EngineService | null = null;
  private engineReady = false;
  private timeConfig: TimeConfig | null = null;
  private whiteClock: number = 0;
  private blackClock: number = 0;
  private lastMoveTime: number = 0;

  async newGame(
    mode: GameMode = "ai",
    userId?: number,
    color?: "w" | "b",
    timeControl?: string,
  ) {
    this.chess.reset();
    this.mode = mode;
    this.gameId = null;
    this.timeConfig = timeControl ? parseTimeControl(timeControl) : null;
    this.lastMoveTime = Date.now();

    if (this.timeConfig) {
      this.whiteClock = this.timeConfig.initial;
      this.blackClock = this.timeConfig.initial;
    }

    if (mode === "ai") {
      if (!this.engine) {
        this.engine = new EngineService(config.engine.path);
        await this.engine.init();
      }
      this.engineReady = true;

      if (color === "b") {
        await this.doEngineMove();
      }
    }

    if (userId) {
      const userColor = color ?? "w";
      const gameData: Record<string, unknown> = {
        mode,
        fen: this.chess.fen(),
        timeControl: timeControl ?? null,
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
      clocks: this.getClocks(),
    };
  }

  async playerMove(
    from: string,
    to: string,
    promotion = "q",
  ): Promise<PlayerMoveResponse> {
    this.deductTime();

    let move;
    try {
      move = this.chess.move({ from, to, promotion });
    } catch {
      return { ok: false };
    }
    if (!move) return { ok: false };

    this.addIncrement();
    await this.saveMove(move);

    const flagResult = this.checkFlagFall();
    if (flagResult) {
      await this.endGame(flagResult.result);
      return {
        ok: true,
        fen: this.chess.fen(),
        move: this.formatMove(move),
        gameOver: true,
        result: flagResult.result,
        gameOverReason: "timeout",
        turn: this.chess.turn(),
        engineMove: null,
        clocks: this.getClocks(),
      };
    }

    const over = this.getGameOverResult();
    if (over) {
      await this.endGame(over.result);
      return {
        ok: true,
        fen: this.chess.fen(),
        move: this.formatMove(move),
        gameOver: true,
        result: over.result,
        gameOverReason: over.reason,
        turn: this.chess.turn(),
        engineMove: null,
        clocks: this.getClocks(),
      };
    }

    if (this.mode === "ai" && this.engineReady && this.chess.turn() === "b") {
      const engineMoveResult = await this.doEngineMove();
      const afterEngine = this.getGameOverResult();
      return {
        ok: true,
        fen: this.chess.fen(),
        move: this.formatMove(move),
        gameOver: !!afterEngine,
        result: afterEngine?.result ?? null,
        gameOverReason: afterEngine?.reason ?? null,
        turn: this.chess.turn(),
        engineMove: engineMoveResult,
        clocks: this.getClocks(),
      };
    }

    return {
      ok: true,
      fen: this.chess.fen(),
      move: this.formatMove(move),
      gameOver: false,
      result: null,
      gameOverReason: null,
      turn: this.chess.turn(),
      engineMove: null,
      clocks: this.getClocks(),
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
    const over = this.getGameOverResult();
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      gameOver: this.chess.isGameOver(),
      result: over?.result ?? null,
      gameOverReason: over?.reason ?? null,
      history: this.chess.history({ verbose: true }),
      clocks: this.getClocks(),
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

  getClocks() {
    if (!this.timeConfig) return null;
    return { white: this.whiteClock, black: this.blackClock };
  }

  private async doEngineMove(): Promise<MoveResult | null> {
    if (!this.engine || !this.engineReady) return null;

    this.deductTime();
    this.engine.setPosition(this.chess.fen());

    let best: string;
    if (this.timeConfig) {
      best = await this.engine.goTime(
        Math.min(this.chess.turn() === "w" ? this.whiteClock : this.blackClock, 5000),
      );
    } else {
      best = await this.engine.go(10);
    }

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

    this.addIncrement();
    await this.saveMove(move);

    const flagResult = this.checkFlagFall();
    if (flagResult) {
      await this.endGame(flagResult.result);
      return this.formatMove(move);
    }

    const over = this.getGameOverResult();
    if (over) {
      await this.endGame(over.result);
    }

    return this.formatMove(move);
  }

  private deductTime() {
    if (!this.timeConfig) return;
    const elapsed = Date.now() - this.lastMoveTime;
    const turn = this.chess.turn();
    if (turn === "w") {
      this.whiteClock = Math.max(0, this.whiteClock - elapsed);
    } else {
      this.blackClock = Math.max(0, this.blackClock - elapsed);
    }
    this.lastMoveTime = Date.now();
  }

  private addIncrement() {
    if (!this.timeConfig) return;
    const turn = this.chess.turn();
    if (turn === "w") {
      this.whiteClock += this.timeConfig.increment;
    } else {
      this.blackClock += this.timeConfig.increment;
    }
  }

  private checkFlagFall(): { result: string } | null {
    if (!this.timeConfig) return null;
    if (this.whiteClock <= 0) return { result: "0-1" };
    if (this.blackClock <= 0) return { result: "1-0" };
    return null;
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
        clockWhite: this.whiteClock,
        clockBlack: this.blackClock,
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

  private getGameOverResult(): { result: string; reason: string } | null {
    if (!this.chess.isGameOver()) return null;
    if (this.chess.isCheckmate()) {
      const result = this.chess.turn() === "w" ? "0-1" : "1-0";
      return { result, reason: "checkmate" };
    }
    if (this.chess.isStalemate()) return { result: "1/2-1/2", reason: "stalemate" };
    if (this.chess.isDraw()) return { result: "1/2-1/2", reason: "draw" };
    if (this.chess.isThreefoldRepetition()) {
      return { result: "1/2-1/2", reason: "threefold-repetition" };
    }
    if (this.chess.isInsufficientMaterial()) {
      return { result: "1/2-1/2", reason: "insufficient-material" };
    }
    return { result: "1/2-1/2", reason: "draw" };
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
