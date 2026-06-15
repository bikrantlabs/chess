let board = null;
let isProcessingMove = false;
let gameOver = false;

async function initBoard() {
  board = new Chessboard("board", {
    draggable: true,
    position: "start",
    showNotation: true,

    onSelectPiece: async (square, piece, position, orientation) => {
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
          board.highlightLegal(data.moves);
        }
      } catch (err) {
        console.error("Failed to fetch legal moves:", err);
      }
    },

    onDragStart: (source, piece, position, orientation) => {
      if (isProcessingMove || gameOver) return false;
      isProcessingMove = true;
    },

    onDrop: async (source, target, piece, position, orientation) => {
      board.clearHighlights();

      const isPromotion =
        (piece === "wP" && target[1] === "8") ||
        (piece === "bP" && target[1] === "1");

      let promotion = undefined;
      if (isPromotion) {
        promotion = await board.showPromotionDialog(piece[0]);
      }

      try {
        const res = await fetch("/api/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: source,
            to: target,
            promotion: promotion || "q",
          }),
        });

        const data = await res.json();

        if (!data.ok) {
          isProcessingMove = false;
          return "snapback";
        }

        board.position(data.fen);
        board.highlightLastMove(source, target);
        updateStatus(data);
        isProcessingMove = false;

        if (data.gameOver) {
          gameOver = true;
          showGameOver(data.result);
          return;
        }

        if (data.engineMove) {
          const em = data.engineMove;
          board.position(data.fen);
          board.highlightLastMove(em.from, em.to);
          if (data.gameOver) {
            gameOver = true;
            showGameOver(data.result);
          }
        }
      } catch (err) {
        console.error("Move failed:", err);
        isProcessingMove = false;
        return "snapback";
      }
    },

    onChange: (oldPos, newPos) => {},
    onSnapbackEnd: (piece, square, position, orientation) => {
      board.clearHighlights();
      isProcessingMove = false;
    },
    onSnapEnd: (source, target, piece) => {
      board.clearHighlights();
      isProcessingMove = false;
    },
    onMoveEnd: (oldPos, newPos) => {
      board.clearHighlights();
    },
  });
}

function updateStatus(data) {
  const el = document.getElementById("game-status");
  if (!el) return;

  if (data.gameOver) {
    el.textContent = "Game Over";
    return;
  }
  el.textContent = data.turn === "w" ? "White to move" : "Black to move";
}

function showGameOver(result) {
  const el = document.getElementById("game-status");
  if (!el) return;
  const labels = { "1-0": "White wins!", "0-1": "Black wins!", "1/2-1/2": "Draw!" };
  el.textContent = labels[result] ?? "Game Over";
}

document.addEventListener("DOMContentLoaded", () => {
  initBoard();
});
