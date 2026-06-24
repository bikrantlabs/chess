import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import appRouter from "./routes/app.routes.js";
import apiRouter from "./routes/api.routes.js";
import authRouter from "./routes/auth.routes.js";
import { setupSession } from "./lib/session.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const __dirname = dirname(fileURLToPath(import.meta.url));

app.set("view engine", "ejs");
app.set("views", join(__dirname, "../views"));

app.use(express.static(join(__dirname, "../public")));
app.use(express.urlencoded({ extended: true }));
app.use(setupSession());

app.use("/", appRouter);
app.use("/", apiRouter);
app.use("/", authRouter);

io.on("connection", (_socket) => {
  // Future: online PvP via socket.io
});

httpServer.listen(3000, () =>
  console.log("App listening on: " + `http://localhost:${3000}`),
);
