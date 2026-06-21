class Chessboard {
  static FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  static START_POSITION = (() => {
    const obj = {};
    const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let f = 0; f < 8; f++) {
      obj[Chessboard.FILES[f] + '1'] = 'w' + backRank[f].toUpperCase();
      obj[Chessboard.FILES[f] + '2'] = 'wP';
      obj[Chessboard.FILES[f] + '7'] = 'bP';
      obj[Chessboard.FILES[f] + '8'] = 'b' + backRank[f].toUpperCase();
    }
    return obj;
  })();

  static fenToObj(fen) {
    const parts = fen.split(' ');
    const boardPart = parts[0];
    const rows = boardPart.split('/');
    if (rows.length !== 8) return null;
    const obj = {};
    for (let r = 0; r < 8; r++) {
      let col = 0;
      const rank = 8 - r;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          col += parseInt(ch, 10);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          const piece = color + ch.toUpperCase();
          obj[Chessboard.FILES[col] + rank] = piece;
          col++;
        }
      }
    }
    return obj;
  }

  static objToFen(obj) {
    let fen = '';
    for (let r = 8; r >= 1; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const sq = Chessboard.FILES[f] + r;
        const piece = obj[sq];
        if (!piece) {
          empty++;
        } else {
          if (empty > 0) { fen += empty; empty = 0; }
          fen += piece[1];
        }
      }
      if (empty > 0) fen += empty;
      if (r > 1) fen += '/';
    }
    return fen;
  }

  static isValidSquare(sq) {
    return /^[a-h][1-8]$/.test(sq);
  }

  static isValidPiece(p) {
    return /^[bw][KQRNBP]$/.test(p);
  }

  static squareToRank(sq) {
    return parseInt(sq[1], 10);
  }

  static squareToFile(sq) {
    return sq[0];
  }

  static fileIndex(sq) {
    return Chessboard.FILES.indexOf(sq[0]);
  }

  constructor(element, config = {}) {
    this._container = typeof element === 'string'
      ? document.getElementById(element)
      : element;

    if (!this._container) {
      throw new Error('Chessboard: container element not found');
    }

    this.config = {
      draggable: true,
      showNotation: true,
      orientation: 'white',
      pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
      position: 'start',

      onSelectPiece: null,
      onDragStart: null,
      onDragMove: null,
      onDrop: null,
      onMoveStart: null,
      onMoveEnd: null,
      onSnapbackEnd: null,
      onSnapEnd: null,
      onChange: null,
      onMouseoverSquare: null,
      onMouseoutSquare: null,
      onOrientationChange: null,

      ...config,
    };

    this._currentPosition = {};
    this._orientation = 'white';
    this._squareSize = 0;
    this._selectedSquare = null;
    this._isDragging = false;
    this._potentialDrag = null;
    this._dragFloatEl = null;
    this._dragSource = null;
    this._dragPiece = null;
    this._lastHoverSquare = null;
    this._isDestroyed = false;
    this._promotionResolve = null;

    this.highlightedSquares = [];

    this._board = null;

    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundClick = this._onSquareClick.bind(this);

    this._init();
  }

  _trigger(name, ...args) {
    if (typeof this.config[name] === 'function') {
      return this.config[name](...args);
    }
  }

  _getPieceUrl(piece) {
    if (typeof this.config.pieceTheme === 'function') {
      return this.config.pieceTheme(piece);
    }
    return this.config.pieceTheme.replace('{piece}', piece);
  }

  _getSquareElement(sq) {
    return this._board ? this._board.querySelector(`[data-square="${sq}"]`) : null;
  }

  _getPieceElement(sq) {
    const sqEl = this._getSquareElement(sq);
    return sqEl ? sqEl.querySelector('.cb-piece') : null;
  }

  _setPieceVisibility(sq, visible) {
    const el = this._getPieceElement(sq);
    if (el) el.style.display = visible ? '' : 'none';
  }

  _getSquareFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const sqEl = el.closest('[data-square]');
    return sqEl ? sqEl.dataset.square : null;
  }

  _init() {
    const pos = this.config.position;
    if (pos === 'start') {
      this._currentPosition = { ...Chessboard.START_POSITION };
    } else if (typeof pos === 'string') {
      this._currentPosition = Chessboard.fenToObj(pos) || { ...Chessboard.START_POSITION };
    } else if (typeof pos === 'object' && pos !== null) {
      this._currentPosition = { ...pos };
    } else {
      this._currentPosition = { ...Chessboard.START_POSITION };
    }

    this._orientation = this.config.orientation === 'black' ? 'black' : 'white';

    this._render();
    this._attachEvents();
  }

  _render() {
    this._container.innerHTML = '';

    const containerEl = document.createElement('div');
    containerEl.className = 'cb-board-container';
    containerEl.style.width = '100%';

    const boardEl = document.createElement('div');
    boardEl.className = 'cb-board';
    this._board = boardEl;

    this._calculateSquareSize();
    boardEl.style.width = (this._squareSize * 8) + 'px';
    boardEl.style.height = (this._squareSize * 8) + 'px';

    const files = [...Chessboard.FILES];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

    if (this._orientation === 'black') {
      files.reverse();
      ranks.reverse();
    }

    for (let r = 0; r < 8; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'cb-row';

      for (let f = 0; f < 8; f++) {
        const sq = files[f] + ranks[r];
        const isLight = (r + f) % 2 === 0;

        const sqEl = document.createElement('div');
        sqEl.className = `cb-square ${isLight ? 'cb-square-light' : 'cb-square-dark'}`;
        sqEl.dataset.square = sq;
        sqEl.style.width = this._squareSize + 'px';
        sqEl.style.height = this._squareSize + 'px';

        const piece = this._currentPosition[sq];
        if (piece) {
          const img = document.createElement('img');
          img.src = this._getPieceUrl(piece);
          img.className = 'cb-piece';
          img.dataset.piece = piece;
          img.draggable = false;
          sqEl.appendChild(img);
        }

        if (this.config.showNotation) {
          if (f === 0) {
            const numeric = document.createElement('span');
            numeric.className = 'cb-notation cb-notation-numeric';
            numeric.textContent = String(ranks[r]);
            sqEl.appendChild(numeric);
          }
          if ((this._orientation === 'white' && ranks[r] === 1) ||
              (this._orientation === 'black' && ranks[r] === 8)) {
            const alpha = document.createElement('span');
            alpha.className = 'cb-notation cb-notation-alpha';
            alpha.textContent = files[f];
            sqEl.appendChild(alpha);
          }
        }

        rowEl.appendChild(sqEl);
      }

      boardEl.appendChild(rowEl);
    }

    containerEl.appendChild(boardEl);
    this._container.appendChild(containerEl);
  }

  _calculateSquareSize() {
    const containerWidth = this._container.clientWidth;
    if (containerWidth <= 0) {
      this._squareSize = 50;
      return;
    }
    this._squareSize = Math.floor((containerWidth - 1) / 8);
    if (this._squareSize < 20) this._squareSize = 20;
  }

  _attachEvents() {
    this._board.addEventListener('mousedown', this._boundMouseDown);
    this._board.addEventListener('click', this._boundClick);
    this._board.addEventListener('mouseover', (e) => {
      const sqEl = e.target.closest('[data-square]');
      if (sqEl && !this._isDragging) {
        const sq = sqEl.dataset.square;
        this._trigger('onMouseoverSquare', sq, this._currentPosition[sq] || false, { ...this._currentPosition }, this._orientation);
      }
    });
    this._board.addEventListener('mouseout', (e) => {
      const sqEl = e.target.closest('[data-square]');
      if (sqEl && !this._isDragging) {
        const sq = sqEl.dataset.square;
        this._trigger('onMouseoutSquare', sq, this._currentPosition[sq] || false, { ...this._currentPosition }, this._orientation);
      }
    });
  }

  _onMouseDown(e) {
    if (!this.config.draggable || this._isDestroyed) return;

    const pieceEl = e.target.closest('.cb-piece');
    if (!pieceEl) return;

    const sqEl = pieceEl.closest('[data-square]');
    if (!sqEl) return;

    e.preventDefault();

    this._potentialDrag = {
      square: sqEl.dataset.square,
      piece: pieceEl.dataset.piece,
      startX: e.clientX,
      startY: e.clientY,
    };

    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
  }

  _onMouseMove(e) {
    if (this._potentialDrag) {
      const dx = e.clientX - this._potentialDrag.startX;
      const dy = e.clientY - this._potentialDrag.startY;
      if (dx * dx + dy * dy > 25) {
        this._startDrag(this._potentialDrag.square, this._potentialDrag.piece, e);
        this._potentialDrag = null;
        if (this._dragFloatEl) {
          this._isDragging = true;
        }
      }
    }

    if (this._isDragging) {
      this._updateDrag(e);
    }
  }

  _onMouseUp(e) {
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);

    if (this._isDragging) {
      this._endDrag(e);
      this._isDragging = false;
    }

    this._potentialDrag = null;
  }

  _startDrag(square, piece, e) {
    if (this._trigger('onDragStart', square, piece, { ...this._currentPosition }, this._orientation) === false) {
      this._dragFloatEl = null;
      this._dragSource = null;
      this._dragPiece = null;
      this._setPieceVisibility(square, true);
      return;
    }

    const pieceUrl = this._getPieceUrl(piece);

    this._dragFloatEl = document.createElement('img');
    this._dragFloatEl.src = pieceUrl;
    this._dragFloatEl.className = 'cb-piece cb-piece-dragging';
    this._dragFloatEl.style.cssText = `
      position: fixed;
      width: ${this._squareSize}px;
      height: ${this._squareSize}px;
      pointer-events: none;
      z-index: 1000;
      left: ${e.clientX - this._squareSize / 2}px;
      top: ${e.clientY - this._squareSize / 2}px;
    `;
    document.body.appendChild(this._dragFloatEl);

    this._dragSource = square;
    this._dragPiece = piece;
    this._lastHoverSquare = null;

    this._clearHighlights();
    this._setPieceVisibility(square, false);
  }

  _updateDrag(e) {
    if (this._dragFloatEl) {
      this._dragFloatEl.style.left = (e.clientX - this._squareSize / 2) + 'px';
      this._dragFloatEl.style.top = (e.clientY - this._squareSize / 2) + 'px';
    }

    const hover = this._getSquareFromPoint(e.clientX, e.clientY);
    if (hover !== this._lastHoverSquare) {
      this._lastHoverSquare = hover;
      this._trigger('onDragMove', hover, this._dragSource, this._dragPiece, { ...this._currentPosition }, this._orientation);
    }
  }

  async _endDrag(e) {
    if (this._dragFloatEl) {
      this._dragFloatEl.remove();
      this._dragFloatEl = null;
    }

    const target = this._getSquareFromPoint(e.clientX, e.clientY);

    if (!target || target === this._dragSource) {
      this._snapback(this._dragSource);
      return;
    }

    const source = this._dragSource;
    const piece = this._dragPiece;

    this._dragSource = null;
    this._dragPiece = null;

    const r = await Promise.resolve(
      this._trigger('onDrop', source, target, piece, { ...this._currentPosition }, this._orientation)
    );

    if (r === 'snapback') {
      this._snapback(source);
    } else if (r === 'trash') {
      const newPos = { ...this._currentPosition };
      delete newPos[source];
      this._currentPosition = newPos;
      this._renderPieces();
      this._trigger('onChange', { ...this._currentPosition }, { ...this._currentPosition });
    }
  }

  _snapback(square) {
    this._setPieceVisibility(square, true);
    this._trigger('onSnapbackEnd', this._dragPiece || this._currentPosition[square], square, { ...this._currentPosition }, this._orientation);
  }

  _onSquareClick(e) {
    if (this._isDestroyed) return;
    if (this._isDragging) return;

    const sqEl = e.target.closest('[data-square]');
    if (!sqEl) return;

    const square = sqEl.dataset.square;
    this._handleSquareClick(square);
  }

  async _handleSquareClick(square) {
    const piece = this._currentPosition[square] || false;

    if (this._selectedSquare === null) {
      if (piece) {
        this._selectedSquare = square;
        this._clearHighlights();
        this._addHighlight(square, 'cb-highlight-selected');
        this._trigger('onSelectPiece', square, piece, { ...this._currentPosition }, this._orientation);
      }
    } else {
      if (square === this._selectedSquare) {
        this._deselect();
        return;
      }

      const source = this._selectedSquare;
      const sourcePiece = this._currentPosition[source];

      if (piece && sourcePiece && piece[0] === sourcePiece[0]) {
        this._selectedSquare = square;
        this._clearHighlights();
        this._addHighlight(square, 'cb-highlight-selected');
        this._trigger('onSelectPiece', square, piece, { ...this._currentPosition }, this._orientation);
        return;
      }

      this._deselect();

      if (sourcePiece) {
        const r = await Promise.resolve(
          this._trigger('onDrop', source, square, sourcePiece, { ...this._currentPosition }, this._orientation)
        );

        if (r === 'snapback') {
          this._snapback(source);
        } else if (r === 'trash') {
          const newPos = { ...this._currentPosition };
          delete newPos[source];
          this._currentPosition = newPos;
          this._renderPieces();
          this._trigger('onChange', { ...this._currentPosition }, { ...this._currentPosition });
        }
      }
    }
  }

  _deselect() {
    this._selectedSquare = null;
    this._clearHighlights();
  }

  _renderPieces() {
    this._board.querySelectorAll('.cb-piece').forEach(el => el.remove());

    for (const [square, piece] of Object.entries(this._currentPosition)) {
      const sqEl = this._getSquareElement(square);
      if (sqEl) {
        const img = document.createElement('img');
        img.src = this._getPieceUrl(piece);
        img.className = 'cb-piece';
        img.dataset.piece = piece;
        img.draggable = false;
        sqEl.appendChild(img);
      }
    }
  }

  _clearHighlights() {
    if (!this._board) return;
    this._board.querySelectorAll('.cb-highlight-selected, .cb-highlight-legal, .cb-highlight-legal-capture, .cb-highlight-last-move').forEach(el => {
      el.classList.remove('cb-highlight-selected', 'cb-highlight-legal', 'cb-highlight-legal-capture', 'cb-highlight-last-move');
    });
    this.highlightedSquares = [];
  }

  _addHighlight(square, className) {
    const el = this._getSquareElement(square);
    if (el) {
      el.classList.add(className);
    }
  }

  position(newPos) {
    if (newPos === undefined) {
      return { ...this._currentPosition };
    }

    const oldPos = { ...this._currentPosition };

    if (newPos === 'start') {
      this._currentPosition = { ...Chessboard.START_POSITION };
    } else if (typeof newPos === 'string') {
      const parsed = Chessboard.fenToObj(newPos);
      if (parsed) {
        this._currentPosition = parsed;
      }
    } else if (typeof newPos === 'object' && newPos !== null) {
      this._currentPosition = { ...newPos };
    }

    this._clearHighlights();
    this._selectedSquare = null;
    if (this._dragFloatEl) {
      this._dragFloatEl.remove();
      this._dragFloatEl = null;
    }
    this._isDragging = false;

    this._renderPieces();
    this._trigger('onChange', oldPos, { ...this._currentPosition });
    return this;
  }

  fen() {
    return Chessboard.objToFen(this._currentPosition);
  }

  orientation(dir) {
    if (dir === undefined) {
      return this._orientation;
    }

    if (dir === 'white' || dir === 'black') {
      if (dir !== this._orientation) {
        this._orientation = dir;
        this._render();
        this._trigger('onOrientationChange', this._orientation);
      }
    } else if (dir === 'flip') {
      this._orientation = this._orientation === 'white' ? 'black' : 'white';
      this._render();
      this._trigger('onOrientationChange', this._orientation);
    }

    return this._orientation;
  }

  flip() {
    return this.orientation('flip');
  }

  clear(animate = false) {
    if (animate) {
      this._board.querySelectorAll('.cb-piece').forEach(el => {
        el.style.transition = 'opacity 0.2s';
        el.style.opacity = '0';
        setTimeout(() => {
          this._currentPosition = {};
          this._renderPieces();
          this._trigger('onChange', {}, {});
        }, 200);
      });
    } else {
      this._currentPosition = {};
      this._renderPieces();
      this._trigger('onChange', {}, {});
    }
    return this;
  }

  start(animate = false) {
    this.position('start');
    return this;
  }

  destroy() {
    this._isDestroyed = true;

    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);

    if (this._dragFloatEl) {
      this._dragFloatEl.remove();
      this._dragFloatEl = null;
    }

    this._hidePromotionDialog();

    this._container.innerHTML = '';
    this._board = null;
  }

  resize() {
    this._calculateSquareSize();
    this._render();
  }

  move(from, to) {
    const piece = this._currentPosition[from];
    if (!piece) return this;

    const oldPos = { ...this._currentPosition };

    this._trigger('onMoveStart', from, to, piece);

    const fromEl = this._getSquareElement(from);
    const toEl = this._getSquareElement(to);
    const pieceEl = this._getPieceElement(from);

    if (!fromEl || !toEl || !pieceEl) {
      const newPos = { ...this._currentPosition };
      delete newPos[from];
      newPos[to] = piece;
      this._currentPosition = newPos;
      this._renderPieces();
      this._trigger('onMoveEnd', oldPos, { ...this._currentPosition });
      this._trigger('onChange', oldPos, { ...this._currentPosition });
      return this;
    }

    const boardRect = this._board.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const clone = pieceEl.cloneNode(true);
    clone.style.cssText = `
      position: absolute;
      left: ${fromRect.left - boardRect.left}px;
      top: ${fromRect.top - boardRect.top}px;
      width: ${this._squareSize}px;
      height: ${this._squareSize}px;
      z-index: 100;
      pointer-events: none;
      transition: left 0.2s ease, top 0.2s ease;
    `;
    this._board.appendChild(clone);
    pieceEl.style.display = 'none';

    requestAnimationFrame(() => {
      clone.style.left = (toRect.left - boardRect.left) + 'px';
      clone.style.top = (toRect.top - boardRect.top) + 'px';
    });

    clone.addEventListener('transitionend', () => {
      clone.remove();
      const newPos = { ...this._currentPosition };
      delete newPos[from];
      newPos[to] = piece;
      this._currentPosition = newPos;
      this._renderPieces();
      this._trigger('onMoveEnd', oldPos, { ...this._currentPosition });
      this._trigger('onChange', oldPos, { ...this._currentPosition });
      this._trigger('onSnapEnd', from, to, piece);
    }, { once: true });

    return this;
  }

  highlight(squares, className) {
    if (!Array.isArray(squares)) squares = [squares];
    for (const sq of squares) {
      if (Chessboard.isValidSquare(sq)) {
        this._addHighlight(sq, className);
        this.highlightedSquares.push({ square: sq, className });
      }
    }
    return this;
  }

  highlightLegal(squares) {
    for (const sq of squares) {
      if (Chessboard.isValidSquare(sq)) {
        const hasPiece = !!this._currentPosition[sq];
        const className = hasPiece ? 'cb-highlight-legal-capture' : 'cb-highlight-legal';
        this._addHighlight(sq, className);
        this.highlightedSquares.push({ square: sq, className });
      }
    }
    return this;
  }

  highlightLastMove(from, to) {
    this._addHighlight(from, 'cb-highlight-last-move');
    this._addHighlight(to, 'cb-highlight-last-move');
    this.highlightedSquares.push(
      { square: from, className: 'cb-highlight-last-move' },
      { square: to, className: 'cb-highlight-last-move' }
    );
    return this;
  }

  clearHighlights() {
    this._clearHighlights();
    return this;
  }

  selectSquare(square) {
    if (!Chessboard.isValidSquare(square)) return this;
    this._selectedSquare = square;
    this._clearHighlights();
    this._addHighlight(square, 'cb-highlight-selected');
    const piece = this._currentPosition[square];
    this._trigger('onSelectPiece', square, piece || false, { ...this._currentPosition }, this._orientation);
    return this;
  }

  deselectSquare() {
    this._deselect();
    return this;
  }

  showPromotionDialog(color) {
    return new Promise((resolve) => {
      this._promotionResolve = resolve;
      this._renderPromotionDialog(color);
    });
  }

  hidePromotionDialog() {
    this._hidePromotionDialog();
  }

  _renderPromotionDialog(color) {
    this._hidePromotionDialog();

    const pieces = ['q', 'r', 'b', 'n'];

    const overlay = document.createElement('div');
    overlay.className = 'cb-promotion-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this._hidePromotionDialog();
        if (this._promotionResolve) {
          this._promotionResolve('q');
          this._promotionResolve = null;
        }
      }
    });

    const dialog = document.createElement('div');
    dialog.className = 'cb-promotion-dialog';

    for (const p of pieces) {
      const pieceCode = color + p.toUpperCase();
      const img = document.createElement('img');
      img.src = this._getPieceUrl(pieceCode);
      img.className = 'cb-promotion-piece';
      img.dataset.promotion = p;
      img.addEventListener('click', () => {
        this._hidePromotionDialog();
        if (this._promotionResolve) {
          this._promotionResolve(p);
          this._promotionResolve = null;
        }
      });
      dialog.appendChild(img);
    }

    overlay.appendChild(dialog);
    this._container.appendChild(overlay);
  }

  _hidePromotionDialog() {
    const overlay = this._container.querySelector('.cb-promotion-overlay');
    if (overlay) overlay.remove();
  }
}
