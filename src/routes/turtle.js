const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
  createUser,
  submitKYC,
  getKYCStatus,
  requestCard,
  getCard,
  getUserCards,
  setCardStatus,
  topUpCard,
} = require('../services/turtleClient');

// ============ USERS ============

/**
 * POST /api/turtle/users
 * Create a new user in Turtle
 */
router.post('/users', async (req, res) => {
  try {
    const { telegramId, email } = req.body;

    if (!telegramId || !email) {
      return res.status(400).json({
        success: false,
        error: 'telegramId and email are required',
      });
    }

    logger.info(`📡 Turtle: Creating user for telegramId=${telegramId}`);

    const result = await createUser(telegramId, email);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Create user failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ KYC ============

/**
 * POST /api/turtle/kyc/submit
 * Submit KYC documents for a user
 */
router.post('/kyc/submit', async (req, res) => {
  try {
    const { userId, documents } = req.body;

    if (!userId || !documents) {
      return res.status(400).json({
        success: false,
        error: 'userId and documents are required',
      });
    }

    logger.info(`📡 Turtle: Submitting KYC for userId=${userId}`);

    const result = await submitKYC(userId, documents);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Submit KYC failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/turtle/kyc/:userId/status
 * Get KYC status for a user
 */
router.get('/kyc/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info(`📡 Turtle: Getting KYC status for userId=${userId}`);

    const result = await getKYCStatus(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Get KYC status failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ CARDS ============

/**
 * POST /api/turtle/cards
 * Request a new card for a user
 */
router.post('/cards', async (req, res) => {
  try {
    const { userId, cardType } = req.body;

    if (!userId || !cardType) {
      return res.status(400).json({
        success: false,
        error: 'userId and cardType are required',
      });
    }

    logger.info(`📡 Turtle: Requesting card for userId=${userId}, type=${cardType}`);

    const result = await requestCard(userId, cardType);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Request card failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/turtle/cards/:cardId
 * Get card details
 */
router.get('/cards/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;

    logger.info(`📡 Turtle: Getting card cardId=${cardId}`);

    const result = await getCard(cardId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Get card failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/turtle/users/:userId/cards
 * Get all cards for a user
 */
router.get('/users/:userId/cards', async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info(`📡 Turtle: Getting cards for userId=${userId}`);

    const result = await getUserCards(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Get user cards failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PATCH /api/turtle/cards/:cardId/status
 * Set card status
 */
router.patch('/cards/:cardId/status', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required',
      });
    }

    logger.info(`📡 Turtle: Setting card status cardId=${cardId}, status=${status}`);

    const result = await setCardStatus(cardId, status);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Set card status failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/turtle/cards/:cardId/topup
 * Top up a card
 */
router.post('/cards/:cardId/topup', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'amount and currency are required',
      });
    }

    logger.info(`📡 Turtle: Topping up cardId=${cardId}, amount=${amount} ${currency}`);

    const result = await topUpCard(cardId, amount, currency);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`📡 Turtle: Top up card failed - ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
