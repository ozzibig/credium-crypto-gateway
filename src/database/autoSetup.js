const { pool } = require('./connection');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

async function autoSetupDatabase() {
  try {
    logger.info('🔄 Checking database schema...');
    
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schemaSql);
    
    logger.info('✅ Database schema initialized');
  } catch (error) {
    logger.error('❌ Database setup failed:', error);
    throw error;
  }
}

module.exports = { autoSetupDatabase };
