import { io } from "socket.io-client";
import { SOCKET_URL } from "./apiConfig"; 

console.log("🔌 Initializing Socket at:", SOCKET_URL);

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 2000,
  timeout: 20000,
  forceNew: true,
  secure: true, // ✅ Set to true for HTTPS (ngrok) connections
});

export const connectSocket = () => {
  if (!socket.connected) {
    console.log("🔌 Connecting socket...");
    socket.connect();
  }
  return socket;
};

export default socket;





// import { io } from "socket.io-client";
// import { SOCKET_URL } from "./apiConfig"; // Import from apiConfig

// console.log("🔌 Initializing Socket at:", SOCKET_URL);

// const socket = io(SOCKET_URL, {
//   transports: ["websocket"],
//   autoConnect: false,
//   reconnection: true,
//   reconnectionAttempts: 20,
//   reconnectionDelay: 2000,
//   timeout: 20000,
//   forceNew: true,
// });

// export const connectSocket = () => {
//   if (!socket.connected) {
//     console.log("🔌 Connecting socket...");
//     socket.connect();
//   }
//   return socket;
// };

// export default socket;
