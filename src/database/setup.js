const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function setupDatabase() {
  try {
    console.log('🔄 Setting up database schema...');
    
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    
    console.log('✅ Database schema created successfully');
    console.log('✅ Tables: users, user_wallets, deposits, sweep_operations');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };
