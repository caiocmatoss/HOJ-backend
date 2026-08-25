import "dotenv/config";

import * as bcrypt from "bcrypt";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não está definida.",
  );
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const password = "12345678";

  const passwordHash =
    await bcrypt.hash(
      password,
      12,
    );

  const users = [
    {
      email: "socket.a@test.com",
      name: "Socket Teste A Atualizado",
    },
    {
      email: "socket.b@test.com",
      name: "Socket Teste B",
    },
  ];

  for (const testUser of users) {
    const user =
      await prisma.user.findUnique({
        where: {
          email: testUser.email,
        },
      });

    if (!user) {
      console.log(
        `❌ Usuário não encontrado: ${testUser.email}`,
      );

      continue;
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        passwordHash,
        status: "ONLINE",
      },
    });

    console.log(
      `✅ Senha redefinida: ${testUser.email}`,
    );

    console.log(
      `   ID: ${user.id}`,
    );
  }

  console.log("");
  console.log(
    "============================================================",
  );
  console.log(
    "SENHA DOS USUÁRIOS DE TESTE",
  );
  console.log(
    "============================================================",
  );
  console.log("");
  console.log(
    "Email A: socket.a@test.com",
  );
  console.log(
    "Email B: socket.b@test.com",
  );
  console.log(
    "Senha:   12345678",
  );
  console.log("");
  console.log(
    "============================================================",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "❌ ERRO AO REDEFINIR SENHAS",
    );
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });