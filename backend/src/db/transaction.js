async function withTransaction(pool, operation, { isolation = 'READ COMMITTED' } = {}) {
  if (!['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'].includes(isolation)) {
    throw new TypeError('Nivel de aislamiento de transacción no permitido.');
  }

  const client = typeof pool.connect === 'function' ? await pool.connect() : pool;
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
    if (typeof client.release === 'function') {
      client.release();
    }
  }
}

module.exports = { withTransaction };
