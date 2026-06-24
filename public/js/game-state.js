class GameState {
  constructor() {
    this.chess = new Chess();
    this.mode = "ai";
    this.playerColor = "w";
    this.gameOverResult = null;
    this.resigned = false;
    this.drawAgreed = false;
  }

  newGame(mode = "ai", color = "w") {
    this.chess.reset();
    this.mode = mode;
    this.playerColor = color === "random"
      ? (Math.random() < 0.5 ? "w" : "b")
      : color;
    this.gameOverResult = null;
    this.resigned = false;
    this.drawAgreed = false;
    return { fen: this.chess.fen(), turn: this.chess.turn() };
  }

  loadFen(fen) {
    try {
      this.chess.load(fen);
      this.gameOverResult = null;
      this.resigned = false;
      this.drawAgreed = false;
    } catch {
      this.chess.reset();
    }
  }

  getFen() {
    try {
      return this.chess.fen();
    } catch {
      return "start";
    }
  }

  getTurn() {
    try {
      return this.chess.turn();
    } catch {
      return "w";
    }
  }

  getLegalMoveTargets(square) {
    try {
      const moves = this.chess.moves({ square, verbose: true });
      return {
        moves: moves.map((m) => m.to),
        captures: moves.filter((m) => m.captured).map((m) => m.to),
      };
    } catch {
      return { moves: [], captures: [] };
    }
  }

  getLegalMoves(square) {
    try {
      return this.chess.moves({ square, verbose: true });
    } catch {
      return [];
    }
  }

  getAllLegalMoves() {
    try {
      return this.chess.moves({ verbose: true });
    } catch {
      return [];
    }
  }

  makeMove(from, to, promotion) {
    try {
      const result = this.chess.move({ from, to, promotion: promotion || undefined });
      return result || null;
    } catch {
      return null;
    }
  }

  undoMove() {
    try {
      return this.chess.undo();
    } catch {
      return null;
    }
  }

  isCheck() {
    try {
      return this.chess.in_check();
    } catch {
      return false;
    }
  }

  isCheckmate() {
    try {
      return this.chess.in_checkmate();
    } catch {
      return false;
    }
  }

  isStalemate() {
    try {
      return this.chess.in_stalemate();
    } catch {
      return false;
    }
  }

  isDraw() {
    try {
      return this.chess.in_draw();
    } catch {
      return false;
    }
  }

  isInsufficientMaterial() {
    try {
      return this.chess.insufficient_material();
    } catch {
      return false;
    }
  }

  isThreefoldRepetition() {
    try {
      return this.chess.in_threefold_repetition();
    } catch {
      return false;
    }
  }

  isGameOver() {
    try {
      return this.chess.game_over();
    } catch {
      return false;
    }
  }

  getGameOverResult() {
    if (this.gameOverResult) return this.gameOverResult;
    try {
      if (this.chess.in_checkmate()) {
        const winner = this.chess.turn() === "w" ? "0-1" : "1-0";
        this.gameOverResult = { result: winner, reason: "checkmate" };
        return this.gameOverResult;
      }
      if (this.chess.in_stalemate()) {
        this.gameOverResult = { result: "1/2-1/2", reason: "stalemate" };
        return this.gameOverResult;
      }
      if (this.chess.in_draw()) {
        if (this.chess.in_threefold_repetition()) {
          this.gameOverResult = { result: "1/2-1/2", reason: "threefold-repetition" };
        } else if (this.chess.insufficient_material()) {
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

  resign(resigningColor) {
    const result = resigningColor === "w" ? "0-1" : "1-0";
    this.gameOverResult = { result, reason: "resignation" };
    this.resigned = true;
    return this.gameOverResult;
  }

  offerDraw() {
    this.gameOverResult = { result: "1/2-1/2", reason: "draw-agreement" };
    this.drawAgreed = true;
    return this.gameOverResult;
  }

  getMaterialDiff() {
    try {
      const fen = this.chess.fen();
      const boardPart = fen.split(" ")[0];
      if (!boardPart) return 0;
      const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
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

  getHistory() {
    try {
      return this.chess.history({ verbose: true });
    } catch {
      return [];
    }
  }

  getStatus() {
    const result = this.getGameOverResult();
    return {
      fen: this.getFen(),
      turn: this.getTurn(),
      gameOver: this.isGameOver(),
      result: result?.result ?? null,
      gameOverReason: result?.reason ?? null,
      inCheck: this.isCheck(),
      inCheckmate: this.isCheckmate(),
      inStalemate: this.isStalemate(),
      materialDiff: this.getMaterialDiff(),
      history: this.getHistory(),
      mode: this.mode,
    };
  }
}
