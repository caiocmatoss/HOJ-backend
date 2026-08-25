const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { Client } = require("pg");

const email = "socket.b@test.com";
const newPassword = "123456";

/*
 * ============================================================
 * CARREGAR DATABASE_URL DO .ENV
 * ============================================================
 */

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(
    filePath,
    "utf8",
  );

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    const separator =
      line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key =
      line
        .slice(0, separator)
        .trim();

    let value =
      line
        .slice(separator + 1)
        .trim();

    if (
      value.startsWith('"') &&
      value.endsWith('"')
    ) {
      value = value.slice(
        1,
        -1,
      );
    }

    if (
      value.startsWith("'") &&
      value.endsWith("'")
    ) {
      value = value.slice(
        1,
        -1,
      );
    }

    if (
      key &&
      !process.env[key]
    ) {
      process.env[key] =
        value;
    }
  }

  return true;
}

/*
 * Procura os locais mais comuns.
 */

const envFiles = [
  path.join(
    process.cwd(),
    ".env",
  ),

  path.join(
    process.cwd(),
    ".env.local",
  ),

  path.join(
    process.cwd(),
    "prisma",
    ".env",
  ),
];

let envLoaded = false;

for (const envFile of envFiles) {
  if (
    loadEnvFile(envFile)
  ) {
    console.log(
      "Arquivo .env carregado:",
    );

    console.log(envFile);

    console.log("");

    envLoaded = true;
  }
}

if (!envLoaded) {
  console.log(
    "⚠️ Nenhum arquivo .env encontrado nos locais padrão.",
  );

  console.log("");
}

/*
 * ============================================================
 * CONFIGURAÇÃO
 * ============================================================
 */

const databaseUrl =
  process.env.DATABASE_URL;

console.log(
  "============================================================",
);

console.log(
  "   ALTERAR SENHA - SOCKET TESTE B",
);

console.log(
  "============================================================",
);

console.log("");

console.log(
  "Usuário:",
  email,
);

console.log(
  "Nova senha:",
  newPassword,
);

console.log("");

/*
 * ============================================================
 * VERIFICAR DATABASE_URL
 * ============================================================
 */

if (!databaseUrl) {
  console.error(
    "❌ DATABASE_URL não encontrada.",
  );

  console.error("");

  console.error(
    "Verifique se existe um arquivo:",
  );

  console.error(
    "C:\\Projetos\\HojeEOnd\\HojeEOnd-backend\\.env",
  );

  console.error("");

  console.error(
    "E se ele possui algo como:",
  );

  console.error(
    'DATABASE_URL="postgresql://..."',
  );

  console.error("");

  process.exit(1);
}

/*
 * Não mostra a senha do banco no terminal.
 */

console.log(
  "✅ DATABASE_URL encontrada.",
);

console.log("");

/*
 * ============================================================
 * EXECUÇÃO
 * ============================================================
 */

async function main() {
  const client =
    new Client({
      connectionString:
        databaseUrl,
    });

  try {
    console.log(
      "Conectando ao PostgreSQL...",
    );

    await client.connect();

    console.log(
      "✅ PostgreSQL conectado.",
    );

    console.log("");

    /*
     * Descobre automaticamente se a tabela
     * User possui "password" ou "passwordHash".
     */

    const columnsResult =
      await client.query(`
        SELECT
          column_name
        FROM information_schema.columns
        WHERE
          table_schema = 'public'
          AND table_name = 'User'
          AND column_name IN (
            'password',
            'passwordHash'
          )
        ORDER BY column_name;
      `);

    const availableColumns =
      columnsResult.rows.map(
        (row) =>
          row.column_name,
      );

    let passwordColumn =
      null;

    if (
      availableColumns.includes(
        "password",
      )
    ) {
      passwordColumn =
        "password";
    } else if (
      availableColumns.includes(
        "passwordHash",
      )
    ) {
      passwordColumn =
        "passwordHash";
    }

    if (!passwordColumn) {
      console.error(
        "❌ Não encontrei a coluna de senha na tabela User.",
      );

      console.error("");

      console.error(
        "Colunas encontradas:",
      );

      console.error(
        availableColumns,
      );

      console.error("");

      process.exitCode = 1;

      return;
    }

    console.log(
      "Coluna de senha encontrada:",
      passwordColumn,
    );

    console.log("");

    /*
     * Gera o hash.
     */

    console.log(
      "Gerando hash bcrypt...",
    );

    const passwordHash =
      await bcrypt.hash(
        newPassword,
        10,
      );

    console.log(
      "✅ Hash gerado.",
    );

    console.log("");

    /*
     * Monta SQL utilizando somente o nome
     * de coluna previamente identificado.
     */

    const updateSql = `
      UPDATE "User"
      SET
        "${passwordColumn}" = $1,
        "updatedAt" = NOW()
      WHERE email = $2
      RETURNING
        id,
        name,
        email,
        "updatedAt";
    `;

    const result =
      await client.query(
        updateSql,
        [
          passwordHash,
          email,
        ],
      );

    if (
      result.rowCount === 0
    ) {
      console.error(
        "❌ Usuário não encontrado.",
      );

      console.error("");

      console.error(
        "E-mail procurado:",
        email,
      );

      console.error("");

      console.error(
        "Verifique se socket.b@test.com realmente existe no banco.",
      );

      process.exitCode = 1;

      return;
    }

    console.log(
      "============================================================",
    );

    console.log(
      "✅ SENHA ALTERADA COM SUCESSO",
    );

    console.log(
      "============================================================",
    );

    console.log("");

    console.log(
      "Usuário atualizado:",
    );

    console.log(
      JSON.stringify(
        result.rows[0],
        null,
        2,
      ),
    );

    console.log("");

    console.log(
      "============================================================",
    );

    console.log(
      "LOGIN DO USUÁRIO B",
    );

    console.log(
      "============================================================",
    );

    console.log("");

    console.log(
      "E-mail:",
      email,
    );

    console.log(
      "Senha:",
      newPassword,
    );

    console.log("");

    console.log(
      "============================================================",
    );

    console.log(
      "🎉 PRONTO PARA TESTAR O USUÁRIO B",
    );

    console.log(
      "============================================================",
    );

    console.log("");
  } catch (error) {
    console.error("");

    console.error(
      "============================================================",
    );

    console.error(
      "❌ ERRO AO ALTERAR SENHA",
    );

    console.error(
      "============================================================",
    );

    console.error("");

    if (
      error instanceof Error
    ) {
      console.error(
        "Nome:",
        error.name,
      );

      console.error(
        "Mensagem:",
        error.message,
      );

      if (error.stack) {
        console.error("");

        console.error(
          "Stack:",
        );

        console.error(
          error.stack,
        );
      }
    } else {
      console.error(error);
    }

    console.error("");

    process.exitCode = 1;
  } finally {
    await client
      .end()
      .catch(() => {});
  }
}

main();