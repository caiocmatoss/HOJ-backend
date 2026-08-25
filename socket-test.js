const { io } = require("socket.io-client");

const token = process.env.TEST_TOKEN;
const groupId = process.env.TEST_GROUP_ID;

if (!token) {
    console.error("TEST_TOKEN não definido.");
    process.exit(1);
}

if (!groupId) {
    console.error("TEST_GROUP_ID não definido.");
    process.exit(1);
}

console.log("");
console.log("============================================================");
console.log("   CLIENTE DE TESTE SOCKET.IO");
console.log("============================================================");
console.log("");
console.log("Servidor: http://localhost:3000");
console.log("Grupo:", groupId);
console.log("");

const socket = io("http://localhost:3000", {
    auth: {
        token: token
    },
    transports: ["websocket"]
});

socket.on("connect", () => {
    console.log("");
    console.log("============================================================");
    console.log("SOCKET CONECTADO");
    console.log("============================================================");
    console.log("Socket ID:", socket.id);
    console.log("");

    socket.emit("chat:join", {
        groupId: groupId
    });
});

socket.on("chat:joined", (data) => {
    console.log("");
    console.log("============================================================");
    console.log("CHAT JOIN CONFIRMADO");
    console.log("============================================================");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    socket.emit("message:send", {
        groupId: groupId,
        text: "Mensagem Socket.IO de teste - Hoje É Ond"
    });
});

socket.on("message:sent", (data) => {
    console.log("");
    console.log("============================================================");
    console.log("MESSAGE SENT");
    console.log("============================================================");
    console.log(JSON.stringify(data, null, 2));
});

socket.on("message:new", (data) => {
    console.log("");
    console.log("============================================================");
    console.log("MESSAGE NEW RECEBIDO");
    console.log("============================================================");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    console.log("TESTE CONCLUIDO.");

    setTimeout(() => {
        socket.disconnect();
    }, 500);
});

socket.on("connect_error", (error) => {
    console.error("");
    console.error("============================================================");
    console.error("ERRO DE CONEXAO SOCKET.IO");
    console.error("============================================================");
    console.error("Mensagem:", error.message);
    console.error("");
});

socket.on("disconnect", (reason) => {
    console.log("");
    console.log("============================================================");
    console.log("SOCKET DESCONECTADO");
    console.log("============================================================");
    console.log("Motivo:", reason);
});