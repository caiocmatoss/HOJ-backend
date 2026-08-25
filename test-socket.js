const { io } = require("socket.io-client");

const TOKEN = process.argv[2];
const GROUP_ID = process.argv[3];
const MODE = process.argv[4] || "listen";

if (!TOKEN) {
  console.error("Token não informado.");
  console.error(
    'Uso: node test-socket.js "TOKEN" "GROUP_ID" [send|listen]',
  );
  process.exit(1);
}

if (!GROUP_ID) {
  console.error("Group ID não informado.");
  process.exit(1);
}

console.log("");
console.log("================================");
console.log("CLIENTE SOCKET.IO");
console.log("================================");
console.log("Modo:", MODE);
console.log("Grupo:", GROUP_ID);

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
  console.log("Entrando no grupo:", GROUP_ID);

  socket.emit("chat:join", {
    groupId: GROUP_ID,
  });
});

socket.on("chat:joined", (data) => {
  console.log("");
  console.log("CHAT:JOINED");
  console.dir(data, { depth: null });

  if (MODE === "send") {
    console.log("");
    console.log("Enviando mensagem do CAIO...");

    socket.emit("message:send", {
      groupId: GROUP_ID,
      text: "Mensagem REAL do Caio para o Amigo via Socket.IO!",
    });
  } else {
    console.log("");
    console.log("Modo LISTEN ativo.");
    console.log("Aguardando mensagens...");
  }
});

socket.on("message:new", (data) => {
  console.log("");
  console.log("================================");
  console.log("MESSAGE:NEW RECEBIDA");
  console.log("================================");
  console.dir(data, { depth: null });
});

socket.on("message:sent", (data) => {
  console.log("");
  console.log("================================");
  console.log("MESSAGE:SENT");
  console.log("================================");
  console.dir(data, { depth: null });
});

socket.on("chat:error", (data) => {
  console.log("");
  console.log("================================");
  console.log("CHAT:ERROR");
  console.log("================================");
  console.dir(data, { depth: null });
});

socket.on("presence:changed", (data) => {
  console.log("");
  console.log("PRESENCE:CHANGED");
  console.dir(data, { depth: null });
});

socket.on("disconnect", (reason) => {
  console.log("");
  console.log("SOCKET DESCONECTADO");
  console.log("Motivo:", reason);
});

socket.on("connect_error", (error) => {
  console.error("");
  console.error("================================");
  console.error("ERRO AO CONECTAR SOCKET");
  console.error("================================");
  console.error(error.message);
});