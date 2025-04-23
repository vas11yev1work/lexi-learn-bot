-- CreateTable
CREATE TABLE "custom_fields" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "moduleId" INTEGER NOT NULL,
    CONSTRAINT "custom_fields_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "value" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "customFieldId" INTEGER NOT NULL,
    CONSTRAINT "custom_field_values_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "custom_field_values_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "custom_fields" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phrase" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "hint" TEXT,
    "moduleId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cards_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
