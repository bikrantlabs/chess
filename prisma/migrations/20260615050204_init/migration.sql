-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "whiteUserId" INTEGER,
    "blackUserId" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'ai',
    "status" TEXT NOT NULL DEFAULT 'active',
    "result" TEXT,
    "fen" TEXT NOT NULL DEFAULT 'start',
    "pgn" TEXT NOT NULL DEFAULT '',
    "timeControl" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Game_whiteUserId_fkey" FOREIGN KEY ("whiteUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Game_blackUserId_fkey" FOREIGN KEY ("blackUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Move" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "moveNumber" INTEGER NOT NULL,
    "fromSq" TEXT NOT NULL,
    "toSq" TEXT NOT NULL,
    "promotion" TEXT,
    "san" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "clockWhite" REAL,
    "clockBlack" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Move_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
