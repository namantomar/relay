// End-to-end smoke test for the Relay server.
// Connects two clients, joins the same room, sends a message from one,
// and asserts the other receives it. Also checks the REST health endpoint.
//
// Usage: node test/socket-test.mjs [server-url]
//   (server must already be running, e.g. `npm run server:dev`)
import { io } from "socket.io-client";

const SERVER_URL = process.argv[2] ?? "http://localhost:4000";
const ROOM = "general";
const TIMEOUT_MS = 8000;

function waitFor(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      TIMEOUT_MS,
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  // 1. REST health check
  const health = await fetch(`${SERVER_URL}/api/health`).then((r) => r.json());
  console.log("health:", JSON.stringify(health));
  if (!health.ok) throw new Error("Health check failed");

  const rooms = await fetch(`${SERVER_URL}/api/rooms`).then((r) => r.json());
  console.log(
    "rooms:",
    rooms.map((r) => r.name).join(", "),
  );
  if (!rooms.some((r) => r.name === ROOM)) {
    throw new Error(`Expected room "${ROOM}" to be seeded`);
  }

  // 2. Two clients join the same room
  const alice = io(SERVER_URL, { transports: ["websocket"] });
  const bob = io(SERVER_URL, { transports: ["websocket"] });

  alice.emit("join", { username: "alice", room: ROOM });
  bob.emit("join", { username: "bob", room: ROOM });

  const aliceJoined = await waitFor(alice, "joined");
  const bobHistory = await waitFor(bob, "history");
  console.log("alice joined:", JSON.stringify(aliceJoined));
  console.log(`bob received history: ${bobHistory.messages.length} messages`);

  // 3. Alice sends a message; Bob must receive it back in real time
  const messagePromise = waitFor(bob, "message");
  alice.emit("message", { text: "hello from alice" });
  const received = await messagePromise;
  console.log("bob received message:", JSON.stringify(received));
  if (received.text !== "hello from alice" || received.username !== "alice") {
    throw new Error("Message payload mismatch");
  }

  // 4. Typing indicator: Bob should see Alice typing
  const typingPromise = waitFor(bob, "typing");
  alice.emit("typing", { typing: true });
  const typing = await typingPromise;
  console.log("bob received typing:", JSON.stringify(typing));
  if (typing.username !== "alice" || typing.typing !== true) {
    throw new Error("Typing payload mismatch");
  }

  // 5. History persisted: a fresh client joining gets the message back
  const carol = io(SERVER_URL, { transports: ["websocket"] });
  carol.emit("join", { username: "carol", room: ROOM });
  const carolHistory = await waitFor(carol, "history");
  const persisted = carolHistory.messages.some(
    (m) => m.username === "alice" && m.text === "hello from alice",
  );
  console.log(
    `carol received history: ${carolHistory.messages.length} messages, persisted message found: ${persisted}`,
  );
  if (!persisted) throw new Error("Message was not persisted to SQLite");

  alice.disconnect();
  bob.disconnect();
  carol.disconnect();
  console.log("SOCKET TEST PASSED ✓");
}

main().catch((err) => {
  console.error("SOCKET TEST FAILED:", err.message);
  process.exit(1);
});
