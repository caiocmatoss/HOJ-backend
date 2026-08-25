const { io } = require("socket.io-client");

const serverUrl = "http://localhost:3000";
const groupId = process.env.TEST_GROUP_ID;
const token = process.env.TEST_TOKEN_A;

if (!groupId) {
  console.error("TEST_GROUP_ID não definido.");
  process.exit(1);
}

if (!token) {
  console.error("TEST_TOKEN_A não definido.");
  process.exit(1);
}

const socket = io(serverUrl, {
  auth: {
    token,
  },
  transports: ["websocket", "polling"],
  reconnection: false,
});

let joined = false;
let messageReceived = false;
let finished = false;

console.log("");
console.log("============================================================");
console.log("   CLIENTE A - TESTE B -> A");
console.log("============================================================");
console.log("");
console.log("Servidor:", serverUrl);
console.log("Grupo:", groupId);
console.log("Token: DEFINIDO");

socket.on("connect", () => {
  console.log("");
  console.log("============================================================");
  console.log("A CONECTADO");
  console.log("============================================================");

  console.log("Socket ID:", socket.id);

  console.log("");
  console.log("A ENVIANDO CHAT:JOIN...");

  socket.emit("chat:join", {
    groupId,
  });

  console.log("");
  console.log("A entrou na sala e está aguardando B...");
});

socket.on("chat:joined", (response) => {
  console.log("");
  console.log("============================================================");
  console.log("A ENTROU NO GRUPO");
  console.log("============================================================");

  console.log(
    JSON.stringify(response, null, 2),
  );

  joined = true;

  console.log("");
  console.log("A está aguardando mensagem de B...");
});

socket.on("message:new", (message) => {
  console.log("");
  console.log("============================================================");
  console.log("🎉 A RECEBEU MESSAGE:NEW");
  console.log("============================================================");

  console.log(
    JSON.stringify(message, null, 2),
  );

  messageReceived = true;

  console.log("");
  console.log("============================================================");
  console.log("🎉 TESTE B -> A FUNCIONOU!");
  console.log("============================================================");

  console.log("Mensagem recebida:", message.text);
  console.log("Usuário:", message.user?.name);
  console.log("Grupo:", message.groupId);

  console.log("");
  console.log("A recebeu a mensagem de B em tempo real.");

  setTimeout(() => {
    finishTest();
  }, 2000);
});

socket.on("connect_error", (error) => {
  console.error("");
  console.error("============================================================");
  console.error("❌ ERRO DE CONEXÃO");
  console.error("============================================================");

  console.error("Mensagem:", error.message);

  finishTest(1);
});

socket.on("disconnect", (reason) => {
  console.log("");
  console.log("============================================================");
  console.log("A DESCONECTADO");
  console.log("============================================================");

  console.log("Motivo:", reason);
});

function finishTest(exitCode = 0) {
  if (finished) {
    return;
  }

  finished = true;

  console.log("");
  console.log("============================================================");
  console.log("   RESULTADO CLIENTE A");
  console.log("============================================================");

  console.log(
    "Socket conectado:",
    socket.connected,
  );

  console.log(
    "Entrou no grupo:",
    joined,
  );

  console.log(
    "Mensagem recebida:",
    messageReceived,
  );

  console.log("");

  if (joined && messageReceived) {
    console.log("============================================================");
    console.log("🎉 B -> A FUNCIONOU!");
    console.log("============================================================");
  } else {
    console.log("============================================================");
    console.log("❌ TESTE B -> A NÃO CONCLUÍDO");
    console.log("============================================================");
  }

  socket.disconnect();

  setTimeout(() => {
    process.exit(exitCode);
  }, 300);
}

setTimeout(() => {
  if (!finished) {
    console.log("");
    console.log("============================================================");
    console.log("⚠️ TIMEOUT");
    console.log("============================================================");

    console.log("Socket conectado:", socket.connected);
    console.log("Entrou no grupo:", joined);
    console.log("Mensagem recebida:", messageReceived);

    finishTest(1);
  }
}, 30000);