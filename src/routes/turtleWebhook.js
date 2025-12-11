const express = require('express');
const router = express.Router();
const { createRemoteJWKSet, jwtVerify } = require('jose');
const config = require('../config/turtle');
const { pool } = require('../database/connection');
const logger = require('../utils/logger');

// Cache JWKS for performance
let jwks = null;

/**
 * Get JWKS (JSON Web Key Set) for signature verification
 */
async function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.JWKS_URL));
  }
  return jwks;
}

/**
 * Verify JWT signature from webhook
 */
async function verifyWebhookSignature(token) {
  const jwksClient = await getJWKS();

  try {
    const { payload } = await jwtVerify(token, jwksClient);
    return { valid: true, payload };
  } catch (error) {
    logger.error(`📡 Turtle Webhook: JWT verification failed - ${error.message}`);
    return { valid: false, error: error.message };
  }
}

/**
 * POST /webhook/turtle
 * Receive webhooks from Turtle
 */
router.post('/turtle', async (req, res) => {
  try {
    // Extract JWT signature from headers
    const signature = req.headers['x-webhook-signature'] ||
                      req.headers['authorization']?.replace('Bearer ', '');

    if (!signature) {
      logger.warn('📡 Turtle Webhook: Missing signature');
      return res.status(401).json({
        success: false,
        error: 'Missing webhook signature',
      });
    }

    // Verify JWT signature
    const verification = await verifyWebhookSignature(signature);
    if (!verification.valid) {
      logger.warn(`📡 Turtle Webhook: Invalid signature - ${verification.error}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
      });
    }

    const { event, data } = req.body;

    logger.info(`📡 Turtle Webhook: Received event=${event}`);
    logger.info(`📡 Turtle Webhook: Data=${JSON.stringify(data)}`);

    // Process event based on type
    switch (event) {
      case 'user.created':
        await handleUserCreated(data);
        break;

      case 'kyc.approved':
        await handleKYCApproved(data);
        break;

      case 'kyc.rejected':
        await handleKYCRejected(data);
        break;

      case 'card.created':
        await handleCardCreated(data);
        break;

      case 'card.transaction':
        await handleCardTransaction(data);
        break;

      case 'topup.completed':
        await handleTopupCompleted(data);
        break;

      default:
        logger.info(`📡 Turtle Webhook: Unknown event type=${event}`);
    }

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error(`📡 Turtle Webhook: Error - ${error.message}`);
    // Return 200 to acknowledge receipt even if processing fails
    // This prevents Turtle from retrying
    res.json({ success: false, error: error.message });
  }
});

// ============ EVENT HANDLERS ============

async function handleUserCreated(data) {
  try {
    const { userId, externalId } = data;

    logger.info(`📡 Turtle Webhook: User created userId=${userId}, externalId=${externalId}`);

    // Update telegram_whitelabel mapping
    await pool.query(
      `INSERT INTO telegram_whitelabel (telegram_id, turtle_user_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (telegram_id)
       DO UPDATE SET turtle_user_id = EXCLUDED.turtle_user_id`,
      [externalId, userId]
    );

    logger.info(`📡 Turtle Webhook: User mapping saved`);
  } catch (error) {
    logger.error(`📡 Turtle Webhook: handleUserCreated error - ${error.message}`);
  }
}

async function handleKYCApproved(data) {
  try {
    const { userId } = data;

    logger.info(`📡 Turtle Webhook: KYC approved for userId=${userId}`);

    // Update kyc_status in profiles
    await pool.query(
      `UPDATE profiles
       SET kyc_status = 'approved', kyc_updated_at = NOW()
       WHERE turtle_user_id = $1`,
      [userId]
    );

    logger.info(`📡 Turtle Webhook: KYC status updated to approved`);
  } catch (error) {
    logger.error(`📡 Turtle Webhook: handleKYCApproved error - ${error.message}`);
  }
}

async function handleKYCRejected(data) {
  try {
    const { userId, reason } = data;

    logger.info(`📡 Turtle Webhook: KYC rejected for userId=${userId}, reason=${reason}`);

    // Update kyc_status in profiles
    await pool.query(
      `UPDATE profiles
       SET kyc_status = 'rejected', kyc_rejection_reason = $2, kyc_updated_at = NOW()
       WHERE turtle_user_id = $1`,
      [userId, reason]
    );

    logger.info(`📡 Turtle Webhook: KYC status updated to rejected`);
  } catch (error) {
    logger.error(`📡 Turtle Webhook: handleKYCRejected error - ${error.message}`);
  }
}

async function handleCardCreated(data) {
  try {
    const { cardId, userId, cardType, lastFourDigits, status } = data;

    logger.info(`📡 Turtle Webhook: Card created cardId=${cardId} for userId=${userId}`);

    // Insert into cards table
    await pool.query(
      `INSERT INTO cards (card_id, turtle_user_id, card_type, last_four_digits, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (card_id)
       DO UPDATE SET status = EXCLUDED.status`,
      [cardId, userId, cardType, lastFourDigits, status]
    );

    logger.info(`📡 Turtle Webhook: Card saved to database`);
  } catch (error) {
    logger.error(`📡 Turtle Webhook: handleCardCreated error - ${error.message}`);
  }
}

async function handleCardTransaction(data) {
  try {
    const { transactionId, cardId, amount, currency, merchantName, status, createdAt } = data;

    logger.info(`📡 Turtle Webhook: Card transaction transactionId=${transactionId}, amount=${amount} ${currency}`);

    // Insert into transactions table
    await pool.query(
      `INSERT INTO transactions (transaction_id, card_id, type, amount, currency, merchant_name, status, created_at)
       VALUES ($1, $2, 'card_transaction', $3, $4, $5, $6, $7)
       ON CONFLICT (transaction_id)
       DO UPDATE SET status = EXCLUDED.status`,
      [transactionId, cardId, amount, currency, merchantName, status, createdAt || new Date()]
    );

    logger.info(`📡 Turtle Webhook: Transaction saved to database`);
  } catch (error) {
    logger.error(`📡 Turtle Webhook: handleCardTransaction error - ${error.message}`);
  }
}

async function handleTopupCompleted(data) {
  try {
    const { transactionId, cardId, amount, currency, status, createdAt } = data;

    logger.info(`📡 Turtle Webhook: Topup completed transactionId=${transactionId}, amount=${amount} ${currency}`);

    // Insert into transactions table
    await pool.query(
      `INSERT INTO transactions (transaction_id, card_id, type, amount, currency, status, created_at)
       VALUES ($1, $2, 'topup', $3, $4, $5, $6)
       ON CONFLICT (transaction_id)
       DO UPDATE SET status = EXCLUDED.status`,
      [transactionId, cardId, amount, currency, status, createdAt || new Date()]
    );

    logger.info(`📡 Turtle Webhook: Topup transaction saved to database`);
  } catch (error) {
    logger.error(`📡 Turtle Webhook: handleTopupCompleted error - ${error.message}`);
  }
}

module.exports = router;
