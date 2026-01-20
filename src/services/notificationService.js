const axios = require('axios');
const { pool } = require('../database/connection');
const logger = require('../utils/logger');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Invia una notifica Telegram all'utente
 * @param {string|number} telegramId - ID Telegram dell'utente
 * @param {string} message - Messaggio da inviare (supporta Markdown)
 * @returns {Promise<boolean>} - true se inviato, false se errore
 */
async function sendNotification(telegramId, message) {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      logger.warn('🔔 Notification skipped: TELEGRAM_BOT_TOKEN not configured');
      return false;
    }

    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: telegramId,
      text: message,
      parse_mode: 'Markdown'
    });

    logger.info(`🔔 Notification sent to ${telegramId}`);
    return true;
  } catch (error) {
    // Gestisci caso utente ha bloccato il bot
    if (error.response?.data?.error_code === 403) {
      logger.warn(`🔔 User ${telegramId} has blocked the bot`);
    } else {
      logger.error(`🔔 Notification error: ${error.message}`);
    }
    return false;
  }
}

/**
 * Ottiene il telegram_id dal turtle_user_id
 * @param {string} turtleUserId - ID utente Turtle
 * @returns {Promise<string|null>} - telegram_id o null
 */
async function getTelegramIdFromTurtle(turtleUserId) {
  try {
    const result = await pool.query(
      'SELECT telegram_id FROM telegram_whitelabel WHERE turtle_user_id = $1',
      [turtleUserId]
    );
    return result.rows[0]?.telegram_id || null;
  } catch (error) {
    logger.error(`🔔 Error getting telegram_id: ${error.message}`);
    return null;
  }
}

/**
 * Ottiene il telegram_id dall'user_id
 * @param {string} userId - ID utente
 * @returns {Promise<string|null>} - telegram_id o null
 */
async function getTelegramIdFromUser(userId) {
  try {
    const result = await pool.query(
      'SELECT telegram_id FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.telegram_id || null;
  } catch (error) {
    logger.error(`🔔 Error getting telegram_id: ${error.message}`);
    return null;
  }
}

// ============ NOTIFICHE SPECIFICHE ============

/**
 * Notifica KYC approvato
 */
async function notifyKYCApproved(turtleUserId) {
  const telegramId = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const message = `📋 Il tuo KYC è stato **approvato**\n✅ Ora puoi attivare la tua carta!`;
  return sendNotification(telegramId, message);
}

/**
 * Notifica KYC rifiutato
 */
async function notifyKYCRejected(turtleUserId, reason) {
  const telegramId = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  let message = `📋 Il tuo KYC è stato **rifiutato**`;
  if (reason) {
    message += `\nMotivo: ${reason}`;
  }
  return sendNotification(telegramId, message);
}

/**
 * Notifica KYC in revisione
 */
async function notifyKYCPending(turtleUserId) {
  const telegramId = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const message = `📋 Il tuo KYC è **in revisione**\n⏳ Ti avviseremo quando sarà completato.`;
  return sendNotification(telegramId, message);
}

/**
 * Notifica spesa con carta riuscita
 */
async function notifyCardSpend(turtleUserId, amount, currency, merchantName, balance) {
  const telegramId = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const amountDisplay = currency === 'EUR' ? `${amount}€` : `${amount} ${currency}`;
  let message = `💳 Spesa di **${amountDisplay}** presso ${merchantName || 'merchant'}`;
  if (balance !== undefined) {
    message += `\n💰 Saldo rimanente: **${balance}€**`;
  }
  return sendNotification(telegramId, message);
}

/**
 * Notifica transazione non riuscita (fondi insufficienti)
 */
async function notifyCardDeclined(turtleUserId, amount, currency, balance) {
  const telegramId = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const amountDisplay = currency === 'EUR' ? `${amount}€` : `${amount} ${currency}`;
  const message = `❌ Transazione di **${amountDisplay}** non riuscita\nMotivo: fondi insufficienti. Saldo attuale: **${balance}€**`;
  return sendNotification(telegramId, message);
}

/**
 * Notifica deposito crypto ricevuto
 */
async function notifyDepositReceived(userId, amount, token, totalBalance) {
  const telegramId = await getTelegramIdFromUser(userId);
  if (!telegramId) return false;

  let message = `💰 Deposito ricevuto: **${amount} ${token}**`;
  if (totalBalance !== undefined) {
    message += `\n💼 Saldo totale: **${totalBalance} ${token}**`;
  }
  return sendNotification(telegramId, message);
}

module.exports = {
  sendNotification,
  getTelegramIdFromTurtle,
  getTelegramIdFromUser,
  notifyKYCApproved,
  notifyKYCRejected,
  notifyKYCPending,
  notifyCardSpend,
  notifyCardDeclined,
  notifyDepositReceived
};
