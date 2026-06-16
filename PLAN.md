# Chess Project — Phase-Wise Build Plan

NOTE: THE UI design (image) is placed under design/ folder.

## Current State

```
src/
  index.ts                    — Express server entry
  game-state.ts               — Chess.js wrapper (GameService)
  game-controller.ts          — playerMove orchestrator (stub)
  engine-process.ts           — UCI engine spawner (stub)
  routes/
    app.routes.ts             — App page routes (/, /game, /auth/login)
    api.routes.ts             — Business API routes (/api/move, /api/legal-moves, etc.)

public/
  css/chessboard.css          — Custom board CSS
  js/
    chessboard.js             — Custom Chessboard class (vanilla JS)
    board-controller.js       — Controller wiring Chessboard ↔ backend API

  img/chesspieces/wikipedia/  — Piece PNGs

views/
  index.ejs                   — Home page
  game.ejs                    — Game page
  auth/login.ejs              — Login placeholder

engine/                       — Stockfish binary location (not yet integrated)
```

---

## Phase 1 — Foundation: Database, Auth, Project Structure

**Goal**: Solid backend foundation with DB, user auth, and layered architecture.

### 1.1 Database Setup

- Use **Prisma ORM** with **SQLite** provider (zero-config, single file, no separate server).
- DB file stored at `prisma/dev.db`.
- Schema-driven migrations via `prisma migrate dev`.
- Prisma Client auto-generated from schema — fully typed queries.

**Files to create:**

| File                   | Purpose                       |
| ---------------------- | ----------------------------- |
| `prisma/schema.prisma` | Data model (User, Game, Move) |
| `src/lib/prisma.ts`    | Prisma client singleton       |

### 1.2 Prisma Schema

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           Int      @id @default(autoincrement())
  username     String   @unique
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  gamesAsWhite Game[]   @relation("WhitePlayer")
  gamesAsBlack Game[]   @relation("BlackPlayer")
}

model Game {
  id           Int      @id @default(autoincrement())
  whiteUserId  Int?
  blackUserId  Int?
  whiteUser    User?    @relation("WhitePlayer", fields: [whiteUserId], references: [id])
  blackUser    User?    @relation("BlackPlayer", fields: [blackUserId], references: [id])
  mode         String   @default("ai")          // 'ai' | 'pvp-local' | 'pvp-online'
  status       String   @default("active")      // 'active' | 'completed' | 'abandoned'
  result       String?                          // '1-0' | '0-1' | '1/2-1/2'
  fen          String   @default("start")
  pgn          String   @default("")
  timeControl  String?
  startedAt    DateTime @default(now())
  endedAt      DateTime?

  moves Move[]
}

model Move {
  id         Int      @id @default(autoincrement())
  gameId     Int
  game       Game     @relation(fields: [gameId], references: [onDelete: Cascade])
  moveNumber Int
  fromSq     String
  toSq       String
  promotion  String?
  san        String
  fen        String
  clockWhite Float?
  clockBlack Float?
  createdAt  DateTime @default(now())
}
```

### 1.3 Layered Architecture

```
src/
  lib/
    prisma.ts         — Prisma client singleton
    session.ts        — Session store adapter (Prisma-based or connect-sqlite3)
  services/           — Business logic
    auth.service.ts
    game.service.ts    ← wraps Chess.js + Prisma persistence
    engine.service.ts  ← UCI engine lifecycle
  controllers/        — Route handlers (thin)
    auth.controller.ts
    game.controller.ts
  routes/             — Express routers
    app.routes.ts     ← page routes (/, /game, etc.)
    auth.routes.ts    ← /auth/login, /auth/register, /auth/logout
    api.routes.ts     ← /api/move, /api/legal-moves, etc.
  middleware/         — Express middleware
    auth.middleware.ts
  index.ts            — Server entry
```

No separate `repositories/` layer — Prisma Client eliminates the need for handwritten SQL repositories. Services call `prisma.user.create(...)` / `prisma.game.findMany(...)` directly with full type safety. Business logic stays in services; controllers remain thin.

### 1.4 Auth

- **Register**: `POST /auth/register` → bcrypt hash, `prisma.user.create`, set session
- **Login**: `POST /auth/login` → verify password, set session
- **Session**: `express-session` using `connect-sqlite3` (lightweight, no extra deps) or a custom `PrismaSessionStore`
- **Middleware**: `requireAuth` that redirects to `/auth/login` if no session
- **Session table** handled by `connect-sqlite3` automatically (separate table, not in Prisma schema)

### 1.5 Dependencies to Add

- `prisma` (dev)
- `@prisma/client`
- `bcryptjs`, `@types/bcryptjs`
- `express-session`, `@types/express-session`
- `connect-sqlite3`

### 1.6 Build UI

- Frontend UI to incorporate all the features built above(login, register and authorizations part)
- Add links to various other pages in navbar
- Modern, aesthetic, light-themed and minimal Page Design

---

## Phase 2 — UCI Engine Integration

**Goal**: Spawn, talk to, and manage the Stockfish engine process.

### 2.1 Engine Service

Move/rewrite `src/engine-process.ts` → `src/services/engine.service.ts`:

```typescript
class EngineService {
  private process: ChildProcess;
  private buffer: string;
  private pendingResolve: ((line: string) => void) | null;

  constructor(enginePath: string);
  async init(): Promise<void>; // uci, uciok, isready, readyok
  async setPosition(fen: string, moves: string[]): Promise<void>;
  async go(depth: number): Promise<string>; // bestmove
  async goTime(ms: number): Promise<string>; // timed search
  async stop(): Promise<void>;
  async eval(): Promise<number>; // optional
  async quit(): Promise<void>;
  onMessage(cb: (line: string) => void): void; // raw output for analysis
}
```

Key: Commands are serialized via a queue. Each `send()` writes to stdin, stdout lines are collected in a buffer, the `uciok`/`readyok`/`bestmove` marker triggers the resolve.

### 2.2 Engine Pool (Optional for now)

For online play, each game may need its own engine instance (or share via a pool).

### 2.3 Path Configuration

- Store engine path in config (`src/config.ts`).
- `engine/stockfish` (or search PATH for `stockfish`).
- Make it configurable via env var.

### 2.4 Testing the Handshake

```
> uci
< uciok
> isready
< readyok
> position startpos moves e2e4
> go depth 10
< bestmove e7e5
> quit
```

---

## Phase 3 — Game Play Loop (vs AI)

**Goal**: Full AI game experience — start game, make moves, engine responds, game over detection.

### 3.1 Game Service (Backend State)

Rewrite `src/services/game.service.ts`:

```typescript
class GameService {
  private chess: Chess;
  private gameId: number | null;
  private mode: "ai" | "pvp-local" | "pvp-online";

  constructor();

  newGame(mode, userId?, color?): { gameId; fen };
  playerMove(
    from,
    to,
    promotion?,
  ): Promise<{ ok; fen; move; gameOver?; result? }>;
  getLegalMoves(square): Square[];
  getFen(): string;
  getHistory(): Move[];
  loadGame(gameId): void;
  resign(): void;
  drawOffer(): void;
  getStatus(): { fen; turn; gameOver; result; history };
}
```

### 3.2 AI Move Flow

```
playerMove(from, to) → chess.js validates + applies
  → save move to DB → if turn = AI:
    → engine.setPosition(fen + history)
    → engine.go(1000ms or fixed depth)
    → chess.js applies bestmove
    → save AI move to DB
    → check game over
    → return { fen, engineMove, gameOver }
```

### 3.3 Chessboard.js — Promotion Dialog

Already done in Phase 0. The `showPromotionDialog(color)` returns a Promise<`q`|`r`|`b`|`n`>. Controller awaits it inside `onDrop` before sending the API request.

### 3.4 Game Over Detection

Chess.js provides:

- `chess.isGameOver()`
- `chess.isCheckmate()`
- `chess.isDraw()`
- `chess.isStalemate()`
- `chess.isThreefoldRepetition()`
- `chess.isInsufficientMaterial()`

After every move, check these and set game status to `completed` with appropriate result (`1-0`, `0-1`, `1/2-1/2`).

### 3.5 Time Controls

- Store time control in game config (e.g. `600+5` = 10min + 5sec increment).
- Track remaining time per player in memory + DB.
- Engine receives `go wtime X btime Y winc Z binc Z` for timed search.
- Send `game-over` event via WebSocket when flag falls.

---

## Phase 4 — Frontend Game Experience

**Goal**: Rich interactive UI with game info panels, move history, time display.

### 4.1 Game Page Layout

```
+------------------------------------------+
|  Player Info  |  BOARD  |  Move History   |
|  (name, time) |  (480px) |  - e4 e5        |
|  [Resign]     |         |  - Nf3 Nc6       |
|  [Draw Offer] |         |  ...             |
+------------------------------------------+
|   Game Status / Messages                   |
+------------------------------------------+
```

### 4.2 Move History Panel

- Live-updating table of SAN moves.
- Click a move to navigate (board flips to that position).
- Highlight current move in bold.

### 4.3 Game Status Bar

- Whose turn it is.
- Check/checkmate/stalemate indicators.
- Material difference display.

### 4.4 New Game Dialog

- Choose mode: vs AI, vs Local Player.
- Choose color (vs AI): White, Black, Random.
- Choose time control from presets (5min, 10min, 15+10, etc.) or custom.

### 4.5 Resign / Draw

- Buttons below/next to the board.
- Resign: confirm dialog → send to server → game over.
- Draw offer: send offer → opponent accepts/declines (for PvP).

---

## Phase 5 — PvP (Local & Online)

### 5.1 Local PvP

- Same-device, two players share screen.
- Board orientation toggles automatically on move (or shows both perspectives via flip button).
- No engine involved.
- Move validation via chess.js on backend.

### 5.2 WebSocket Real-Time (Online PvP)

Socket.io rooms:

```
Client connects → io.connection
Client joins room: socket.join(`game:${gameId}`)
On player move: socket emits 'move' → server validates →
  broadcasts 'board-update' + 'move-history' to room
On disconnect: opponent notified, resign after timeout.
```

### 5.3 Matchmaking (Stretch)

- Simple lobby: list of open games, click to join.
- Auto-match: join queue → paired when another player queues.

---

## Phase 6 — Game History & Replay

### 6.1 Game History List

- `/history` page showing past games with filters (mode, result, date range).
- Each entry: opponent, result, date, link to replay.

### 6.2 Replay

- Board loads game from saved PGN/moves.
- Navigate move-by-move (prev/next buttons, click move in history panel).
- Show evaluation bar if engine analysis was saved.

### 6.3 Move Explorer (Stretch)

- Show opening name (via opening book).
- Popular continuations from DB.
- Engine eval at each position.

---

## Phase 7 — Polish & Production Readiness

### 7.1 Error Handling

- Backend: global error middleware, validation middleware.
- Frontend: connection loss detection, auto-reconnect for WebSocket.
- Engine: crash detection, auto-restart.

### 7.2 Loading & Empty States

- Loading spinner while engine thinks.
- Empty state for game history ("No games played yet").
- Disabled buttons during move processing (`isProcessingMove` flag).

### 7.3 Edge Cases

- Simultaneous move submissions (lock per game).
- Engine taking too long (timeout → abort game).
- Browser tab visibility — pause engine search when hidden.
- Express rate limiting on API routes.
- Session expiration redirect.

### 7.4 Responsive Design

- Board auto-resizes to viewport via `resize()` and `--square-size` CSS.
- Mobile-friendly layout (move history below board on small screens).

### 7.5 Testing

- Unit tests for `GameService` (chess.js logic).
- Unit tests for `EngineService` (mock engine output).
- Integration test for game loop.
- Frontend tests for Chessboard class (click, drag, promotion).

---

## Dependency Roadmap

```
Phase 1: prisma (dev), @prisma/client, bcryptjs, express-session, connect-sqlite3
Phase 2: (uses child_process — built-in)
Phase 3: nothing new
Phase 4: nothing new
Phase 5: socket.io (already installed)
Phase 6: nothing new
Phase 7: vitest (already installed)
```

---

## File Tree (End State)

```
chess/
├── engine/
│   └── stockfish
├── prisma/
│   ├── schema.prisma               ← NEW: data model
│   └── dev.db                      ← generated after first migrate
├── public/
│   ├── css/
│   │   └── chessboard.css
│   ├── img/
│   │   └── chesspieces/wikipedia/{piece}.png
│   └── js/
│       ├── chessboard.js
│       ├── board-controller.js
│       └── game-ui.js              ← NEW: UI helpers (history, status, dialogs)
├── src/
│   ├── config.ts                   ← NEW
│   ├── index.ts
│   ├── lib/
│   │   ├── prisma.ts               ← NEW: Prisma client singleton
│   │   └── session.ts              ← NEW: session store setup
│   ├── middleware/
│   │   └── auth.middleware.ts       ← NEW
│   ├── services/
│   │   ├── auth.service.ts          ← NEW
│   │   ├── game.service.ts          ← REWRITE (was game-controller.ts)
│   │   └── engine.service.ts        ← REWRITE (was engine-process.ts)
│   ├── controllers/
│   │   ├── auth.controller.ts       ← NEW
│   │   └── game.controller.ts       ← NEW
│   └── routes/
│       ├── app.routes.ts
│       ├── auth.routes.ts           ← NEW
│       └── api.routes.ts
├── views/
│   ├── index.ejs
│   ├── game.ejs
│   ├── auth/
│   │   ├── login.ejs
│   │   └── register.ejs            ← NEW
│   └── partials/                   ← NEW
│       ├── header.ejs
│       ├── board.ejs
│       └── move-history.ejs
├── .env                            ← NEW: DATABASE_URL
├── package.json
├── tsconfig.json
└── PLAN.md
```
