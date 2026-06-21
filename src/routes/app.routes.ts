import { Router } from "express";
import { getGameInstance } from "../controllers/game.controller.js";

const router = Router();

router.get("/", (req, res) => {
  res.render("index.ejs", {
    userId: req.session.userId ?? null,
  });
});

router.get("/game", async (req, res) => {
  let initState = null;

  const gameInstance = getGameInstance();

  if (gameInstance.getGameId() !== null) {
    const state = gameInstance.getStatus();
    initState = {
      fen: state.fen,
      turn: state.turn,
      mode: state.mode,
      playerColor: gameInstance.getPlayerColor(),
      gameOver: state.gameOver,
      inCheck: state.inCheck,
      inCheckmate: state.inCheckmate,
      inStalemate: state.inStalemate,
      materialDiff: state.materialDiff,
      history: state.history,
      result: state.result,
      gameOverReason: state.gameOverReason,
    };
  }

  res.render("game.ejs", {
    userId: req.session.userId ?? null,
    initState,
  });
});

export default router;
