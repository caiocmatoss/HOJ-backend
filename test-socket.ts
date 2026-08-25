import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:3000";

const groupId =
  "cmszbkzw90000q4njiffbcafc";

const token =
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXN6N2pxMjUwMDAwZzBuanI2OXY5MGI1IiwiZW1haWwiOiJ1c3VhcmlvQHRlc3RlLmNvbSIsImlhdCI6MTc4NzA5MjQ3NiwiZXhwIjoxNzg3Njk3Mjc2fQ.JXqc7Rj7dF7lEbF6vcCrxM3sSKyyGk0KYPXA-JquoFE";

const socket = io(SOCKET_URL, {
 auth: {
  token,
  },
});

socket.on("connect", () => {
  console.log(
    "Socket conectado:",
    socket.id,
  );

  socket.emit("chat:join", {
    groupId,
  });
});

socket.on("chat:joined", (data) => {
  console.log(
    "Entrou no grupo:",
    data,
  );

  socket.emit("message:send", {
    groupId,
    text:
      "Teste de autenticação Socket.IO",
  });
});

socket.on("message:new", (message) => {
  console.log(
    "NOVA MENSAGEM:",
  );

  console.log(message);

  socket.disconnect();
});

socket.on(
  "connect_error",
  (error) => {
    console.error(
      "ERRO DE AUTENTICAÇÃO:",
      error.message,
    );
  },
);