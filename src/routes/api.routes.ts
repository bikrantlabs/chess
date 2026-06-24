import { Router, json } from "express";
import {
  newGame,
  aiMove,
  saveGame,
  loadGame,
} from "../controllers/game.controller.js";

const router = Router();
router.use(json());

router.post("/api/new-game", newGame);
router.post("/api/ai-move", aiMove);
router.post("/api/games/save", saveGame);
router.get("/api/games/:id", loadGame);

export default router;
