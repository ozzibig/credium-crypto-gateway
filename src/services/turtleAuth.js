const axios = require('axios');
const config = require('../config/turtle');
const logger = require('../utils/logger');

// Token cache
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Get OAuth2 access token using Client Credentials flow
 * Caches token and refreshes when expired (with 300s margin)
 */
async function getAccessToken() {
  // Check if credentials are configured
  if (!config.CLIENT_ID || !config.CLIENT_SECRET) {
    throw new Error('Turtle credentials not configured. Set TURTLE_CLIENT_ID and TURTLE_CLIENT_SECRET');
  }

  // Check if we have a valid cached token
  const now = Date.now();
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  logger.info('📡 Turtle: Requesting new access token');

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.CLIENT_ID);
    params.append('client_secret', config.CLIENT_SECRET);
    if (config.SCOPE) {
      params.append('scope', config.SCOPE);
    }

    const response = await axios.post(config.TOKEN_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, expires_in } = response.data;

    // Cache token with 300 seconds margin before expiration
    cachedToken = access_token;
    tokenExpiresAt = now + (expires_in - 300) * 1000;

    logger.info('📡 Turtle: Access token obtained successfully');

    return access_token;
  } catch (error) {
    logger.error(`📡 Turtle: Token request failed - ${error.message}`);
    if (error.response) {
      logger.error(`📡 Turtle: Token error details - ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Failed to obtain Turtle access token: ${error.message}`);
  }
}

/**
 * Clear the cached token (useful for testing or forced refresh)
 */
function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = null;
}

module.exports = {
  getAccessToken,
  clearTokenCache,
};
