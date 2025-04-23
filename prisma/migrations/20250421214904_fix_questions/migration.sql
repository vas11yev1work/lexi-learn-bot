-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_questions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "cardId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "correct" BOOLEAN,
    "difficulty" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "questions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_questions" ("answered", "cardId", "correct", "createdAt", "difficulty", "id", "sessionId", "type") SELECT "answered", "cardId", "correct", "createdAt", "difficulty", "id", "sessionId", "type" FROM "questions";
DROP TABLE "questions";
ALTER TABLE "new_questions" RENAME TO "questions";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
