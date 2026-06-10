// server/routes/gameController.ts
import { GameService } from "./game-state.js";
import { EngineProcess } from "./engine-process.js";

const game = new GameService();
const engine = new EngineProcess();

export async function playerMove(from: string, to: string) {
  const move = game.applyMove(from, to);

  if (!move) {
    return { ok: false };
  }

  //   const history = game.getHistory(); // implement if needed
  //   engine.setPosition(history);

  const bestMove = await engine.go(10);

  const fromSq = bestMove.slice(0, 2);
  const toSq = bestMove.slice(2, 4);

  game.applyMove(fromSq, toSq);

  return {
    ok: true,
    fen: game.getFEN(),
    engineMove: bestMove,
  };
}
