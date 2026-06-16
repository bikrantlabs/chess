const GameUI = {
  moveList: [],
  viewedMove: -1,

  init() {
    this.renderClocks({ white: 0, black: 0 });
  },

  renderMoveHistory(moves) {
    this.moveList = moves;
    this.viewedMove = -1;
    const tbody = document.getElementById("move-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (let i = 0; i < moves.length; i += 2) {
      const tr = document.createElement("tr");
      const numTd = document.createElement("td");
      numTd.className = "move-num";
      numTd.textContent = `${Math.floor(i / 2) + 1}.`;
      tr.appendChild(numTd);

      const wTd = document.createElement("td");
      wTd.className = "move-white";
      wTd.textContent = moves[i].san;
      wTd.dataset.index = i;
      wTd.addEventListener("click", () => this.onMoveClick(i));
      tr.appendChild(wTd);

      const bTd = document.createElement("td");
      bTd.className = "move-black";
      if (moves[i + 1]) {
        bTd.textContent = moves[i + 1].san;
        bTd.dataset.index = i + 1;
        bTd.addEventListener("click", () => this.onMoveClick(i + 1));
      }
      tr.appendChild(bTd);

      tbody.appendChild(tr);
    }

    this.highlightCurrentMove();
  },

  appendMove(move) {
    this.moveList.push(move);
    this.renderMoveHistory(this.moveList);
  },

  highlightCurrentMove() {
    const idx = this.viewedMove >= 0 ? this.viewedMove : this.moveList.length - 1;
    document.querySelectorAll(".move-white, .move-black").forEach((td) => {
      td.classList.toggle("move-current", parseInt(td.dataset.index) === idx);
    });
  },

  onMoveClick(index) {
    this.viewedMove = index;
    this.highlightCurrentMove();
    if (window.board && this.moveList[index]) {
      const fen = this.moveList[index].after;
      if (fen) window.board.position(fen);
    }
  },

  updateStatus(data) {
    const el = document.getElementById("game-status");
    if (!el) return;

    if (data.gameOver) {
      const labels = {
        "1-0": "White wins!",
        "0-1": "Black wins!",
        "1/2-1/2": "Draw!",
      };
      el.textContent = labels[data.result] ?? "Game Over";
      el.className = "status-game-over";
      return;
    }

    const turnLabel = data.turn === "w" ? "White" : "Black";
    const checkText = data.inCheck ? " (check)" : "";
    el.textContent = `${turnLabel} to move${checkText}`;
    el.className = `status-${data.turn}`;
  },

  renderClocks(clocks) {
    if (!clocks) return;
    const wEl = document.getElementById("clock-white");
    const bEl = document.getElementById("clock-black");
    if (wEl) wEl.textContent = this.formatClock(clocks.white);
    if (bEl) bEl.textContent = this.formatClock(clocks.black);
  },

  formatClock(ms) {
    if (ms <= 0) return "0:00";
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  },

  showGameOver(data) {
    this.updateStatus(data);
    document.getElementById("resign-btn")?.setAttribute("disabled", "true");
    document.getElementById("draw-btn")?.setAttribute("disabled", "true");
  },

  showNewGameDialog() {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    overlay.innerHTML = `
      <div class="dialog">
        <h2>New Game</h2>
        <label>Mode
          <select id="ng-mode">
            <option value="ai">vs AI</option>
            <option value="pvp-local">Local 2-Player</option>
          </select>
        </label>
        <label id="ng-color-label">Play as
          <select id="ng-color">
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <label>Time Control
          <select id="ng-time">
            <option value="">None</option>
            <option value="60+1">1 min + 1s</option>
            <option value="180+2">3 min + 2s</option>
            <option value="600+5" selected>10 min + 5s</option>
            <option value="900+10">15 min + 10s</option>
          </select>
        </label>
        <div class="dialog-actions">
          <button id="ng-cancel" class="btn btn-secondary">Cancel</button>
          <button id="ng-start" class="btn btn-primary">Start</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById("ng-mode")?.addEventListener("change", (e) => {
      const label = document.getElementById("ng-color-label");
      if (label) label.style.display = e.target.value === "ai" ? "" : "none";
    });

    document.getElementById("ng-cancel")?.addEventListener("click", () => overlay.remove());
    document.getElementById("ng-start")?.addEventListener("click", async () => {
      const mode = document.getElementById("ng-mode")?.value ?? "ai";
      const color = document.getElementById("ng-color")?.value ?? "w";
      const timeControl = document.getElementById("ng-time")?.value ?? "";
      overlay.remove();
      if (window.startNewGame) await window.startNewGame(mode, color, timeControl);
    });
  },

  showConfirmDialog(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "dialog-overlay";
      overlay.innerHTML = `
        <div class="dialog">
          <p>${message}</p>
          <div class="dialog-actions">
            <button class="btn btn-secondary" id="cf-cancel">Cancel</button>
            <button class="btn btn-primary" id="cf-ok">OK</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById("cf-cancel")?.addEventListener("click", () => {
        overlay.remove();
        resolve(false);
      });
      document.getElementById("cf-ok")?.addEventListener("click", () => {
        overlay.remove();
        resolve(true);
      });
    });
  },
};
