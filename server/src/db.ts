import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Room {
  name: string;
  description: string;
}

export interface ChatMessage {
  id: number;
  room: string;
  username: string;
  text: string;
  createdAt: string;
}

const DEFAULT_ROOMS: Room[] = [
  { name: "general", description: "General discussion" },
  { name: "random", description: "Anything goes" },
  { name: "help", description: "Ask for help, get answers" },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
  process.env.RELAY_DB_PATH ?? path.join(__dirname, "..", "relay.db");

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL REFERENCES rooms(name),
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, id);
`);

const insertRoom = db.prepare(
  "INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)",
);
for (const room of DEFAULT_ROOMS) {
  insertRoom.run(room.name, room.description);
}

const selectRooms = db.prepare(
  "SELECT name, description FROM rooms ORDER BY name ASC",
);
const selectHistory = db.prepare(
  "SELECT id, room, username, text, created_at AS createdAt FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?",
);
const insertMessage = db.prepare(
  "INSERT INTO messages (room, username, text) VALUES (?, ?, ?) RETURNING id, room, username, text, created_at AS createdAt",
);

export function getRooms(): Room[] {
  return selectRooms.all() as unknown as Room[];
}

export function getHistory(room: string, limit = 100): ChatMessage[] {
  // Stored newest-first for the LIMIT, returned oldest-first for display.
  return (selectHistory.all(room, limit) as unknown as ChatMessage[]).reverse();
}

export function saveMessage(
  room: string,
  username: string,
  text: string,
): ChatMessage {
  return insertMessage.get(room, username, text) as unknown as ChatMessage;
}

export function roomExists(room: string): boolean {
  return getRooms().some((r) => r.name === room);
}
