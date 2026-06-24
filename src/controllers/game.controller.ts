import { Request, Response } from "express";
import { GameService } from "../services/game.service.js";

const gameService = new GameService();

export async function newGame(req: Request, res: Response) {
  try {
    const mode = req.body.mode ?? "ai";
    const color = req.body.color ?? "w";
    const timeControl = req.body.timeControl ?? undefined;
    const result = await gameService.newGame(mode, color, timeControl);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Failed to create game:", err);
    res.json({ ok: false, error: "Failed to create game" });
  }
}

export async function aiMove(req: Request, res: Response) {
  const { fen } = req.body;
  if (!fen) {
    res.json({ ok: false, error: "FEN is required" });
    return;
  }
  const result = await gameService.requestAIMove(fen);
  if (!result) {
    res.json({ ok: false, error: "AI engine move failed" });
    return;
  }
  res.json({ ok: true, ...result });
}

export async function saveGame(req: Request, res: Response) {
  try {
    const { gameId, fen, pgn, result, status } = req.body;
    if (!gameId) {
      res.json({ ok: false, error: "gameId is required" });
      return;
    }
    await gameService.saveGame(gameId, { fen, pgn, result, status });
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to save game:", err);
    res.json({ ok: false, error: "Failed to save game" });
  }
}

export async function loadGame(req: Request, res: Response) {
  try {
    const idStr = req.params.id;
    if (!idStr || Array.isArray(idStr)) {
      res.json({ ok: false, error: "Invalid game ID" });
      return;
    }
    const gameId = parseInt(idStr);
    if (isNaN(gameId)) {
      res.json({ ok: false, error: "Invalid game ID" });
      return;
    }
    const game = await gameService.loadGame(gameId);
    if (!game) {
      res.json({ ok: false, error: "Game not found" });
      return;
    }
    res.json({ ok: true, game });
  } catch (err) {
    console.error("Failed to load game:", err);
    res.json({ ok: false, error: "Failed to load game" });
  }
}
