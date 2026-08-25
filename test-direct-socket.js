const { io } = require("socket.io-client");

const TOKEN = process.argv[2];
const OTHER_USER_ID = process.argv[3];
const MODE = process.argv[4] || "listen";

if (!TOKEN) {
  console.error("Token não informado.");
  console.error(
    'Uso: node test-direct-socket.js "TOKEN" "OTHER_USER_ID" [send|listen]',
  );
  process.exit(1);
}

if (!OTHER_USER_ID) {
  console.error("ID do outro usuário não informado.");
  process.exit(1);
}

console.log("");
console.log("================================");
console.log("DIRECT MESSAGE SOCKET TEST");
console.log("================================");
console.log("Modo:", MODE);
console.log("Outro usuário:", OTHER_USER_ID);

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
  console.log("Entrando na conversa privada...");

  socket.emit("direct:join", {
    userId: OTHER_USER_ID,
  });
});

socket.on("direct:joined", (data) => {
  console.log("");
  console.log("DIRECT:JOINED");
  console.dir(data, { depth: null });

  if (MODE === "send") {
    console.log("");
    console.log("Enviando mensagem privada...");

    socket.emit("direct:send", {
      userId: OTHER_USER_ID,
      text: "Mensagem privada REAL via Socket.IO!",
    });
  } else {
    console.log("");
    console.log("Modo LISTEN ativo.");
    console.log("Aguardando mensagens privadas...");
  }
});

socket.on("direct:new", (data) => {
  console.log("");
  console.log("================================");
  console.log("DIRECT:NEW RECEBIDA");
  console.log("================================");
  console.dir(data, { depth: null });
});

socket.on("direct:sent", (data) => {
  console.log("");
  console.log("================================");
  console.log("DIRECT:SENT");
  console.log("================================");
  console.dir(data, { depth: null });
});

socket.on("direct:error", (data) => {
  console.log("");
  console.log("================================");
  console.log("DIRECT:ERROR");
  console.log("================================");
  console.dir(data, { depth: null });
});

socket.on("connect_error", (error) => {
  console.error("");
  console.error("================================");
  console.error("ERRO AO CONECTAR SOCKET");
  console.error("================================");
  console.error(error.message);
});

socket.on("disconnect", (reason) => {
  console.log("");
  console.log("SOCKET DESCONECTADO");
  console.log("Motivo:", reason);
});