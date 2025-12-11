const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, testConnection } = require('./database/connection');
const { autoSetupDatabase } = require('./database/autoSetup');
const { authenticateSupabaseToken } = require('./middleware/auth');
const depositMonitor = require('./services/depositMonitor');
const sweepEngine = require('./services/sweepEngine');
const logger = require('./utils/logger');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parser with size limit
app.use(express.json({ limit: '10mb' }));

// General rate limiting: 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for wallet generation: 5 requests per hour
const walletGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 wallet generations per hour
  message: 'Too many wallet generation requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiter to all routes
app.use(generalLimiter);

// Webhook routes (public, no auth needed)
const webhookRoutes = require('./routes/webhook');
const turtleWebhookRoutes = require('./routes/turtleWebhook');
app.use('/webhook', webhookRoutes);
app.use('/webhook', turtleWebhookRoutes);

// Public routes (no auth)
app.get('/health', async (req, res) => {
  try {
    // Test connessione database senza crashare
    let dbConnected = false;
    try {
      const result = await pool.query('SELECT 1');
      dbConnected = result ? true : false;
    } catch (dbError) {
      dbConnected = false;
    }

    const depositMonitorRunning = typeof depositMonitor.isRunning === 'function'
      ? depositMonitor.isRunning()
      : false;
    const sweepEngineRunning = typeof sweepEngine.isRunning === 'function'
      ? sweepEngine.isRunning()
      : false;

    res.json({
      status: 'ok',
      mode: dbConnected ? 'full' : 'limited (chatbot only)',
      timestamp: new Date().toISOString(),
      services: {
        api: 'running',
        database: dbConnected ? 'connected' : 'disconnected',
        telegramChatbot: 'active',
        depositMonitor: depositMonitorRunning ? 'running' : 'stopped',
        sweepEngine: sweepEngineRunning ? 'running' : 'stopped'
      },
      config: {
        minimumDeposit: process.env.MINIMUM_DEPOSIT_USD,
        monitorInterval: process.env.MONITOR_INTERVAL_SECONDS,
        autoSweep: process.env.AUTO_SWEEP_ENABLED
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Apply authentication to all /api routes
app.use('/api', authenticateSupabaseToken);

// Protected routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/telegram', require('./routes/telegram'));
app.use('/api/turtle', require('./routes/turtle'));

// Wallets routes with strict rate limiting
const walletsRouter = require('./routes/wallets');
walletsRouter.post('/generate', walletGenerationLimiter); // Apply strict limiter to wallet generation
app.use('/api/wallets', walletsRouter);

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Tenta connessione database con retry
    const dbConnected = await testConnection();

    if (!dbConnected) {
      logger.warn('⚠️ Database connection failed');
      logger.warn('⚠️ Server starting in LIMITED MODE (chatbot only)');
      logger.warn('⚠️ Wallet and payment features will not work');
      logger.warn('⚠️ Please configure DATABASE_URL environment variable');
      // NON uscire - continua senza database
    } else {
      // Database connesso - esegui setup
      await autoSetupDatabase();
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info(`✅ Telecard Crypto Gateway running on port ${PORT}`);
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info(`📡 API: http://localhost:${PORT}`);
      logger.info(`💚 Health: http://localhost:${PORT}/health`);
      logger.info(`🤖 Telegram Webhook: http://localhost:${PORT}/webhook/telegram`);
      logger.info(`🔐 Auth: http://localhost:${PORT}/api/auth/me`);
      logger.info(`💰 Wallets: http://localhost:${PORT}/api/wallets`);
      logger.info(`💳 Turtle: http://localhost:${PORT}/api/turtle`);
      logger.info(`📡 Turtle Webhook: http://localhost:${PORT}/webhook/turtle`);
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Avvia servizi solo se il database è connesso
      if (dbConnected) {
        setTimeout(() => {
          logger.info('🚀 Starting deposit monitor...');
          depositMonitor.start();
          logger.info('✅ Deposit monitor initialization complete');
        }, 3000);

        if (process.env.AUTO_SWEEP_ENABLED === 'true') {
          setTimeout(() => {
            logger.info('💸 Starting sweep engine...');
            sweepEngine.start();
          }, 4000);
        }
      } else {
        logger.info('⚠️ Deposit monitor and sweep engine DISABLED (no database)');
        logger.info('✅ Telegram chatbot is ACTIVE and working');
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  depositMonitor.stop();
  sweepEngine.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  depositMonitor.stop();
  sweepEngine.stop();
  process.exit(0);
});

startServer();
