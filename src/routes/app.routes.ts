import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.render("index.ejs", {
    username: "Bikrant",
    gameId: 123,
  });
});

router.get("/game", (req, res) => {
  res.render("game.ejs", {
    username: "Bikrant",
    gameId: 123,
  });
});

router.get("/auth/login", (req, res) => {
  res.render("auth/login.ejs");
});

export default router;
