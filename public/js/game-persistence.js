window.GamePersistence = {
  async createGame(mode, color, timeControl) {
    const res = await fetch("/api/new-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, color, timeControl: timeControl || undefined }),
    });
    return res.json();
  },

  async saveGame(gameId, data) {
    const res = await fetch("/api/games/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, ...data }),
    });
    return res.json();
  },

  async loadGame(gameId) {
    const res = await fetch(`/api/games/${gameId}`);
    return res.json();
  },
};
