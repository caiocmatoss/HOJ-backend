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

console.log("");
console.log("============================================================");
console.log("   TESTE DE SEGURANÇA - MESSAGE:SEND FORA DO GRUPO");
console.log("============================================================");
console.log("");
console.log("Servidor:", serverUrl);
console.log("Grupo:", groupId);
console.log("Usuário: B");
console.log("Token: DEFINIDO");

const socket = io(serverUrl, {
  auth: {
    token,
  },

  transports: ["polling", "websocket"],

  timeout: 10000,

  reconnection: false,
});

let connected = false;
let messageSent = false;
let accessDenied = false;
let finished = false;

function finish() {
  if (finished) {
    return;
  }

  finished = true;

  console.log("");
  console.log("============================================================");
  console.log("RESULTADO DO TESTE");
  console.log("============================================================");

  console.log("Socket conectado:", connected);
  console.log("Mensagem enviada:", messageSent);
  console.log("Acesso negado:", accessDenied);

  if (messageSent) {
    console.log("");
    console.log("❌ FALHA DE SEGURANÇA");
    console.log("");
    console.log("O usuário B conseguiu enviar uma mensagem");
    console.log("para um grupo do qual ele NÃO é membro.");
    console.log("");
    console.log("O backend precisa bloquear message:send.");
  } else if (accessDenied) {
    console.log("");
    console.log("✅ TESTE DE SEGURANÇA APROVADO");
    console.log("");
    console.log("B tentou enviar uma mensagem para");
    console.log("o grupo exclusivo de A.");
    console.log("");
    console.log("O backend recusou corretamente o envio.");
  } else {
    console.log("");
    console.log("⚠️ TESTE INCONCLUSIVO");
    console.log("");
    console.log("O servidor não confirmou nem recusou");
    console.log("explicitamente o envio.");
  }

  console.log("");
  console.log("============================================================");

  socket.disconnect();
}

socket.on("connect", () => {
  connected = true;

  console.log("");
  console.log("============================================================");
  console.log("B CONECTADO AO SOCKET");
  console.log("============================================================");

  console.log("Socket ID:", socket.id);

  console.log("");
  console.log("B NÃO ENTRARÁ NO GRUPO.");
  console.log("");
  console.log("B tentará enviar message:send diretamente...");
  console.log("");

  setTimeout(() => {
    console.log("B ENVIANDO MESSAGE:SEND...");

    socket.emit(
      "message:send",
      {
        groupId,
        text: "Mensagem NÃO autorizada enviada por B.",
      },
      (response) => {
        console.log("");
        console.log("============================================================");
        console.log("CALLBACK DO MESSAGE:SEND RECEBIDO");
        console.log("============================================================");

        console.log(
          JSON.stringify(
            response,
            null,
            2,
          ),
        );

        if (
          response &&
          response.code === "GROUP_ACCESS_DENIED"
        ) {
          accessDenied = true;
        } else if (
          response &&
          response.message === "Você não é membro deste grupo."
        ) {
          accessDenied = true;
        } else if (
          response &&
          response.data
        ) {
          messageSent = true;
        }

        setTimeout(() => {
          finish();
        }, 1000);
      },
    );

    console.log("");
    console.log("message:send enviado.");
    console.log("Aguardando resposta do servidor...");
  }, 1000);
});

socket.on("message:new", (message) => {
  console.log("");
  console.log("============================================================");
  console.log("⚠️ B RECEBEU MESSAGE:NEW");
  console.log("============================================================");

  console.log(
    JSON.stringify(
      message,
      null,
      2,
    ),
  );

  if (
    message &&
    message.groupId === groupId
  ) {
    console.log("");
    console.log("❌ FALHA DE SEGURANÇA");
    console.log("");
    console.log("B recebeu uma mensagem do grupo");
    console.log("do qual não deveria ter acesso.");

    messageSent = true;

    setTimeout(() => {
      finish();
    }, 500);
  }
});

socket.on("chat:error", (error) => {
  console.log("");
  console.log("============================================================");
  console.log("✅ CHAT:ERROR RECEBIDO");
  console.log("============================================================");

  console.log(
    JSON.stringify(
      error,
      null,
      2,
    ),
  );

  if (
    error &&
    (
      error.code === "GROUP_ACCESS_DENIED" ||
      error.message === "Você não é membro deste grupo."
    )
  ) {
    accessDenied = true;

    console.log("");
    console.log("✅ ENVIO BLOQUEADO PELO BACKEND.");
  }

  setTimeout(() => {
    finish();
  }, 1000);
});

socket.on("connect_error", (error) => {
  console.log("");
  console.log("============================================================");
  console.log("❌ ERRO DE CONEXÃO");
  console.log("============================================================");

  console.log("Mensagem:", error.message);

  if (error.description) {
    console.log("");
    console.log("Descrição:");
    console.log(error.description);
  }

  if (error.context) {
    console.log("");
    console.log("Contexto:");
    console.log(error.context);
  }

  finish();
});

socket.on("error", (error) => {
  console.log("");
  console.log("============================================================");
  console.log("⚠️ ERRO DO SOCKET");
  console.log("============================================================");

  console.log(
    JSON.stringify(
      error,
      null,
      2,
    ),
  );

  if (
    error &&
    (
      error.code === "GROUP_ACCESS_DENIED" ||
      error.message === "Você não é membro deste grupo."
    )
  ) {
    accessDenied = true;
  }
});

socket.on("disconnect", (reason) => {
  console.log("");
  console.log("============================================================");
  console.log("SOCKET DESCONECTADO");
  console.log("============================================================");

  console.log("Motivo:", reason);
});

setTimeout(() => {
  if (!finished) {
    console.log("");
    console.log("============================================================");
    console.log("⚠️ TIMEOUT DO TESTE");
    console.log("============================================================");

    console.log("Socket conectado:", socket.connected);
    console.log("Socket ID:", socket.id);

    console.log("");
    console.log("O servidor não respondeu ao message:send.");

    finish();
  }
}, 12000);