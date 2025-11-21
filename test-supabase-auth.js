/**
 * Test script per verificare l'autenticazione Supabase
 *
 * Usage: node test-supabase-auth.js <jwt_token>
 */

require('dotenv').config();
const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

async function testSupabaseAuth(token) {
  console.log('🔐 Testing Supabase JWT Authentication\n');
  console.log('📍 Supabase URL:', SUPABASE_URL);
  console.log('🔑 Token (first 50 chars):', token.substring(0, 50) + '...\n');

  try {
    // Verifica il token chiamando l'API Supabase
    const response = await axios.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY
      }
    });

    console.log('✅ Authentication successful!\n');
    console.log('User data:');
    console.log('  - ID:', response.data.id);
    console.log('  - Email:', response.data.email);
    console.log('  - Created:', response.data.created_at);
    console.log('  - Email confirmed:', response.data.email_confirmed_at ? 'Yes' : 'No');

    console.log('\n✅ Il middleware authenticateSupabaseToken funzionerà correttamente!');

  } catch (error) {
    console.log('❌ Authentication failed!\n');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);

      if (error.response.status === 401) {
        console.log('\n💡 Il token JWT potrebbe essere scaduto o non valido.');
        console.log('   Genera un nuovo token dal frontend Lovable e riprova.');
      }
    } else {
      console.log('Error:', error.message);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const token = process.argv[2];

if (!token) {
  console.log('❌ Errore: token JWT mancante\n');
  console.log('Usage: node test-supabase-auth.js <jwt_token>\n');
  console.log('Come ottenere un token JWT:');
  console.log('1. Apri il frontend Lovable');
  console.log('2. Fai login');
  console.log('3. Apri Developer Tools (F12)');
  console.log('4. Vai su Console e scrivi:');
  console.log('   localStorage.getItem("supabase.auth.token")');
  console.log('5. Copia il valore di "access_token"\n');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('❌ Errore: variabili d\'ambiente mancanti nel file .env\n');
  console.log('Assicurati di avere:');
  console.log('  - SUPABASE_URL');
  console.log('  - SUPABASE_PUBLISHABLE_KEY\n');
  process.exit(1);
}

testSupabaseAuth(token);
