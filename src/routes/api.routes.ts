import { Router, json } from "express";
import {
  newGame,
  move,
  resign,
  status,
  legalMoves,
  position,
} from "../controllers/game.controller.js";

const router = Router();
router.use(json());

router.post("/api/new-game", newGame);
router.post("/api/move", move);
router.post("/api/resign", resign);
router.get("/api/status", status);
router.post("/api/legal-moves", legalMoves);
router.get("/api/position", position);

export default router;
