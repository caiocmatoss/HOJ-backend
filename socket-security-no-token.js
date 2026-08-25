const { io } = require("socket.io-client");

const serverUrl = "http://localhost:3000";

console.log("");
console.log("============================================================");
console.log("   TESTE DE SEGURANÇA - SEM TOKEN");
console.log("============================================================");
console.log("");
console.log("Servidor:", serverUrl);
console.log("Token: NÃO ENVIADO");

const socket = io(serverUrl, {
  transports: ["websocket", "polling"],
  reconnection: false,
});

let finished = false;

socket.on("connect", () => {
  console.log("");
  console.log("============================================================");
  console.log("❌ FALHA DE SEGURANÇA");
  console.log("============================================================");

  console.log(
    "O Socket.IO aceitou uma conexão sem token.",
  );

  console.log("Socket ID:", socket.id);

  finish(1);
});

socket.on("connect_error", (error) => {
  console.log("");
  console.log("============================================================");
  console.log("✅ CONEXÃO SEM TOKEN BLOQUEADA");
  console.log("============================================================");

  console.log("Mensagem recebida:", error.message);

  console.log("");
  console.log(
    "O servidor recusou corretamente a conexão sem autenticação.",
  );

  finish(0);
});

socket.on("disconnect", (reason) => {
  console.log("");
  console.log("Socket desconectado.");
  console.log("Motivo:", reason);
});

function finish(code) {
  if (finished) {
    return;
  }

  finished = true;

  socket.disconnect();

  setTimeout(() => {
    process.exit(code);
  }, 300);
}

setTimeout(() => {
  if (!finished) {
    console.log("");
    console.log("============================================================");
    console.log("❌ TIMEOUT");
    console.log("============================================================");

    console.log(
      "O servidor não respondeu ao teste.",
    );

    finish(1);
  }
}, 10000);