// server/index.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const __dirname = dirname(fileURLToPath(import.meta.url));

app.set("view engine", "ejs");
app.set("views", join(__dirname, "../views"));

// Serve public folder
app.use(express.static(join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.render("index.ejs", {
    username: "Bikrant",
    gameId: 123,
  });
});
app.get("/game", (req, res) => {
  res.render("game.ejs", {
    username: "Bikrant",
    gameId: 123,
  });
});

app.get("/auth/login", (req, res) => {
  res.sendFile(join(__dirname, "../views/auth/login.html"));
});

// WebSocket for real-time game events
io.on("connection", (socket) => {
  socket.on("move", (data) => {
    /* validate, push, respond */
  });
  socket.on("get-legal-moves", (data) => {
    /* return squares */
  });
});

httpServer.listen(3000, () =>
  console.log("App listening on port: " + `http://localhost:${3000}`),
);
