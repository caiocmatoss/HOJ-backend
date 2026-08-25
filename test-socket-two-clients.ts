import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:3000";

const groupId =
  "cmszbkzw90000q4njiffbcafc";

// JWT do Usuario Teste
const usuarioToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXN6OHhla3YwMDAxNm9uamNoZHczNzEzIiwiZW1haWwiOiJjYWlvMkB0ZXN0ZS5jb20iLCJpYXQiOjE3ODcwOTk5MzMsImV4cCI6MTc4NzcwNDczM30.K80G6pxeBLqsEgFImJ4nGhf0oYmM4Qg5aIkQD8QNP1U";

// JWT do Caio Teste
const caioToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXN6N2pxMjUwMDAwZzBuanI2OXY5MGI1IiwiZW1haWwiOiJ1c3VhcmlvQHRlc3RlLmNvbSIsImlhdCI6MTc4NzA5OTkzNywiZXhwIjoxNzg3NzA0NzM3fQ.o9SQYZayCkfwylofX40eCmLqc9H59J1wzm3FT0DHj_0";

function connectClient(
  name: string,
  token: string,
): Socket {
  const socket = io(
    SOCKET_URL,
    {
      auth: {
        token,
      },
    },
  );

  socket.on("connect", () => {
    console.log(
      `[${name}] conectado:`,
      socket.id,
    );

    socket.emit("chat:join", {
      groupId,
    });
  });

  socket.on(
    "chat:joined",
    (data) => {
      console.log(
        `[${name}] entrou no grupo:`,
        data,
      );
    },
  );

  socket.on(
    "message:new",
    (message) => {
      console.log(
        `\n[${name}] MENSAGEM RECEBIDA:`,
      );

      console.log(message);
    },
  );

  socket.on(
    "connect_error",
    (error) => {
      console.error(
        `[${name}] ERRO:`,
        error.message,
      );
    },
  );

  return socket;
}

const usuarioSocket =
  connectClient(
    "Usuario Teste",
    usuarioToken,
  );

const caioSocket =
  connectClient(
    "Caio Teste",
    caioToken,
  );

setTimeout(() => {
  console.log(
    "\n[Usuario Teste] enviando mensagem...\n",
  );

  usuarioSocket.emit(
    "message:send",
    {
      groupId,
      text:
        "Oi Caio! Mensagem em tempo real!",
    },
  );
}, 3000);

setTimeout(() => {
  console.log(
    "\n[Caio Teste] enviando resposta...\n",
  );

  caioSocket.emit(
    "message:send",
    {
      groupId,
      text:
        "Recebi! Socket.IO funcionando!",
    },
  );
}, 6000);

setTimeout(() => {
  console.log(
    "\nEncerrando teste...",
  );

  usuarioSocket.disconnect();
  caioSocket.disconnect();

  process.exit(0);
}, 9000);