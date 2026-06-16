let board = null;
let isProcessingMove = false;
let gameOver = false;

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
        applyMoveResponse(data, source, target);
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

  GameUI.init();
  document.getElementById("new-game-btn")?.addEventListener("click", () => GameUI.showNewGameDialog());
  document.getElementById("resign-btn")?.addEventListener("click", onResign);
  document.getElementById("draw-btn")?.addEventListener("click", onDrawOffer);
}

window.startNewGame = async (mode, color, timeControl) => {
  const res = await fetch("/api/new-game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, color, timeControl: timeControl || undefined }),
  });
  const data = await res.json();
  if (!data.ok) return;
  gameOver = false;
  isProcessingMove = false;
  board.position(data.fen);
  document.getElementById("resign-btn")?.removeAttribute("disabled");
  document.getElementById("draw-btn")?.removeAttribute("disabled");
  GameUI.moveList = [];
  GameUI.renderMoveHistory([]);
  GameUI.updateStatus(data);
  GameUI.renderClocks(data.clocks);
  GameUI.renderMaterialDiff(data.materialDiff ?? 0);

  if (data.turn === "b" && mode === "ai") {
    isProcessingMove = true;
    const moveRes = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const moveData = await moveRes.json();
    if (moveData.ok && moveData.engineMove) {
      board.position(moveData.fen);
      board.highlightLastMove(moveData.engineMove.from, moveData.engineMove.to);
      GameUI.renderMoveHistory(moveData.history || []);
      GameUI.updateStatus(moveData);
      GameUI.renderClocks(moveData.clocks);
      GameUI.renderMaterialDiff(moveData.materialDiff ?? 0);
      if (moveData.gameOver) {
        gameOver = true;
        GameUI.showGameOver(moveData);
      }
    }
    isProcessingMove = false;
  }
};

function applyMoveResponse(data, source, target) {
  if (data.move) {
    GameUI.appendMove({ ...data.move, after: data.fen });
  }
  board.position(data.fen);
  if (data.engineMove) {
    board.highlightLastMove(data.engineMove.from, data.engineMove.to);
    if (data.move) {
      GameUI.appendMove({ ...data.engineMove, after: data.fen });
    }
  } else {
    board.highlightLastMove(source, target);
  }
  GameUI.updateStatus(data);
  GameUI.renderClocks(data.clocks);
  GameUI.renderMaterialDiff(data.materialDiff ?? 0);

  if (data.gameOver) {
    gameOver = true;
    GameUI.showGameOver(data);
  }
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
  await GameUI.showConfirmDialog("Draw offered.");
}

document.addEventListener("DOMContentLoaded", initBoard);
