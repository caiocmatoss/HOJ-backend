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
console.log("   TESTE DE SEGURANÇA - USUÁRIO FORA DO GRUPO");
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
let joined = false;
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
  console.log("Entrou no grupo:", joined);
  console.log("Acesso negado:", accessDenied);

  console.log("");

  if (joined) {
    console.log("❌ FALHA DE SEGURANÇA");
    console.log("");
    console.log("O usuário B conseguiu entrar em um grupo");
    console.log("do qual ele NÃO é membro.");
  } else if (accessDenied) {
    console.log("✅ TESTE DE SEGURANÇA APROVADO");
    console.log("");
    console.log("B tentou entrar no grupo exclusivo de A.");
    console.log("O backend recusou corretamente o acesso.");
  } else {
    console.log("⚠️ ACESSO NÃO CONFIRMADO");
    console.log("");
    console.log("B não entrou no grupo, porém");
    console.log("não recebemos uma resposta explícita de bloqueio.");
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
  console.log("B enviando chat:join...");

  socket.emit(
    "chat:join",
    {
      groupId,
    },
    (response) => {
      console.log("");
      console.log("============================================================");
      console.log("CALLBACK DO CHAT:JOIN RECEBIDO");
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
        response.event === "chat:joined"
      ) {
        joined = true;

        console.log("");
        console.log("❌ B CONSEGUIU ENTRAR NO GRUPO.");
      }

      if (
        response &&
        response.event === "chat:error"
      ) {
        accessDenied = true;

        console.log("");
        console.log("✅ BACKEND RECUSOU O ACESSO.");
      }

      setTimeout(() => {
        finish();
      }, 500);
    },
  );

  console.log("");
  console.log("chat:join enviado.");
  console.log("Aguardando resposta do servidor...");
});

socket.on("chat:joined", (data) => {
  console.log("");
  console.log("============================================================");
  console.log("⚠️ EVENTO CHAT:JOINED RECEBIDO");
  console.log("============================================================");

  console.log(
    JSON.stringify(
      data,
      null,
      2,
    ),
  );

  joined = true;

  console.log("");
  console.log("❌ FALHA DE SEGURANÇA:");
  console.log("B entrou no grupo.");

  setTimeout(() => {
    finish();
  }, 500);
});

socket.on("chat:error", (data) => {
  console.log("");
  console.log("============================================================");
  console.log("✅ EVENTO CHAT:ERROR RECEBIDO");
  console.log("============================================================");

  console.log(
    JSON.stringify(
      data,
      null,
      2,
    ),
  );

  accessDenied = true;

  console.log("");
  console.log("✅ ACESSO AO GRUPO FOI BLOQUEADO.");

  setTimeout(() => {
    finish();
  }, 500);
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
  console.log("❌ ERRO DO SOCKET");
  console.log("============================================================");

  console.log(
    JSON.stringify(
      error,
      null,
      2,
    ),
  );
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
    console.log("Nenhuma confirmação explícita foi recebida.");

    finish();
  }
}, 12000);