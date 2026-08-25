const { io } = require("socket.io-client");

const serverUrl = "http://localhost:3000";
const groupId = process.env.TEST_GROUP_ID;
const token = process.env.TEST_TOKEN_B;

if (!groupId) {
  console.error("TEST_GROUP_ID não definido.");
  process.exit(1);
}

if (!token) {
  console.error("TEST_TOKEN_B não definido.");
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
let sent = false;
let messageReceived = false;
let finished = false;

console.log("");
console.log("============================================================");
console.log("   CLIENTE B - TESTE B -> A");
console.log("============================================================");
console.log("");
console.log("Servidor:", serverUrl);
console.log("Grupo:", groupId);
console.log("Token: DEFINIDO");

socket.on("connect", () => {
  console.log("");
  console.log("============================================================");
  console.log("B CONECTADO");
  console.log("============================================================");

  console.log("Socket ID:", socket.id);

  console.log("");
  console.log("B ENVIANDO CHAT:JOIN...");

  socket.emit("chat:join", {
    groupId,
  });

  console.log("");
  console.log("CHAT:JOIN ENVIADO.");
});

socket.on("chat:joined", (response) => {
  console.log("");
  console.log("============================================================");
  console.log("B ENTROU NO GRUPO");
  console.log("============================================================");

  console.log(
    JSON.stringify(response, null, 2),
  );

  joined = true;

  console.log("");
  console.log("B enviará mensagem em 3 segundos...");

  setTimeout(() => {
    if (finished) {
      return;
    }

    console.log("");
    console.log("============================================================");
    console.log("B ENVIANDO MENSAGEM PARA A");
    console.log("============================================================");

    socket.emit("message:send", {
      groupId,
      text: "Mensagem enviada por B para A em tempo real.",
    });

    console.log("");
    console.log("MESSAGE:SEND ENVIADO.");
  }, 3000);
});

socket.on("message:sent", (response) => {
  console.log("");
  console.log("============================================================");
  console.log("B RECEBEU MESSAGE:SENT");
  console.log("============================================================");

  console.log(
    JSON.stringify(response, null, 2),
  );

  sent = true;

  console.log("");
  console.log("Mensagem de B salva no servidor.");
});

socket.on("message:new", (message) => {
  console.log("");
  console.log("============================================================");
  console.log("B RECEBEU MESSAGE:NEW");
  console.log("============================================================");

  console.log(
    JSON.stringify(message, null, 2),
  );

  messageReceived = true;

  console.log("");
  console.log("B também recebeu a própria mensagem pelo broadcast.");

  /*
   * Aguarda um pouco antes de encerrar para permitir
   * que o cliente A receba a mesma mensagem.
   */
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
  console.log("B DESCONECTADO");
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
  console.log("   RESULTADO CLIENTE B");
  console.log("============================================================");

  console.log("Socket conectado:", socket.connected);
  console.log("Entrou no grupo:", joined);
  console.log("Mensagem enviada:", sent);
  console.log("Message:new recebido:", messageReceived);

  console.log("");

  if (joined && sent) {
    console.log("============================================================");
    console.log("🎉 B ENVIOU A MENSAGEM COM SUCESSO!");
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
    console.log("Mensagem enviada:", sent);
    console.log("Message:new recebido:", messageReceived);

    finishTest(1);
  }
}, 30000);