let board = null;
let isProcessingMove = false;

async function initBoard() {
  board = new Chessboard('board', {
    draggable: true,
    position: 'start',
    showNotation: true,

    onSelectPiece: async (square, piece, position, orientation) => {
      board.clearHighlights();
      board.highlight([square], 'cb-highlight-selected');

      try {
        const res = await fetch('/api/legal-moves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ square }),
        });

        if (!res.ok) return;

        const data = await res.json();

        if (data.moves && data.moves.length > 0) {
          board.highlightLegal(data.moves);
        }
      } catch (err) {
        console.error('Failed to fetch legal moves:', err);
      }
    },

    onDragStart: (source, piece, position, orientation) => {
      isProcessingMove = true;
    },

    onDragMove: (hoverSquare, sourceSquare, piece, position, orientation) => {
    },

    onDrop: async (source, target, piece, position, orientation) => {
      board.clearHighlights();

      const isPromotion =
        (piece === 'wP' && target[1] === '8') ||
        (piece === 'bP' && target[1] === '1');

      let promotion = undefined;
      if (isPromotion) {
        promotion = await board.showPromotionDialog(piece[0]);
      }

      try {
        const res = await fetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: source,
            to: target,
            promotion: promotion || 'q',
          }),
        });

        const data = await res.json();

        if (!data.ok) {
          return 'snapback';
        }

        board.position(data.fen);
        board.highlightLastMove(source, target);
        isProcessingMove = false;
      } catch (err) {
        console.error('Move failed:', err);
        isProcessingMove = false;
        return 'snapback';
      }
    },

    onChange: (oldPos, newPos) => {
    },

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

    onMouseoverSquare: (square, piece, position, orientation) => {
    },

    onMouseoutSquare: (square, piece, position, orientation) => {
    },

    onOrientationChange: (orientation) => {
    },
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initBoard();
});
