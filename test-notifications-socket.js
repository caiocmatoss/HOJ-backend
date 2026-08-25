const { io } = require("socket.io-client");

const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error("Token não informado.");
  console.error(
    'Uso: node test-notifications-socket.js "TOKEN"',
  );
  process.exit(1);
}

console.log("");
console.log("================================");
console.log("NOTIFICATIONS SOCKET TEST");
console.log("================================");

const socket = io("http://localhost:3000", {
  transports: ["websocket"],
  auth: {
    token: TOKEN,
  },
});

socket.on("connect", () => {
  console.log("");
  console.log("================================");
  console.log("SOCKET CONECTADO");
  console.log("================================");
  console.log("Socket ID:", socket.id);

  console.log("");
  console.log("Entrando no canal de notificações...");

  socket.emit("notifications:join");
});

socket.on("notifications:joined", (data) => {
  console.log("");
  console.log("================================");
  console.log("NOTIFICATIONS:JOINED");
  console.log("================================");
  console.dir(data, { depth: null });

  console.log("");
  console.log("Aguardando notification:new...");
});

socket.on("notification:new", (data) => {
  console.log("");
  console.log("================================");
  console.log("🔔 NOTIFICATION:NEW RECEBIDA");
  console.log("================================");
  console.dir(data, { depth: null });
});

socket.on("notifications:left", (data) => {
  console.log("");
  console.log("NOTIFICATIONS:LEFT");
  console.dir(data, { depth: null });
});

socket.on("connect_error", (error) => {
  console.error("");
  console.error("================================");
  console.error("ERRO AO CONECTAR");
  console.error("================================");
  console.error(error.message);
});

socket.on("disconnect", (reason) => {
  console.log("");
  console.log("SOCKET DESCONECTADO");
  console.log("Motivo:", reason);
});