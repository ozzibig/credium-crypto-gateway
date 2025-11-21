const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

async function authenticateSupabaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Verifica il token chiamando l'API Supabase
    const response = await axios.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY
      }
    });

    // Token valido - salva i dati utente
    req.user = response.data;
    next();
    
  } catch (error) {
    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Auth error:', error.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

module.exports = { authenticateSupabaseToken };
