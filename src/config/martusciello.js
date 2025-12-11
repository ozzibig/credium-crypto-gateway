module.exports = {
  TOKEN_URL: process.env.MARTUSCIELLO_TOKEN_URL || 'https://identity.sandbox.doublewallet.io/connect/token',
  API_URL: process.env.MARTUSCIELLO_API_URL || 'https://gateway.sandbox.doublewallet.io',
  CLIENT_ID: process.env.MARTUSCIELLO_CLIENT_ID || '',
  CLIENT_SECRET: process.env.MARTUSCIELLO_CLIENT_SECRET || '',
  SCOPE: process.env.MARTUSCIELLO_SCOPE || '',
  JWKS_URL: process.env.MARTUSCIELLO_JWKS_URL || 'https://gateway.sandbox.doublewallet.io/api/v1/public/webhook/.well-known/jwks.json',
};
