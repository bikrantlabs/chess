import { Router, json } from "express";
import { GameService } from "../game-state.js";

const router = Router();
router.use(json());

const game = new GameService();

router.post("/api/move", (req, res) => {
  const { from, to, promotion } = req.body;

  const move = game.applyMove(from, to, promotion ?? "q");

  if (!move) {
    res.json({ ok: false });
    return;
  }

  res.json({
    ok: true,
    fen: game.getFEN(),
    move: {
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion,
      san: move.san,
      lan: move.lan,
    },
  });
});

router.post("/api/legal-moves", (req, res) => {
  const { square, fen } = req.body;

  if (fen) {
    game.loadFEN(fen);
  }

  const moves = game.getLegalMoves(square);

  res.json({
    moves: moves.map((m) => m.to),
    captures: moves.filter((m) => m.captured).map((m) => m.to),
  });
});

router.post("/api/new-game", (req, res) => {
  game.reset();
  res.json({ ok: true, fen: game.getFEN() });
});

router.get("/api/position", (req, res) => {
  res.json({ fen: game.getFEN() });
});

export default router;
