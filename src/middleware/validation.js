/**
 * Input Validation Middleware
 * Validates request data to prevent malicious input and ensure data integrity
 */

const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Validation middleware for wallet generation
 * Validates user_id (UUID format) and email (valid email)
 */
const validateWalletGeneration = [
  body('user_id')
    .trim()
    .notEmpty()
    .withMessage('user_id is required')
    .isUUID()
    .withMessage('user_id must be a valid UUID'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('email is required')
    .isEmail()
    .withMessage('email must be a valid email address')
    .normalizeEmail(),

  body('full_name')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('full_name must be less than 255 characters'),

  // Validation result handler
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }));

      logger.warn('Validation failed for wallet generation:', errorMessages);

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errorMessages
      });
    }

    next();
  }
];

/**
 * Validation middleware for deposit creation
 * Validates amount, crypto, and network
 */
const validateDeposit = [
  body('amount')
    .notEmpty()
    .withMessage('amount is required')
    .isFloat({ min: 0.000001 })
    .withMessage('amount must be a positive number'),

  body('crypto')
    .trim()
    .notEmpty()
    .withMessage('crypto is required')
    .toUpperCase()
    .isIn(['USDT', 'USDC'])
    .withMessage('crypto must be either USDT or USDC'),

  body('network')
    .trim()
    .notEmpty()
    .withMessage('network is required')
    .toUpperCase()
    .isIn(['TRC20', 'ERC20'])
    .withMessage('network must be either TRC20 or ERC20'),

  body('tx_hash')
    .optional()
    .trim()
    .isLength({ min: 32, max: 128 })
    .withMessage('tx_hash must be between 32 and 128 characters'),

  body('from_address')
    .optional()
    .trim()
    .isLength({ min: 26, max: 64 })
    .withMessage('from_address must be a valid blockchain address'),

  body('wallet_address')
    .trim()
    .notEmpty()
    .withMessage('wallet_address is required')
    .isLength({ min: 26, max: 64 })
    .withMessage('wallet_address must be a valid blockchain address'),

  // Validation result handler
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }));

      logger.warn('Validation failed for deposit:', errorMessages);

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errorMessages
      });
    }

    next();
  }
];

/**
 * Validation middleware for user registration
 * Validates user_id and email
 */
const validateUserRegistration = [
  body('user_id')
    .trim()
    .notEmpty()
    .withMessage('user_id is required')
    .isUUID()
    .withMessage('user_id must be a valid UUID'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('email is required')
    .isEmail()
    .withMessage('email must be a valid email address')
    .normalizeEmail(),

  body('full_name')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('full_name must be less than 255 characters'),

  // Validation result handler
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }));

      logger.warn('Validation failed for user registration:', errorMessages);

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errorMessages
      });
    }

    next();
  }
];

/**
 * Generic sanitization for text inputs
 * Removes potentially dangerous characters
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return text;

  // Remove null bytes, control characters, and excessive whitespace
  return text
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

module.exports = {
  validateWalletGeneration,
  validateDeposit,
  validateUserRegistration,
  sanitizeText
};
