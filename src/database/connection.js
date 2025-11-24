const { Pool } = require('pg');
require('dotenv').config();

// Configurazione pool PostgreSQL ottimizzata per Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // Ridotto per Railway
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10 secondi invece di 2
  statement_timeout: 15000, // Timeout query 15 secondi
  query_timeout: 15000,
});

// Non crashare il server se c'è un errore nel pool
pool.on('error', (err) => {
  console.error('⚠️ Unexpected error on idle PostgreSQL client:', err.message);
  console.log('⚠️ Database connection lost, but server continues running');
  // NON chiamare process.exit() - lasciamo il server attivo
});

/**
 * Testa la connessione al database con retry
 * @param {number} retries - Numero di tentativi
 * @param {number} delay - Delay tra tentativi in ms
 * @returns {Promise<boolean>}
 */
async function testConnection(retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await pool.query('SELECT NOW()');
      console.log('✅ Database connected:', result.rows[0].now);
      return true;
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt}/${retries} failed:`, error.message);

      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error('❌ Database connection failed after all retries');
  console.log('⚠️ Server will continue without database (limited functionality)');
  return false;
}

/**
 * Esegue una query in modo sicuro, gestendo errori di connessione
 * @param {string} text - Query SQL
 * @param {Array} params - Parametri query
 * @returns {Promise<object|null>}
 */
async function safeQuery(text, params) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error('❌ Database query error:', error.message);
    return null;
  }
}

module.exports = { pool, testConnection, safeQuery };
