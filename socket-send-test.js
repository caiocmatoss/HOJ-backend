const { io } = require("socket.io-client");
const readline = require("readline");

const token = process.argv[2];
const groupId = process.argv[3];

if (!token || !groupId) {
  console.error("");
  console.error("Uso:");
  console.error(
    "node socket-send-test.js <TOKEN> <GROUP_ID>",
  );
  console.error("");

  process.exit(1);
}

console.log("");
console.log("=================================");
console.log(" CHAT SOCKET.IO - HOJE E OND");
console.log("=================================");
console.log("");

console.log("Grupo:", groupId);
console.log("Conectando ao servidor...");
console.log("");

const socket = io("http://localhost:3000", {
  auth: {
    token,
  },
});

const readlineInterface =
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

let joined = false;

socket.on("connect", () => {
  console.log("✅ Socket conectado");
  console.log("Socket ID:", socket.id);
  console.log("");

  console.log("Entrando no grupo...");

  socket.emit("chat:join", {
    groupId,
  });
});

socket.on("chat:joined", (data) => {
  console.log("");
  console.log("✅ Entrou no grupo");
  console.log(JSON.stringify(data, null, 2));
  console.log("");

  joined = true;

  console.log(
    "Digite uma mensagem e pressione ENTER.",
  );
  console.log(
    "Digite /sair para desconectar.",
  );
  console.log("");

  askMessage();
});

socket.on("message:sent", (data) => {
  console.log("");
  console.log("✅ message:sent");
  console.log(JSON.stringify(data, null, 2));
  console.log("");

  askMessage();
});

socket.on("message:new", (message) => {
  console.log("");
  console.log("📨 message:new");
  console.log(JSON.stringify(message, null, 2));
  console.log("");
});

socket.on("connect_error", (error) => {
  console.error("");
  console.error("❌ ERRO DE CONEXÃO");
  console.error(error.message);
  console.error("");
});

socket.on("disconnect", (reason) => {
  console.log("");
  console.log("❌ Socket desconectado");
  console.log("Motivo:", reason);
  console.log("");
});

function askMessage() {
  if (!joined) {
    return;
  }

  readlineInterface.question(
    "Mensagem > ",
    (text) => {
      const message = text.trim();

      if (!message) {
        askMessage();
        return;
      }

      if (message === "/sair") {
        socket.emit("chat:leave", {
          groupId,
        });

        setTimeout(() => {
          socket.disconnect();
          readlineInterface.close();
          process.exit(0);
        }, 300);

        return;
      }

      console.log("");
      console.log("📤 Enviando message:send...");
      console.log("");

      socket.emit("message:send", {
        groupId,
        text: message,
      });
    },
  );
}