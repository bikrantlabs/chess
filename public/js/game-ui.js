const SoundFX = {
  enabled: true,
  context: null,

  init() {
    const saved = localStorage.getItem("chess-sound-enabled");
    this.enabled = saved === null ? true : saved === "true";
    this.syncToggle();

    document.getElementById("sound-toggle")?.addEventListener("click", () => {
      this.enabled = !this.enabled;
      localStorage.setItem("chess-sound-enabled", String(this.enabled));
      this.syncToggle();
      this.play("tap", true);
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest("button, .btn, .move-white, .move-black")) {
        this.play("tap");
      }
    });
  },

  syncToggle() {
    const button = document.getElementById("sound-toggle");
    if (!button) return;
    button.setAttribute("aria-pressed", String(this.enabled));
    button.style.opacity = this.enabled ? "1" : "0.48";
    button.title = this.enabled ? "Sounds on" : "Sounds off";
  },

  play(type, force = false) {
    if (!force && !this.enabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context ||= new AudioContext();

    const now = this.context.currentTime;
    const gain = this.context.createGain();
    gain.connect(this.context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === "gameOver" ? 0.055 : 0.035, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "gameOver" ? 0.34 : 0.16));

    const notes = {
      tap: [660],
      open: [520, 740],
      move: [440, 680],
      gameOver: [392, 330],
    }[type] || [520];

    notes.forEach((frequency, index) => {
      const osc = this.context.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, now + index * 0.045);
      osc.connect(gain);
      osc.start(now + index * 0.045);
      osc.stop(now + 0.16 + index * 0.045);
    });
  },
};

const GameUI = {
  moveList: [],
  viewedMove: -1,

  init() {
    this.renderClocks({ white: 0, black: 0 });
    this.renderMaterialDiff(0);
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
    SoundFX.play("move");
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
    const icon = document.getElementById("status-icon");
    if (!el) return;

    document.getElementById("player-top")?.classList.remove("active");
    document.getElementById("player-bottom")?.classList.remove("active");

    if (data.gameOver) {
      const labels = {
        "1-0": "White wins!",
        "0-1": "Black wins!",
        "1/2-1/2": "Draw!",
      };
      let text = labels[data.result] ?? "Game Over";
      if (data.gameOverReason) text += ` (${data.gameOverReason})`;
      el.textContent = text;
      el.className = "status-game-over";
      if (icon) icon.className = "status-dot game-over";
      return;
    }

    const turnLabel = data.turn === "w" ? "White" : "Black";
    let text = `${turnLabel} to move`;

    if (data.turn === "w") {
      document.getElementById("player-bottom")?.classList.add("active");
    } else {
      document.getElementById("player-top")?.classList.add("active");
    }

    if (data.inCheckmate) {
      text = "Checkmate!";
      el.className = "status-checkmate";
      if (icon) icon.className = "status-dot game-over";
    } else if (data.inCheck) {
      text = `${turnLabel} to move - Check!`;
      el.className = "status-check";
      if (icon) icon.className = "status-dot check";
    } else if (data.inStalemate) {
      text = "Stalemate";
      el.className = "status-stalemate";
      if (icon) icon.className = "status-dot game-over";
    } else {
      el.className = `status-${data.turn}`;
      if (icon) icon.className = `status-dot ${data.turn === "w" ? "white" : "black"}`;
    }

    el.textContent = text;
  },

  renderMaterialDiff(diff) {
    const el = document.getElementById("material-diff");
    if (!el) return;
    if (diff === 0) {
      el.textContent = "Equal";
      el.className = "stat-value material-equal";
    } else if (diff > 0) {
      el.textContent = `+${formatMaterial(diff)}`;
      el.className = "stat-value material-advantage-white";
    } else {
      el.textContent = `-${formatMaterial(-diff)}`;
      el.className = "stat-value material-advantage-black";
    }
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
    SoundFX.play("gameOver");
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
            <option value="random">Random</option>
          </select>
        </label>
        <label>Time Control
          <select id="ng-time">
            <option value="">None</option>
            <option value="60+1">1 min + 1s</option>
            <option value="180+2">3 min + 2s</option>
            <option value="600+5" selected>10 min + 5s</option>
            <option value="900+10">15 min + 10s</option>
            <option id="ng-custom-option" value="custom">Custom...</option>
          </select>
        </label>
        <label id="ng-custom-time-label" style="display:none">Custom Time Control
          <input id="ng-custom-time" type="text" placeholder="e.g. 300+3" value="600+5" />
        </label>
        <div class="dialog-actions">
          <button id="ng-cancel" class="btn btn-secondary">Cancel</button>
          <button id="ng-start" class="btn btn-primary">Start</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    SoundFX.play("open");

    document.getElementById("ng-mode")?.addEventListener("change", (e) => {
      const label = document.getElementById("ng-color-label");
      if (label) label.style.display = e.target.value === "ai" ? "" : "none";
    });

    document.getElementById("ng-time")?.addEventListener("change", (e) => {
      const label = document.getElementById("ng-custom-time-label");
      if (label) label.style.display = e.target.value === "custom" ? "" : "none";
    });

    document.getElementById("ng-cancel")?.addEventListener("click", () => overlay.remove());
    document.getElementById("ng-start")?.addEventListener("click", async () => {
      const mode = document.getElementById("ng-mode")?.value ?? "ai";
      const color = document.getElementById("ng-color")?.value ?? "w";
      let timeControl = document.getElementById("ng-time")?.value ?? "";
      if (timeControl === "custom") {
        timeControl = document.getElementById("ng-custom-time")?.value ?? "600+5";
      }
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
      SoundFX.play("open");
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

function formatMaterial(val) {
  const whole = Math.floor(val);
  const frac = Math.round((val - whole) * 100);
  return frac === 0 ? `${whole}` : `${whole}.${frac.toString().padStart(2, "0")}`;
}

document.addEventListener("DOMContentLoaded", () => SoundFX.init());
