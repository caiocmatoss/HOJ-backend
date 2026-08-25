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
      `${label}: enviando location:join...`,
    );

    socket.emit("location:join");
  });

  socket.on("location:joined", (data) => {
    console.log("");
    console.log(
      `✅ ${label}: location:joined`,
    );

    console.log(
      JSON.stringify(data, null, 2),
    );

    state.joined = true;

    checkReady();
  });

  socket.on("location:updated", (data) => {
    console.log("");
    console.log(
      `📍 ${label}: location:updated`,
    );

    console.log(
      JSON.stringify(data, null, 2),
    );

    state.receivedUpdates += 1;
  });

  socket.on("location:saved", (data) => {
    console.log("");
    console.log(
      `✅ ${label}: location:saved`,
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

    console.error(error.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("");
    console.log(
      `⚠️ ${label}: desconectado`,
    );

    console.log(`Motivo: ${reason}`);
  });

  return socket;
}

let socketA;
let socketB;

const stateA = {
  joined: false,
  receivedUpdates: 0,
};

const stateB = {
  joined: false,
  receivedUpdates: 0,
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
  console.log("   AMBOS OS USUÁRIOS CONECTADOS");
  console.log("==========================================");
  console.log("");

  console.log(
    "Agora vamos testar localização em tempo real.",
  );

  setTimeout(() => {
    console.log("");
    console.log("==========================================");
    console.log("   USUÁRIO A → LOCATION:UPDATE");
    console.log("==========================================");
    console.log("");

    const location = {
      latitude: -23.55052,
      longitude: -46.63331,
    };

    console.log(
      "Localização enviada:",
    );

    console.log(
      JSON.stringify(
        location,
        null,
        2,
      ),
    );

    socketA.emit(
      "location:update",
      location,
      (response) => {
        console.log("");
        console.log(
          "📨 ACK location:update:",
        );

        console.log(
          JSON.stringify(
            response,
            null,
            2,
          ),
        );
      },
    );
  }, 1000);

  setTimeout(() => {
    console.log("");
    console.log("==========================================");
    console.log("   RESULTADO DO TESTE");
    console.log("==========================================");
    console.log("");

    console.log(
      `Atualizações recebidas pelo Usuário A: ${stateA.receivedUpdates}`,
    );

    console.log(
      `Atualizações recebidas pelo Usuário B: ${stateB.receivedUpdates}`,
    );

    if (stateB.receivedUpdates > 0) {
      console.log("");
      console.log(
        "✅ SUCESSO: Usuário B recebeu a localização do Usuário A.",
      );
    } else {
      console.log("");
      console.log(
        "❌ FALHA: Usuário B não recebeu location:updated.",
      );
    }

    console.log("");
    console.log("==========================================");
    console.log("   TESTE DE LOCALIZAÇÃO FINALIZADO");
    console.log("==========================================");
    console.log("");

    socketA.disconnect();
    socketB.disconnect();

    process.exit(
      stateB.receivedUpdates > 0
        ? 0
        : 1,
    );
  }, 4000);
}

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("   TESTE LOCALIZAÇÃO SOCKET.IO");
  console.log("          HOJE É OND");
  console.log("==========================================");
  console.log("");

  console.log(
    `Servidor: ${BASE_URL}`,
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

  console.error(error.message);

  console.error("");

  process.exit(1);
});