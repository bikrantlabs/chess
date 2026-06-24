window.AIService = {
  async requestMove(fen) {
    console.log("Ai move requesting from client");
    const res = await fetch("/api/ai-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen }),
    });
    return res.json();
  },
};
