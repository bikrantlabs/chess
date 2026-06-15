import { Request, Response } from "express";
import { GameService } from "../services/game.service.js";

const game = new GameService();

export async function newGame(req: Request, res: Response) {
  const mode = req.body.mode ?? "ai";
  const color = req.body.color as "w" | "b" | undefined;
  const userId = req.session.userId;

  const result = await game.newGame(mode, userId, color);
  res.json({ ok: true, ...result });
}

export async function move(req: Request, res: Response) {
  const { from, to, promotion } = req.body;
  const result = await game.playerMove(from, to, promotion ?? "q");

  if (!result.ok) {
    res.json({ ok: false });
    return;
  }

  res.json(result);
}

export function legalMoves(req: Request, res: Response) {
  const { square, fen } = req.body;
  if (fen) game.loadFen(fen);
  const moves = game.getLegalMoves(square);
  res.json({
    moves: moves.map((m) => m.to),
    captures: moves.filter((m) => m.captured).map((m) => m.to),
  });
}

export function position(_req: Request, res: Response) {
  res.json({ fen: game.getFen() });
}

export async function resign(req: Request, res: Response) {
  const userId = req.session.userId;
  if (!userId) {
    res.json({ ok: false, error: "Not authenticated" });
    return;
  }
  const result = await game.resign(userId);
  res.json(result);
}

export function status(_req: Request, res: Response) {
  res.json(game.getStatus());
}
