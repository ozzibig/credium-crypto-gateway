const axios = require('axios');
const { pool } = require('../database/connection');
const logger = require('../utils/logger');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Messaggi tradotti per le notifiche
const MESSAGES = {
  kyc_approved: {
    it: '📋 Il tuo KYC è stato **approvato**\n✅ Ora puoi attivare la tua carta!',
    en: '📋 Your KYC has been **approved**\n✅ You can now activate your card!',
    es: '📋 Tu KYC ha sido **aprobado**\n✅ ¡Ahora puedes activar tu tarjeta!',
    fr: '📋 Votre KYC a été **approuvé**\n✅ Vous pouvez maintenant activer votre carte!',
    de: '📋 Ihr KYC wurde **genehmigt**\n✅ Sie können jetzt Ihre Karte aktivieren!',
    pt: '📋 Seu KYC foi **aprovado**\n✅ Agora você pode ativar seu cartão!'
  },
  kyc_rejected: {
    it: '📋 Il tuo KYC è stato **rifiutato**',
    en: '📋 Your KYC has been **rejected**',
    es: '📋 Tu KYC ha sido **rechazado**',
    fr: '📋 Votre KYC a été **rejeté**',
    de: '📋 Ihr KYC wurde **abgelehnt**',
    pt: '📋 Seu KYC foi **rejeitado**'
  },
  kyc_rejected_reason: {
    it: '\nMotivo: ',
    en: '\nReason: ',
    es: '\nMotivo: ',
    fr: '\nRaison: ',
    de: '\nGrund: ',
    pt: '\nMotivo: '
  },
  kyc_pending: {
    it: '📋 Il tuo KYC è **in revisione**\n⏳ Ti avviseremo quando sarà completato.',
    en: '📋 Your KYC is **under review**\n⏳ We will notify you when completed.',
    es: '📋 Tu KYC está **en revisión**\n⏳ Te avisaremos cuando esté completado.',
    fr: '📋 Votre KYC est **en cours de révision**\n⏳ Nous vous informerons une fois terminé.',
    de: '📋 Ihr KYC wird **überprüft**\n⏳ Wir benachrichtigen Sie, wenn es abgeschlossen ist.',
    pt: '📋 Seu KYC está **em revisão**\n⏳ Avisaremos quando estiver concluído.'
  },
  card_spend: {
    it: '💳 Spesa di **{amount}** presso {merchant}',
    en: '💳 Purchase of **{amount}** at {merchant}',
    es: '💳 Gasto de **{amount}** en {merchant}',
    fr: '💳 Achat de **{amount}** chez {merchant}',
    de: '💳 Ausgabe von **{amount}** bei {merchant}',
    pt: '💳 Compra de **{amount}** em {merchant}'
  },
  card_balance: {
    it: '\n💰 Saldo rimanente: **{balance}€**',
    en: '\n💰 Remaining balance: **{balance}€**',
    es: '\n💰 Saldo restante: **{balance}€**',
    fr: '\n💰 Solde restant: **{balance}€**',
    de: '\n💰 Verbleibendes Guthaben: **{balance}€**',
    pt: '\n💰 Saldo restante: **{balance}€**'
  },
  card_declined: {
    it: '❌ Transazione di **{amount}** non riuscita\nMotivo: fondi insufficienti. Saldo attuale: **{balance}€**',
    en: '❌ Transaction of **{amount}** failed\nReason: insufficient funds. Current balance: **{balance}€**',
    es: '❌ Transacción de **{amount}** fallida\nMotivo: fondos insuficientes. Saldo actual: **{balance}€**',
    fr: '❌ Transaction de **{amount}** échouée\nRaison: fonds insuffisants. Solde actuel: **{balance}€**',
    de: '❌ Transaktion von **{amount}** fehlgeschlagen\nGrund: unzureichendes Guthaben. Aktueller Kontostand: **{balance}€**',
    pt: '❌ Transação de **{amount}** falhou\nMotivo: fundos insuficientes. Saldo atual: **{balance}€**'
  },
  deposit_received: {
    it: '💰 Deposito ricevuto: **{amount} {token}**',
    en: '💰 Deposit received: **{amount} {token}**',
    es: '💰 Depósito recibido: **{amount} {token}**',
    fr: '💰 Dépôt reçu: **{amount} {token}**',
    de: '💰 Einzahlung erhalten: **{amount} {token}**',
    pt: '💰 Depósito recebido: **{amount} {token}**'
  },
  deposit_balance: {
    it: '\n💼 Saldo totale: **{balance} {token}**',
    en: '\n💼 Total balance: **{balance} {token}**',
    es: '\n💼 Saldo total: **{balance} {token}**',
    fr: '\n💼 Solde total: **{balance} {token}**',
    de: '\n💼 Gesamtguthaben: **{balance} {token}**',
    pt: '\n💼 Saldo total: **{balance} {token}**'
  }
};

const DEFAULT_LANG = 'it';

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
 * Ottiene il telegram_id e la lingua dal turtle_user_id
 * @param {string} turtleUserId - ID utente Turtle
 * @returns {Promise<{telegramId: string|null, lang: string}>}
 */
async function getTelegramIdFromTurtle(turtleUserId) {
  try {
    const result = await pool.query(
      `SELECT tw.telegram_id, u.language_code
       FROM telegram_whitelabel tw
       LEFT JOIN users u ON u.telegram_id = tw.telegram_id
       WHERE tw.turtle_user_id = $1`,
      [turtleUserId]
    );
    return {
      telegramId: result.rows[0]?.telegram_id || null,
      lang: result.rows[0]?.language_code || DEFAULT_LANG
    };
  } catch (error) {
    logger.error(`🔔 Error getting telegram_id: ${error.message}`);
    return { telegramId: null, lang: DEFAULT_LANG };
  }
}

/**
 * Ottiene il telegram_id e la lingua dall'user_id
 * @param {string} userId - ID utente
 * @returns {Promise<{telegramId: string|null, lang: string}>}
 */
async function getTelegramIdFromUser(userId) {
  try {
    const result = await pool.query(
      'SELECT telegram_id, language_code FROM users WHERE id = $1',
      [userId]
    );
    return {
      telegramId: result.rows[0]?.telegram_id || null,
      lang: result.rows[0]?.language_code || DEFAULT_LANG
    };
  } catch (error) {
    logger.error(`🔔 Error getting telegram_id: ${error.message}`);
    return { telegramId: null, lang: DEFAULT_LANG };
  }
}

/**
 * Helper per ottenere un messaggio tradotto
 * @param {string} key - Chiave del messaggio
 * @param {string} lang - Codice lingua
 * @returns {string} - Messaggio tradotto
 */
function getMessage(key, lang) {
  return MESSAGES[key]?.[lang] || MESSAGES[key]?.[DEFAULT_LANG] || '';
}

// ============ NOTIFICHE SPECIFICHE ============

/**
 * Notifica KYC approvato
 */
async function notifyKYCApproved(turtleUserId) {
  const { telegramId, lang } = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const message = getMessage('kyc_approved', lang);
  return sendNotification(telegramId, message);
}

/**
 * Notifica KYC rifiutato
 */
async function notifyKYCRejected(turtleUserId, reason) {
  const { telegramId, lang } = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  let message = getMessage('kyc_rejected', lang);
  if (reason) {
    message += getMessage('kyc_rejected_reason', lang) + reason;
  }
  return sendNotification(telegramId, message);
}

/**
 * Notifica KYC in revisione
 */
async function notifyKYCPending(turtleUserId) {
  const { telegramId, lang } = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const message = getMessage('kyc_pending', lang);
  return sendNotification(telegramId, message);
}

/**
 * Notifica spesa con carta riuscita
 */
async function notifyCardSpend(turtleUserId, amount, currency, merchantName, balance) {
  const { telegramId, lang } = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const amountDisplay = currency === 'EUR' ? `${amount}€` : `${amount} ${currency}`;
  let message = getMessage('card_spend', lang)
    .replace('{amount}', amountDisplay)
    .replace('{merchant}', merchantName || 'merchant');

  if (balance !== undefined) {
    message += getMessage('card_balance', lang).replace('{balance}', balance);
  }
  return sendNotification(telegramId, message);
}

/**
 * Notifica transazione non riuscita (fondi insufficienti)
 */
async function notifyCardDeclined(turtleUserId, amount, currency, balance) {
  const { telegramId, lang } = await getTelegramIdFromTurtle(turtleUserId);
  if (!telegramId) return false;

  const amountDisplay = currency === 'EUR' ? `${amount}€` : `${amount} ${currency}`;
  const message = getMessage('card_declined', lang)
    .replace('{amount}', amountDisplay)
    .replace('{balance}', balance);

  return sendNotification(telegramId, message);
}

/**
 * Notifica deposito crypto ricevuto
 */
async function notifyDepositReceived(userId, amount, token, totalBalance) {
  const { telegramId, lang } = await getTelegramIdFromUser(userId);
  if (!telegramId) return false;

  let message = getMessage('deposit_received', lang)
    .replace('{amount}', amount)
    .replace('{token}', token);

  if (totalBalance !== undefined) {
    message += getMessage('deposit_balance', lang)
      .replace('{balance}', totalBalance)
      .replace('{token}', token);
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
