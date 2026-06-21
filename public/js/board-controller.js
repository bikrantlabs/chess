let board = null;
let isProcessingMove = false;
let gameOver = false;
let gameMode = "ai";
let playerColor = "w";

function showSetupPanel() {
  document.getElementById("setup-panel")?.style.removeProperty("display");
  document.getElementById("game-panels")?.style.setProperty("display", "none");
  document.getElementById("resign-btn")?.setAttribute("disabled", "true");
  document.getElementById("draw-btn")?.setAttribute("disabled", "true");
}

function showGamePanels() {
  document.getElementById("setup-panel")?.style.setProperty("display", "none");
  document.getElementById("game-panels")?.style.removeProperty("display");
}

function setupButtonGroups() {
  document.querySelectorAll(".btn-group").forEach((group) => {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest(".group-btn");
      if (!btn) return;
      group.querySelectorAll(".group-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (group.id === "pg-mode") {
        const section = document.getElementById("pg-color-section");
        if (section) section.style.display = btn.dataset.value === "ai" ? "" : "none";
      }
    });
  });

  document.querySelectorAll(".time-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".time-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const wrap = document.getElementById("pg-custom-wrap");
      if (wrap) wrap.style.display = btn.dataset.value === "custom" ? "" : "none";
    });
  });

  document.getElementById("pg-start")?.addEventListener("click", async () => {
    const mode = document.querySelector("#pg-mode .group-btn.active")?.dataset.value ?? "ai";
    const color = document.querySelector("#pg-color .group-btn.active")?.dataset.value ?? "w";
    let timeControl = document.querySelector("#pg-time .time-btn.active")?.dataset.value ?? "";
    if (timeControl === "custom") {
      timeControl = document.getElementById("pg-custom-time")?.value ?? "600+5";
    }
    showGamePanels();
    if (window.startNewGame) await window.startNewGame(mode, color, timeControl);
  });
}

async function initBoard() {
  board = new Chessboard("board", {
    draggable: true,
    position: "start",
    showNotation: true,

    onSelectPiece: async (square) => {
      if (isProcessingMove || gameOver) return;
      board.clearHighlights();
      board.highlight([square], "cb-highlight-selected");
      try {
        const res = await fetch("/api/legal-moves", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ square }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.moves && data.moves.length > 0) {
          board.highlightLegal(data.moves, data.captures);
        }
      } catch (err) {
        console.error("Failed to fetch legal moves:", err);
      }
    },

    onDragStart: () => {
      if (isProcessingMove || gameOver) return false;
      isProcessingMove = true;
    },

    onDrop: async (source, target, piece) => {
      board.clearHighlights();
      const isPromotion =
        (piece === "wP" && target[1] === "8") ||
        (piece === "bP" && target[1] === "1");
      let promotion;
      if (isPromotion) promotion = await board.showPromotionDialog(piece[0]);

      try {
        const res = await fetch("/api/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: source, to: target, promotion: promotion || "q" }),
        });
        const data = await res.json();
        if (!data.ok) {
          isProcessingMove = false;
          return "snapback";
        }
        applyPlayerMove(data, source, target);
        if (!gameOver && gameMode === "ai") {
          await triggerAiMove();
        }
      } catch (err) {
        console.error("Move failed:", err);
        isProcessingMove = false;
        return "snapback";
      }
    },

    onSnapbackEnd: () => {
      board.clearHighlights();
      isProcessingMove = false;
    },
    onSnapEnd: () => {
      board.clearHighlights();
      isProcessingMove = false;
    },
  });
  window.board = board;

  GameUI.init();
  setupButtonGroups();
  document.getElementById("new-game-btn")?.addEventListener("click", showSetupPanel);
  document.getElementById("resign-btn")?.addEventListener("click", onResign);
  document.getElementById("draw-btn")?.addEventListener("click", onDrawOffer);
  window.addEventListener("resize", () => board.resize());
}

window.startNewGame = async (mode, color, timeControl) => {
  const res = await fetch("/api/new-game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, color, timeControl: timeControl || undefined }),
  });
  const data = await res.json();
  if (!data.ok) {
    showSetupPanel();
    return;
  }
  gameOver = false;
  isProcessingMove = false;
  gameMode = mode;
  playerColor = color === "random" ? data.turn : color;
  SoundFX.play("open");
  board.position(data.fen);
  document.getElementById("resign-btn")?.removeAttribute("disabled");
  document.getElementById("draw-btn")?.removeAttribute("disabled");
  GameUI.moveList = [];
  GameUI.renderMoveHistory([]);
  GameUI.updateStatus(data);
  GameUI.renderClocks(data.clocks);
  GameUI.renderMaterialDiff(data.materialDiff ?? 0);

  if (mode === "ai" && playerColor !== data.turn) {
    await triggerAiMove();
  }
};

function applyPlayerMove(data, source, target) {
  if (data.move) {
    GameUI.appendMove({ ...data.move, after: data.fen });
  }
  board.position(data.fen);
  board.highlightLastMove(source, target);
  GameUI.updateStatus(data);
  GameUI.renderClocks(data.clocks);
  GameUI.renderMaterialDiff(data.materialDiff ?? 0);

  if (data.gameOver) {
    gameOver = true;
    GameUI.showGameOver(data);
  }
  isProcessingMove = false;
}

async function triggerAiMove() {
  isProcessingMove = true;
  GameUI.showThinking();
  try {
    const moveRes = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const moveData = await moveRes.json();
    if (moveData.ok && moveData.engineMove) {
      board.position(moveData.fen);
      board.highlightLastMove(moveData.engineMove.from, moveData.engineMove.to);
      GameUI.appendMove({ ...moveData.engineMove, after: moveData.fen });
      GameUI.updateStatus(moveData);
      GameUI.renderClocks(moveData.clocks);
      GameUI.renderMaterialDiff(moveData.materialDiff ?? 0);
      if (moveData.gameOver) {
        gameOver = true;
        GameUI.showGameOver(moveData);
      }
    }
  } catch (err) {
    console.error("AI move failed:", err);
  }
  GameUI.hideThinking();
  isProcessingMove = false;
}

async function onResign() {
  const ok = await GameUI.showConfirmDialog("Are you sure you want to resign?");
  if (!ok) return;
  const res = await fetch("/api/resign", { method: "POST" });
  const data = await res.json();
  if (data.ok) {
    gameOver = true;
    GameUI.showGameOver({ result: data.result, gameOver: true, gameOverReason: "resignation" });
  }
}

async function onDrawOffer() {
  const ok = await GameUI.showConfirmDialog("Are you sure you want to offer a draw?");
  if (!ok) return;
  const res = await fetch("/api/draw", { method: "POST" });
  const data = await res.json();
  if (data.ok) {
    gameOver = true;
    GameUI.showGameOver({ result: data.result, gameOver: true, gameOverReason: "draw-agreement" });
  }
}

document.addEventListener("DOMContentLoaded", initBoard);
