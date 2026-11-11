import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? "http://localhost:4000";

interface Room {
  name: string;
  description: string;
}

interface ChatMessage {
  id: number;
  room: string;
  username: string;
  text: string;
  createdAt: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [room, setRoom] = useState("general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // Load the room list once.
  useEffect(() => {
    fetch(`${SERVER_URL}/api/rooms`)
      .then((res) => res.json())
      .then(setRooms)
      .catch(() => setError("Could not reach the Relay server."));
  }, []);

  // Connect the socket once a username is chosen.
  useEffect(() => {
    if (!username) return;
    const s = io(SERVER_URL, { transports: ["websocket", "polling"] });
    setSocket(s);

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("joined", ({ room: joinedRoom }: { room: string }) => {
      setRoom(joinedRoom);
      setMessages([]);
      setTypingUsers([]);
    });
    s.on("history", ({ messages: history }: { messages: ChatMessage[] }) => {
      setMessages(history);
    });
    s.on("message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });
    s.on("users", ({ users: roomUsers }: { users: string[] }) => {
      setUsers(roomUsers);
    });
    s.on(
      "typing",
      ({ username: typer, typing }: { username: string; typing: boolean }) => {
        setTypingUsers((prev) =>
          typing
            ? [...new Set([...prev, typer])]
            : prev.filter((u) => u !== typer),
        );
      },
    );
    s.on("join-error", ({ message }: { message: string }) =>
      setError(message),
    );

    s.emit("join", { username, room: "general" });

    return () => {
      s.disconnect();
    };
    // Only re-run when the username is set; room switches use switchRoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const switchRoom = useCallback(
    (nextRoom: string) => {
      if (!socket || nextRoom === room) return;
      setMessages([]);
      setTypingUsers([]);
      socket.emit("join", { username, room: nextRoom });
    },
    [socket, room, username],
  );

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !socket) return;
    socket.emit("message", { text });
    socket.emit("typing", { typing: false });
    setInput("");
  }, [input, socket]);

  const handleTyping = useCallback(
    (value: string) => {
      setInput(value);
      if (!socket) return;
      socket.emit("typing", { typing: true });
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = window.setTimeout(() => {
        socket.emit("typing", { typing: false });
      }, 1500);
    },
    [socket],
  );

  // --- Username prompt ----------------------------------------------------
  if (!username) {
    return (
      <div className="login">
        <div className="login-card">
          <h1>⚡ Relay</h1>
          <p>Real-time chat, in your browser. Pick a username to join.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = usernameInput.trim();
              if (name) setUsername(name.slice(0, 30));
            }}
          >
            <input
              autoFocus
              placeholder="Your username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              maxLength={30}
            />
            <button type="submit" disabled={!usernameInput.trim()}>
              Join chat
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  // --- Chat ----------------------------------------------------------------
  const typingText =
    typingUsers.length > 0
      ? `${typingUsers.join(", ")} ${typingUsers.length === 1 ? "is" : "are"} typing…`
      : "";

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>⚡ Relay</h1>
        <p className="me">
          Signed in as <strong>{username}</strong>{" "}
          <span className={connected ? "dot online" : "dot offline"} />
        </p>
        <h2>Rooms</h2>
        <ul>
          {rooms.map((r) => (
            <li key={r.name}>
              <button
                className={r.name === room ? "active" : ""}
                onClick={() => switchRoom(r.name)}
              >
                # {r.name}
                <span>{r.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <h2>Online in #{room} ({users.length})</h2>
        <ul className="users">
          {users.map((u) => (
            <li key={u}>
              <span className="dot online" /> {u}
              {u === username ? " (you)" : ""}
            </li>
          ))}
        </ul>
      </aside>

      <main className="chat">
        <header>
          <h2># {room}</h2>
          <span className="status">
            {connected ? "Connected" : "Reconnecting…"}
          </span>
        </header>

        <div className="messages">
          {messages.length === 0 && (
            <p className="empty">No messages yet — say hello! 👋</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`message ${m.username === username ? "own" : ""}`}
            >
              <div className="meta">
                <strong>{m.username}</strong>
                <span>{formatTime(m.createdAt)}</span>
              </div>
              <div className="text">{m.text}</div>
            </div>
          ))}
          {typingText && <p className="typing">{typingText}</p>}
          <div ref={messagesEndRef} />
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <input
            autoFocus
            placeholder={`Message #${room}`}
            value={input}
            onChange={(e) => handleTyping(e.target.value)}
            maxLength={1000}
          />
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}
