import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.render("index.ejs", {
    userId: req.session.userId ?? null,
  });
});

router.get("/game", (req, res) => {
  res.render("game.ejs", {
    userId: req.session.userId ?? null,
  });
});

export default router;
