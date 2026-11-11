import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { getHistory, getRooms, roomExists, saveMessage } from "./db.js";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(express.json());

// --- REST endpoints -------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "relay", rooms: getRooms().length });
});

app.get("/api/rooms", (_req, res) => {
  res.json(getRooms());
});

app.get("/api/rooms/:name/messages", (req, res) => {
  const { name } = req.params;
  if (!roomExists(name)) {
    res.status(404).json({ error: `Unknown room: ${name}` });
    return;
  }
  res.json(getHistory(name));
});

// --- Socket.IO ------------------------------------------------------------
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

interface JoinPayload {
  username: string;
  room: string;
}

interface MessagePayload {
  text: string;
}

// Track who is in each room: room -> Map<socketId, username>
const roomUsers = new Map<string, Map<string, string>>();

function usersInRoom(room: string): string[] {
  return [...(roomUsers.get(room)?.values() ?? [])].sort();
}

function broadcastUsers(room: string): void {
  io.to(room).emit("users", { room, users: usersInRoom(room) });
}

io.on("connection", (socket) => {
  let currentRoom: string | null = null;
  let username: string | null = null;

  socket.on("join", ({ username: name, room }: JoinPayload) => {
    const cleanName = name.trim().slice(0, 30);
    if (!cleanName || !roomExists(room)) {
      socket.emit("join-error", { message: "Invalid username or room." });
      return;
    }
    if (currentRoom) {
      socket.leave(currentRoom);
      roomUsers.get(currentRoom)?.delete(socket.id);
      broadcastUsers(currentRoom);
    }
    currentRoom = room;
    username = cleanName;
    socket.join(room);
    if (!roomUsers.has(room)) roomUsers.set(room, new Map());
    roomUsers.get(room)!.set(socket.id, cleanName);

    socket.emit("joined", { room, username: cleanName });
    socket.emit("history", { room, messages: getHistory(room) });
    broadcastUsers(room);
    socket.to(room).emit("user-joined", { room, username: cleanName });
  });

  socket.on("message", ({ text }: MessagePayload) => {
    if (!currentRoom || !username) return;
    const cleanText = text.trim().slice(0, 1000);
    if (!cleanText) return;
    const saved = saveMessage(currentRoom, username, cleanText);
    io.to(currentRoom).emit("message", saved);
  });

  socket.on("typing", ({ typing }: { typing: boolean }) => {
    if (!currentRoom || !username) return;
    socket.to(currentRoom).emit("typing", {
      room: currentRoom,
      username,
      typing,
    });
  });

  socket.on("disconnect", () => {
    if (currentRoom && username) {
      roomUsers.get(currentRoom)?.delete(socket.id);
      broadcastUsers(currentRoom);
      socket
        .to(currentRoom)
        .emit("user-left", { room: currentRoom, username });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Relay server listening on http://localhost:${PORT}`);
  console.log(`Rooms: ${getRooms().map((r) => r.name).join(", ")}`);
});
