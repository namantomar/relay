# Relay ⚡

A real-time chat app. Pick a username, join a room, and chat instantly — messages are broadcast live to everyone in the room and saved to SQLite so history survives restarts.

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript + Socket.IO
- **Persistence:** SQLite via Node 24's built-in `node:sqlite` (no native modules)
- **Realtime transport:** Socket.IO (WebSocket with polling fallback)

## Features

- Multiple rooms — `general`, `random`, and `help` are seeded on first start
- Join a room with a username
- Send and receive messages in real time
- Typing indicator broadcast to the room
- Message history loaded from SQLite when joining a room
- Online user list per room
- REST endpoints for health, rooms, and message history

## How to run

```bash
# install dependencies (root, server, and client)
npm install
npm install --prefix server
npm install --prefix client

# run both server and client together
npm run dev
```

- Server: http://localhost:4000 (health check: `/api/health`)
- Client: http://localhost:5173

Or run them separately:

```bash
npm run server:dev   # Express + Socket.IO on :4000
npm run client:dev   # Vite dev server on :5173
```

Production build:

```bash
npm run build        # builds server (tsc) and client (Vite)
npm start --prefix server
```

## How the real-time flow works

1. The client connects to the server over Socket.IO and emits `join` with a username and room.
2. The server adds the socket to the room, replies with a `joined` event plus the room's message history (loaded from SQLite), and broadcasts the updated user list to the room.
3. When a client sends a message, it emits `message`. The server saves it to SQLite, then broadcasts it to everyone in the room — including the sender.
4. While typing, the client emits `typing: true` (and `false` after 1.5s idle); the server relays it to the other users in the room, who see "X is typing…".
5. On disconnect, the server removes the user from the room's user list and broadcasts the update.
6. The same data is also available over REST: `GET /api/rooms` and `GET /api/rooms/:name/messages`.

## Project structure

```
relay/
├── client/                 # React + TypeScript + Vite frontend
│   ├── src/
│   │   ├── App.tsx         # Username prompt, rooms, messages, typing indicator
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   └── vite.config.ts
├── server/                 # Express + Socket.IO backend
│   ├── src/
│   │   ├── index.ts        # REST endpoints + Socket.IO events
│   │   └── db.ts           # SQLite schema, seeding, queries
│   └── relay.db            # Created on first run (gitignored)
├── test/
│   └── socket-test.mjs     # End-to-end Socket.IO smoke test
├── package.json            # Root scripts (dev, build, test:socket)
├── README.md
├── .gitignore
└── LICENSE
```

## License

MIT — see [LICENSE](LICENSE).
