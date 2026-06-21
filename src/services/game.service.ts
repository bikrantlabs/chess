import { Chess, Square } from "chess.js";
import { EngineService } from "./engine.service.js";
import { ENGINE_PATH } from "../config.js";

export class GameService {
  private chess = new Chess();
  private gameId: number | null = null;
  private mode: "ai" | "pvp-local" | "pvp-online" = "ai";
  private playerColor: "w" | "b" = "w";
  private gameOverResult: { result: string; reason: string } | null = null;
  private engine: EngineService | null = null;

  getFen() {
    try {
      return this.chess.fen();
    } catch {
      return "start";
    }
  }

  getLegalMoves(square: Square) {
    try {
      return this.chess.moves({ square, verbose: true });
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

  reset() {
    this.chess.reset();
    this.gameId = null;
    this.gameOverResult = null;
    this.cleanupEngine();
  }

  newGame(
    mode: "ai" | "pvp-local" | "pvp-online" = "ai",
    color: "w" | "b" | "random" = "w",
  ) {
    this.chess.reset();
    this.mode = mode;
    this.gameId = null;
    this.gameOverResult = null;
    this.cleanupEngine();
    this.playerColor = color === "random"
      ? (Math.random() < 0.5 ? "w" : "b")
      : color;
    return { fen: this.chess.fen() };
  }

  getMode() {
    return this.mode;
  }

  getPlayerColor() {
    return this.playerColor;
  }

  isCheck() {
    try {
      return this.chess.isCheck();
    } catch {
      return false;
    }
  }

  isCheckmate() {
    try {
      return this.chess.isCheckmate();
    } catch {
      return false;
    }
  }

  isStalemate() {
    try {
      return this.chess.isStalemate();
    } catch {
      return false;
    }
  }

  isDraw() {
    try {
      return this.chess.isDraw();
    } catch {
      return false;
    }
  }

  isInsufficientMaterial() {
    try {
      return this.chess.isInsufficientMaterial();
    } catch {
      return false;
    }
  }

  isThreefoldRepetition() {
    try {
      return this.chess.isThreefoldRepetition();
    } catch {
      return false;
    }
  }

  getMaterialDiff() {
    try {
      const fen = this.chess.fen();
      const boardPart = fen.split(" ")[0];
      if (!boardPart) return 0;
      const pieceValues: Record<string, number> = {
        p: 1, n: 3, b: 3, r: 5, q: 9,
      };
      let score = 0;
      for (const ch of boardPart) {
        const lower = ch.toLowerCase();
        const val = pieceValues[lower] ?? 0;
        if (val === 0) continue;
        score += ch === lower ? -val : val;
      }
      return score;
    } catch {
      return 0;
    }
  }

  getGameOverResult() {
    if (this.gameOverResult) return this.gameOverResult;
    try {
      if (this.chess.isCheckmate()) {
        const winner = this.chess.turn() === "w" ? "0-1" : "1-0";
        this.gameOverResult = { result: winner, reason: "checkmate" };
        return this.gameOverResult;
      }
      if (this.chess.isStalemate()) {
        this.gameOverResult = { result: "1/2-1/2", reason: "stalemate" };
        return this.gameOverResult;
      }
      if (this.chess.isDraw()) {
        if (this.chess.isThreefoldRepetition()) {
          this.gameOverResult = { result: "1/2-1/2", reason: "threefold-repetition" };
        } else if (this.chess.isInsufficientMaterial()) {
          this.gameOverResult = { result: "1/2-1/2", reason: "insufficient-material" };
        } else {
          this.gameOverResult = { result: "1/2-1/2", reason: "draw" };
        }
        return this.gameOverResult;
      }
    } catch {
      // fall through
    }
    return null;
  }

  resign(resigningColor: "w" | "b") {
    const result = resigningColor === "w" ? "0-1" : "1-0";
    this.gameOverResult = { result, reason: "resignation" };
    return this.gameOverResult;
  }

  offerDraw() {
    this.gameOverResult = { result: "1/2-1/2", reason: "draw-agreement" };
    return this.gameOverResult;
  }

  getStatus() {
    return {
      fen: this.getFen(),
      turn: this.getTurn(),
      gameOver: this.isGameOver(),
      result: this.getGameOverResult()?.result ?? null,
      gameOverReason: this.getGameOverResult()?.reason ?? null,
      inCheck: this.isCheck(),
      inCheckmate: this.isCheckmate(),
      inStalemate: this.isStalemate(),
      materialDiff: this.getMaterialDiff(),
      history: this.getHistory(),
      mode: this.mode,
    };
  }

  async playerMove(from: string, to: string, promotion = "q") {
    const moveResult = await this.applyMove(from, to, promotion);
    if (!moveResult) return null;
    return { move: moveResult, ...this.getStatus() };
  }

  async doEngineMove() {
    if (this.mode !== "ai" || this.isGameOver()) return null;

    try {
      if (!this.engine) {
        this.engine = new EngineService(ENGINE_PATH);
        try {
          await this.engine.init();
        } catch {
          this.engine = null;
          return this.fallbackMove();
        }
      }

      this.engine.setPosition(this.chess.fen());
      let bestMove: string;
      try {
        bestMove = await this.engine.goTime(2000, 10000);
      } catch {
        try { await this.engine.stop(); } catch { /* ignore */ }
        return this.fallbackMove();
      }

      if (!bestMove || bestMove.length < 4) return this.fallbackMove();
      const from = bestMove.slice(0, 2) as Square;
      const to = bestMove.slice(2, 4) as Square;
      const promotion = bestMove.length > 4 ? bestMove[4] : undefined;

      const engineMoveResult = await this.applyMove(from, to, promotion);
      if (!engineMoveResult) return this.fallbackMove();
      return engineMoveResult;
    } catch (err) {
      console.error("Engine move failed:", err);
      return this.fallbackMove();
    }
  }

  private fallbackMove() {
    try {
      const moves = this.chess.moves({ verbose: true });
      if (moves.length === 0) return null;
      const move = moves[Math.floor(Math.random() * moves.length)] as {
        from: string; to: string; promotion?: string;
      };
      return this.applyMove(move.from, move.to, move.promotion);
    } catch {
      return null;
    }
  }

  async applyMove(from: string, to: string, promotion = "q") {
    let move;
    try {
      move = this.chess.move({ from, to, promotion });
    } catch {
      return null;
    }
    if (!move) return null;

    return {
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion,
      san: move.san,
      lan: move.lan,
    };
  }

  isGameOver() {
    try {
      return this.chess.isGameOver();
    } catch {
      return true;
    }
  }

  getTurn() {
    try {
      return this.chess.turn();
    } catch {
      return "w";
    }
  }

  isPlayersTurn(userColor?: "w" | "b") {
    if (this.mode === "ai") {
      return this.chess.turn() === this.playerColor;
    }
    if (userColor) {
      return this.chess.turn() === userColor;
    }
    return true;
  }

  getHistory() {
    try {
      return this.chess.history({ verbose: true });
    } catch {
      return [];
    }
  }

  loadGame(id: number) {
    this.gameId = id;
  }

  private async cleanupEngine() {
    if (this.engine) {
      try { await this.engine.quit(); } catch { /* ignore */ }
      this.engine = null;
    }
  }
}
