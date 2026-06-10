// public/js/boardController.js
var config = {
  draggable: true,
  dropOffBoard: "snapback", // this is the default
  position: "start",
};
const board = Chessboard("board", {
  draggable: true,
  dropOffBoard: "snapback", // this is the default
  position: "start",
  showNotation: true,

  onDrop: (source, target) => {
    handleMove(source, target);
    return "snapback";
  },
});
async function handleMove(source, target) {
  try {
    const res = await fetch("/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: source, to: target }),
    });

    const data = await res.json();

    if (!data.ok) {
      board.position(board.position()); // force reset
      return;
    }

    board.position(data.fen);
  } catch (e) {
    console.log("error:", e);

    // force rollback
    board.position(board.position());
  }
}
