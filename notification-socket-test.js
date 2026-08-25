const { io } = require("socket.io-client");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(text) {
  return new Promise((resolve) => {
    rl.question(text, resolve);
  });
}

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("   TESTE NOTIFICAÇÕES - HOJE É OND");
  console.log("==========================================");
  console.log("");

  const token = await question(
    "Cole o TOKEN do usuário A e pressione ENTER: ",
  );

  if (!token.trim()) {
    console.error("");
    console.error("❌ Token não informado.");
    rl.close();
    process.exit(1);
  }

  console.log("");
  console.log("🔌 Conectando ao servidor...");
  console.log("Servidor: http://localhost:3000");
  console.log("");

  const socket = io(
    "http://localhost:3000",
    {
      auth: {
        token: token.trim(),
      },
    },
  );

  socket.on("connect", () => {
    console.log("✅ Socket conectado");
    console.log("Socket ID:", socket.id);
    console.log("");

    console.log(
      "📥 Entrando na sala de notificações...",
    );

    socket.emit(
      "notifications:join",
    );
  });

  socket.on(
    "notifications:joined",
    (data) => {
      console.log("");
      console.log(
        "✅ notifications:joined recebido",
      );

      console.log(
        JSON.stringify(
          data,
          null,
          2,
        ),
      );

      console.log("");
      console.log(
        "==========================================",
      );
      console.log(
        " AGUARDANDO notification:new",
      );
      console.log(
        "==========================================",
      );
      console.log("");
      console.log(
        "Agora crie uma notificação pelo outro PowerShell.",
      );
      console.log("");
    },
  );

  socket.on(
    "notification:new",
    (notification) => {
      console.log("");
      console.log(
        "==========================================",
      );
      console.log(
        "🔔 notification:new RECEBIDO",
      );
      console.log(
        "==========================================",
      );

      console.log(
        JSON.stringify(
          notification,
          null,
          2,
        ),
      );

      console.log("");
    },
  );

  socket.on(
    "notifications:left",
    (data) => {
      console.log("");
      console.log(
        "✅ notifications:left recebido",
      );

      console.log(
        JSON.stringify(
          data,
          null,
          2,
        ),
      );
    },
  );

  socket.on(
    "connect_error",
    (error) => {
      console.error("");
      console.error(
        "❌ ERRO DE CONEXÃO",
      );
      console.error(
        error.message,
      );
      console.error("");
    },
  );

  socket.on(
    "disconnect",
    (reason) => {
      console.log("");
      console.log(
        "⚠️ Socket desconectado",
      );
      console.log(
        "Motivo:",
        reason,
      );
      console.log("");
    },
  );

  process.on(
    "SIGINT",
    () => {
      console.log("");
      console.log(
        "Encerrando teste...",
      );

      socket.disconnect();
      rl.close();

      process.exit(0);
    },
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "❌ ERRO NO TESTE",
  );
  console.error(
    error,
  );

  rl.close();
  process.exit(1);
});