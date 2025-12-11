const axios = require('axios');
const { getAccessToken } = require('./martuscielloAuth');
const config = require('../config/martusciello');
const logger = require('../utils/logger');

/**
 * Generic API call to Martusciello
 */
async function callAPI(method, endpoint, body = null) {
  const token = await getAccessToken();
  const url = `${config.API_URL}${endpoint}`;

  logger.info(`📡 Martusciello: ${method.toUpperCase()} ${endpoint}`);

  try {
    const response = await axios({
      method,
      url,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: body,
    });

    return response.data;
  } catch (error) {
    logger.error(`📡 Martusciello: API call failed - ${method.toUpperCase()} ${endpoint}`);
    if (error.response) {
      logger.error(`📡 Martusciello: Error ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      throw new Error(`Martusciello API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Martusciello API error: ${error.message}`);
  }
}

// ============ USERS ============

/**
 * Create a new user in Martusciello
 * @param {string} externalId - External ID (e.g., telegramId)
 * @param {string} email - User email
 */
async function createUser(externalId, email) {
  return callAPI('POST', '/api/v1/users', {
    externalId,
    email,
  });
}

// ============ KYC ============

/**
 * Submit KYC documents for a user
 * @param {string} userId - Martusciello user ID
 * @param {object} documents - KYC documents
 */
async function submitKYC(userId, documents) {
  return callAPI('POST', `/api/v1/users/${userId}/kyc`, {
    documents,
  });
}

/**
 * Get KYC status for a user
 * @param {string} userId - Martusciello user ID
 */
async function getKYCStatus(userId) {
  return callAPI('GET', `/api/v1/users/${userId}/kyc`);
}

// ============ CARDS ============

/**
 * Request a new card for a user
 * @param {string} userId - Martusciello user ID
 * @param {string} cardType - Type of card (virtual/physical)
 */
async function requestCard(userId, cardType) {
  return callAPI('POST', '/api/v1/cards', {
    userId,
    cardType,
  });
}

/**
 * Get card details
 * @param {string} cardId - Card ID
 */
async function getCard(cardId) {
  return callAPI('GET', `/api/v1/cards/${cardId}`);
}

/**
 * Get all cards for a user
 * @param {string} userId - Martusciello user ID
 */
async function getUserCards(userId) {
  return callAPI('GET', `/api/v1/users/${userId}/cards`);
}

/**
 * Set card status (activate, freeze, unfreeze, block)
 * @param {string} cardId - Card ID
 * @param {string} status - New status
 */
async function setCardStatus(cardId, status) {
  return callAPI('PATCH', `/api/v1/cards/${cardId}/status`, {
    status,
  });
}

/**
 * Top up a card
 * @param {string} cardId - Card ID
 * @param {number} amount - Amount to top up
 * @param {string} currency - Currency code (EUR, USD, etc.)
 */
async function topUpCard(cardId, amount, currency) {
  return callAPI('POST', `/api/v1/cards/${cardId}/topup`, {
    amount,
    currency,
  });
}

module.exports = {
  callAPI,
  createUser,
  submitKYC,
  getKYCStatus,
  requestCard,
  getCard,
  getUserCards,
  setCardStatus,
  topUpCard,
};
