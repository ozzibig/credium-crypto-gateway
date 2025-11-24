const express = require('express');
const axios = require('axios');
const { generateResponse } = require('../services/chatbot');
const logger = require('../utils/logger');
require('dotenv').config();

const router = express.Router();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Endpoint webhook per ricevere messaggi da Telegram
 * POST /webhook/telegram
 */
router.post('/telegram', async (req, res) => {
  try {
    const update = req.body;

    // Ignora update senza messaggio o senza testo (foto, sticker, ecc.)
    if (!update.message || !update.message.text) {
      return res.sendStatus(200);
    }

    // Estrai informazioni dal messaggio
    const chatId = update.message.chat.id;
    const userId = update.message.from.id;
    const firstName = update.message.from.first_name || 'Utente';
    const username = update.message.from.username || null;
    const userMessage = update.message.text;

    // Log del messaggio ricevuto
    logger.info(`=é Messaggio da ${firstName} (${userId}): ${userMessage}`);

    // Costruisci il contesto utente per il chatbot
    const userContext = {
      firstName,
      username,
      userId
    };

    // Genera risposta intelligente con Claude AI
    const botResponse = await generateResponse(userMessage, userContext);

    // Log della risposta (primi 100 caratteri)
    const responsePreview = botResponse.length > 100
      ? botResponse.substring(0, 100) + '...'
      : botResponse;
    logger.info(`> Risposta: ${responsePreview}`);

    // Invia risposta via Telegram API
    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: botResponse,
      parse_mode: 'Markdown'
    });

    // Conferma ricezione a Telegram
    res.sendStatus(200);

  } catch (error) {
    logger.error('L Errore nel webhook Telegram:', error.message);

    // Cerca di inviare un messaggio di errore all'utente
    if (req.body?.message?.chat?.id) {
      try {
        await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
          chat_id: req.body.message.chat.id,
          text: 'Mi dispiace, sto avendo problemi tecnici. Riprova tra poco o contatta support@credium.app per assistenza.',
          parse_mode: 'Markdown'
        });
      } catch (sendError) {
        logger.error('L Impossibile inviare messaggio di errore:', sendError.message);
      }
    }

    // Conferma comunque ricezione a Telegram per evitare retry
    res.sendStatus(200);
  }
});

/**
 * Health check per il webhook
 * GET /webhook/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Telegram Webhook',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
