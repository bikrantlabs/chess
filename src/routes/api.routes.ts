import { Router, json } from "express";
import {
  newGame,
  move,
  legalMoves,
  position,
  resign,
  status,
} from "../controllers/game.controller.js";

const router = Router();
router.use(json());

router.post("/api/new-game", newGame);
router.post("/api/move", move);
router.post("/api/legal-moves", legalMoves);
router.get("/api/position", position);
router.post("/api/resign", resign);
router.get("/api/status", status);

export default router;
