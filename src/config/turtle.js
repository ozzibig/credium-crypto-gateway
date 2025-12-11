module.exports = {
  TOKEN_URL: process.env.TURTLE_TOKEN_URL || 'https://identity.sandbox.doublewallet.io/connect/token',
  API_URL: process.env.TURTLE_API_URL || 'https://gateway.sandbox.doublewallet.io',
  CLIENT_ID: process.env.TURTLE_CLIENT_ID || '',
  CLIENT_SECRET: process.env.TURTLE_CLIENT_SECRET || '',
  SCOPE: process.env.TURTLE_SCOPE || '',
  JWKS_URL: process.env.TURTLE_JWKS_URL || 'https://gateway.sandbox.doublewallet.io/api/v1/public/webhook/.well-known/jwks.json',
};
