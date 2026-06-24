let board = null;
let gameState = null;
let isProcessingMove = false;
let gameOver = false;
let gameStarted = false;
let gameMode = "ai";
let playerColor = "w";
let currentTurn = "w";
let moveTimeoutId = null;

function resetMoveLock() {
  isProcessingMove = false;
  if (moveTimeoutId) {
    clearTimeout(moveTimeoutId);
    moveTimeoutId = null;
  }
}

function setMoveLock() {
  isProcessingMove = true;
  if (moveTimeoutId) clearTimeout(moveTimeoutId);
  moveTimeoutId = setTimeout(() => {
    isProcessingMove = false;
    moveTimeoutId = null;
  }, 30000);
}

function showSetupPanel() {
  gameStarted = false;
  document.body.classList.add("board-disabled");
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
      group
        .querySelectorAll(".group-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (group.id === "pg-mode") {
        const section = document.getElementById("pg-color-section");
        if (section)
          section.style.display = btn.dataset.value === "ai" ? "" : "none";
      }
    });
  });

  document.querySelectorAll(".time-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".time-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const wrap = document.getElementById("pg-custom-wrap");
      if (wrap)
        wrap.style.display = btn.dataset.value === "custom" ? "" : "none";
    });
  });

  document.getElementById("pg-start")?.addEventListener("click", async () => {
    const mode =
      document.querySelector("#pg-mode .group-btn.active")?.dataset.value ??
      "ai";
    const color =
      document.querySelector("#pg-color .group-btn.active")?.dataset.value ??
      "w";
    let timeControl =
      document.querySelector("#pg-time .time-btn.active")?.dataset.value ?? "";
    if (timeControl === "custom") {
      timeControl = document.getElementById("pg-custom-time")?.value ?? "600+5";
    }
    showGamePanels();
    if (window.startNewGame)
      await window.startNewGame(mode, color, timeControl);
  });
}

async function initBoard() {
  gameState = new GameState();

  board = new Chessboard("board", {
    draggable: true,
    position: "start",
    showNotation: true,

    onSelectPiece: (square, piece) => {
      if (!gameStarted || isProcessingMove || gameOver) return;
      if (piece && piece[0] !== currentTurn) return;
      board.clearHighlights();
      board.highlight([square], "cb-highlight-selected");
      const { moves, captures } = gameState.getLegalMoveTargets(square);
      if (moves.length > 0) {
        board.highlightLegal(moves, captures);
      }
    },

    onDragStart: (source, piece) => {
      if (!gameStarted || isProcessingMove || gameOver) return false;
      if (piece && piece[0] !== currentTurn) return false;
      isProcessingMove = true;
    },

    onDrop: async (source, target, piece) => {
      try {
        board.clearHighlights();
        if (!piece || piece[0] !== currentTurn) {
          isProcessingMove = false;
          return "snapback";
        }
        const isPromotion =
          (piece === "wP" && target[1] === "8" && source[1] === "7") ||
          (piece === "bP" && target[1] === "1" && source[1] === "2");
        let promotion;
        if (isPromotion) promotion = await board.showPromotionDialog(piece[0]);

        const moveResult = gameState.makeMove(source, target, promotion);
        if (!moveResult) {
          isProcessingMove = false;
          return "snapback";
        }

        applyPlayerMove(moveResult, source, target);
        console.log("Player Move Applied");
        console.log({ gameOver, gameMode });
        if (!gameOver && gameMode === "ai") {
          console.log("Triggering AI Move");
          await triggerAiMove();
        }
      } catch (err) {
        console.error("onDrop error:", err);
        resetMoveLock();
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

  window.GameUI.init();
  setupButtonGroups();
  document
    .getElementById("new-game-btn")
    ?.addEventListener("click", showSetupPanel);
  document.getElementById("resign-btn")?.addEventListener("click", onResign);
  document.getElementById("draw-btn")?.addEventListener("click", onDrawOffer);

  document.body.classList.add("board-disabled");

  window.addEventListener("resize", () => board.resize());
}

window.startNewGame = async (mode, color, timeControl) => {
  try {
    await window.GamePersistence.createGame(mode, color, timeControl);
  } catch (err) {
    console.error("Failed to create game in DB:", err);
  }

  const initial = gameState.newGame(mode, color);
  gameOver = false;
  resetMoveLock();
  gameStarted = true;
  document.body.classList.remove("board-disabled");
  gameMode = mode;
  playerColor = gameState.playerColor;
  currentTurn = initial.turn;
  window.SoundFX.play("open");
  board.position(initial.fen);
  document.getElementById("resign-btn")?.removeAttribute("disabled");
  document.getElementById("draw-btn")?.removeAttribute("disabled");
  window.GameUI.moveList = [];
  window.GameUI.renderMoveHistory([]);
  window.GameUI.updateStatus(gameState.getStatus());
  window.GameUI.renderClocks({ white: 0, black: 0 });
  window.GameUI.renderMaterialDiff(0);

  if (mode === "ai" && playerColor !== initial.turn) {
    await triggerAiMove();
  }
};

function applyPlayerMove(move, source, target) {
  const status = gameState.getStatus();
  window.GameUI.appendMove({ ...move, after: status.fen });
  board.position(status.fen);
  board.highlightLastMove(source, target);
  window.GameUI.updateStatus(status);
  currentTurn = status.turn;

  if (status.gameOver) {
    gameOver = true;
    window.GameUI.showGameOver(status);
  }
  isProcessingMove = false;
}

async function triggerAiMove() {
  setMoveLock();
  window.GameUI.showThinking();
  try {
    const result = await window.AIService.requestMove(gameState.getFen());
    if (!result.ok || !result.from) {
      resetMoveLock();
      window.GameUI.hideThinking();
      console.error("AI move response not OK:", result);
      return;
    }
    const moveResult = gameState.makeMove(
      result.from,
      result.to,
      result.promotion,
    );
    if (moveResult) {
      const status = gameState.getStatus();
      board.position(status.fen);
      board.highlightLastMove(result.from, result.to);
      window.GameUI.appendMove({ ...moveResult, after: status.fen });
      window.GameUI.updateStatus(status);
      currentTurn = status.turn;
      if (status.gameOver) {
        gameOver = true;
        window.GameUI.showGameOver(status);
      }
    }
  } catch (err) {
    console.error("AI move failed:", err);
  }
  window.GameUI.hideThinking();
  resetMoveLock();
}

function onResign() {
  window.GameUI.showConfirmDialog("Are you sure you want to resign?").then(
    (ok) => {
      if (!ok) return;
      const result = gameState.resign(currentTurn);
      gameOver = true;
      window.GameUI.showGameOver({
        result: result.result,
        gameOver: true,
        gameOverReason: result.reason,
      });
    },
  );
}

function onDrawOffer() {
  window.GameUI.showConfirmDialog(
    "Are you sure you want to offer a draw?",
  ).then((ok) => {
    if (!ok) return;
    const result = gameState.offerDraw();
    gameOver = true;
    window.GameUI.showGameOver({
      result: result.result,
      gameOver: true,
      gameOverReason: result.reason,
    });
  });
}

document.addEventListener("DOMContentLoaded", initBoard);
