// server/chess/gameService.ts
import { Chess, Square } from "chess.js";

export class GameService {
  private game = new Chess();

  getFEN() {
    return this.game.fen();
  }

  getLegalMoves(from: Square) {
    return this.game.moves({ square: from, verbose: true });
  }

  applyMove(from: string, to: string, promotion = "q") {
    return this.game.move({ from, to, promotion });
  }

  loadFEN(fen: string) {
    this.game.load(fen);
  }

  reset() {
    this.game.reset();
  }
}
