const readline = require('node:readline');
const { Writable } = require('node:stream');
const { pool } = require('../db');
const {
  createSecretary,
  setSecretaryActive,
  resetSecretaryPassword,
} = require('../services/secretary-accounts');

function readPassword() {
  return new Promise((resolve, reject) => {
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const input = readline.createInterface({
      input: process.stdin,
      output,
      terminal: process.stdin.isTTY,
    });
    let complete = false;
    input.on('SIGINT', () => {
      input.close();
      reject(new Error('Operación cancelada.'));
    });
    input.on('close', () => {
      if (!complete) reject(new Error('No se recibió una contraseña.'));
    });
    process.stderr.write('Contraseña de la cuenta: ');
    input.question('', (password) => {
      complete = true;
      input.close();
      process.stderr.write('\n');
      resolve(password);
    });
  });
}

async function main() {
  const [, , action, username, ...unexpected] = process.argv;
  if (
    !['crear', 'activar', 'desactivar', 'restablecer'].includes(action) ||
    !username ||
    unexpected.length
  ) {
    throw new Error(
      'Uso: node src/cli/secretarias.js <crear|activar|desactivar|restablecer> <usuario>',
    );
  }

  let account;
  if (action === 'crear') {
    account = await createSecretary(pool, { username, password: await readPassword() });
  } else if (action === 'restablecer') {
    account = await resetSecretaryPassword(pool, username, await readPassword());
  } else {
    account = await setSecretaryActive(pool, username, action === 'activar');
  }
  if (!account) throw new Error('No existe una cuenta con ese usuario.');
  console.log(`Cuenta ${account.usuario}: operación completada.`);
}

main()
  .catch((error) => {
    console.error(error.code === '23505' ? 'Ya existe una cuenta con ese usuario.' : error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
