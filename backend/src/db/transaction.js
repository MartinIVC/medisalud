async function withTransaction(pool, operation, { isolation = 'READ COMMITTED' } = {}) {
  if (!['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'].includes(isolation)) {
    throw new TypeError('Nivel de aislamiento de transacción no permitido.');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    transactionStarted = true;
    const result = await operation(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[DB] No se pudo revertir la transacción:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
