import { Request, Response } from "express";
import { GameService } from "../services/game.service.js";

const game = new GameService();

export async function newGame(req: Request, res: Response) {
  const mode = req.body.mode ?? "ai";
  const color = req.body.color ?? "w";
  const result = await game.newGame(mode, color, req.session.userId);
  const status = game.getStatus();
  res.json({ ok: true, ...result, ...status });
}

export async function move(req: Request, res: Response) {
  const { from, to, promotion } = req.body;

  if (!from || !to) {
    const engineMove = await game.doEngineMove();
    if (!engineMove) {
      res.json({ ok: false, error: "AI engine move failed" });
      return;
    }
    const status = game.getStatus();
    res.json({
      ok: true,
      engineMove,
      fen: status.fen,
      gameOver: status.gameOver,
      turn: status.turn,
      inCheck: status.inCheck,
      inCheckmate: status.inCheckmate,
      inStalemate: status.inStalemate,
      materialDiff: status.materialDiff,
      result: status.result,
      gameOverReason: status.gameOverReason,
      history: status.history,
    });
    return;
  }

  const result = await game.playerMove(from, to, promotion ?? "q");
  if (!result) {
    res.json({ ok: false, error: "illegal move" });
    return;
  }

  res.json({ ok: true, ...result });
}

export function resign(req: Request, res: Response) {
  const turn = game.getTurn();
  const result = game.resign(turn);
  res.json({ ok: true, ...result, gameOver: true });
}

export function draw(req: Request, res: Response) {
  const result = game.offerDraw();
  res.json({ ok: true, ...result, gameOver: true });
}

export function status(req: Request, res: Response) {
  res.json({ ok: true, ...game.getStatus() });
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

export function position(req: Request, res: Response) {
  res.json({ fen: game.getFen() });
}

export function getGameInstance() {
  return game;
}
