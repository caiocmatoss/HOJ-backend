const { io } = require("socket.io-client");

const BASE_URL = "http://localhost:3000";

const USER_A = {
  email: "socket.a@test.com",
  password: "123456",
};

const USER_B = {
  email: "socket.b@test.com",
  password: "123456",
};

const groupId = process.argv[2];

if (!groupId) {
  console.error("");
  console.error("ERRO: informe o ID do grupo.");
  console.error("");
  console.error("Exemplo:");
  console.error("node socket-dual-test.js cmt123");
  console.error("");
  process.exit(1);
}

async function login(user, label) {
  const response = await fetch(
    `${BASE_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `${label}: ${JSON.stringify(data)}`,
    );
  }

  if (!data.accessToken) {
    throw new Error(
      `${label}: accessToken não encontrado.`,
    );
  }

  return data.accessToken;
}

function createSocket(token, label, state) {
  console.log("");
  console.log(`🔌 Conectando ${label}...`);

  const socket = io(BASE_URL, {
    auth: {
      token,
    },
  });

  socket.on("connect", () => {
    console.log("");
    console.log(`✅ ${label} conectado`);
    console.log(`Socket ID: ${socket.id}`);

    console.log(
      `${label}: enviando chat:join...`,
    );

    socket.emit("chat:join", {
      groupId,
    });
  });

  socket.on("chat:joined", (data) => {
    console.log("");
    console.log(
      `✅ ${label}: chat:joined`,
    );

    console.log(
      JSON.stringify(data, null, 2),
    );

    state.joined = true;

    checkReady();
  });

  socket.on("message:new", (message) => {
    console.log("");
    console.log(
      `📨 ${label}: message:new`,
    );

    console.log(
      JSON.stringify(message, null, 2),
    );
  });

  socket.on("message:sent", (data) => {
    console.log("");
    console.log(
      `✅ ${label}: message:sent`,
    );

    console.log(
      JSON.stringify(data, null, 2),
    );
  });

  socket.on("connect_error", (error) => {
    console.error("");
    console.error(
      `❌ ${label}: ERRO DE CONEXÃO`,
    );

    console.error(
      error.message,
    );
  });

  socket.on("disconnect", (reason) => {
    console.log("");
    console.log(
      `⚠️ ${label}: desconectado`,
    );

    console.log(
      `Motivo: ${reason}`,
    );
  });

  return socket;
}

let socketA;
let socketB;

const stateA = {
  joined: false,
};

const stateB = {
  joined: false,
};

let testStarted = false;

function checkReady() {
  if (
    testStarted ||
    !stateA.joined ||
    !stateB.joined
  ) {
    return;
  }

  testStarted = true;

  console.log("");
  console.log("==========================================");
  console.log("   AMBOS OS USUÁRIOS ESTÃO NO GRUPO");
  console.log("==========================================");
  console.log("");

  console.log(
    "Agora podemos testar comunicação em tempo real.",
  );

  setTimeout(() => {
    console.log("");
    console.log("==========================================");
    console.log("   USUÁRIO A → USUÁRIO B");
    console.log("==========================================");
    console.log("");

    socketA.emit("message:send", {
      groupId,
      text: "Mensagem enviada pelo usuário A.",
    });
  }, 1000);

  setTimeout(() => {
    console.log("");
    console.log("==========================================");
    console.log("   USUÁRIO B → USUÁRIO A");
    console.log("==========================================");
    console.log("");

    socketB.emit("message:send", {
      groupId,
      text: "Resposta enviada pelo usuário B.",
    });
  }, 3000);

  setTimeout(() => {
    console.log("");
    console.log("==========================================");
    console.log("   TESTE SOCKET.IO FINALIZADO");
    console.log("==========================================");
    console.log("");

    socketA.disconnect();
    socketB.disconnect();

    process.exit(0);
  }, 5000);
}

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("   TESTE CHAT SOCKET.IO - HOJE É OND");
  console.log("==========================================");
  console.log("");

  console.log(
    `Servidor: ${BASE_URL}`,
  );

  console.log(
    `Grupo: ${groupId}`,
  );

  console.log("");
  console.log("🔐 Fazendo login...");

  const tokenA = await login(
    USER_A,
    "Usuário A",
  );

  console.log(
    "✅ Usuário A autenticado",
  );

  const tokenB = await login(
    USER_B,
    "Usuário B",
  );

  console.log(
    "✅ Usuário B autenticado",
  );

  socketA = createSocket(
    tokenA,
    "USUÁRIO A",
    stateA,
  );

  socketB = createSocket(
    tokenB,
    "USUÁRIO B",
    stateB,
  );
}

main().catch((error) => {
  console.error("");
  console.error("==========================================");
  console.error("❌ ERRO NO TESTE");
  console.error("==========================================");
  console.error("");

  console.error(
    error.message,
  );

  console.error("");

  process.exit(1);
});