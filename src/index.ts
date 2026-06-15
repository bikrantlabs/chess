import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import appRouter from "./routes/app.routes.js";
import apiRouter from "./routes/api.routes.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const __dirname = dirname(fileURLToPath(import.meta.url));

app.set("view engine", "ejs");
app.set("views", join(__dirname, "../views"));

app.use(express.static(join(__dirname, "../public")));

app.use("/", appRouter);
app.use("/", apiRouter);

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
