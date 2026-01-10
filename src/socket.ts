import { io } from "socket.io-client";
import { SOCKET_URL } from "./apiConfig";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 2000,
  timeout: 20000,
  forceNew: true,
  secure: true, // ✅ Set to true for HTTPS connections
});

// Monitor connection events in Development
if (__DEV__) {
  socket.on("connect", () => {
    console.log("✅ Socket Connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Socket Connection Error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("⚠️ Socket Disconnected:", reason);
  });
}

export const connectSocket = () => {
  if (!socket.connected) {
    console.log("🔌 Connecting socket...");
    socket.connect();
  }
  return socket;
};

export default socket;
