const express = require('express');
const { authenticateSupabaseToken } = require('../middleware/auth');
const { Pool } = require('pg');
const logger = require('../utils/logger');
const walletGenerator = require('../services/walletGenerator');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/wallets/me
router.get('/me', authenticateSupabaseToken, async (req, res) => {
  try {
    const userId = req.user.id; // UUID da Supabase

    logger.info(`Getting wallets for user: ${userId}`);

    // Cerca wallet dell'utente nel database
    const result = await pool.query(
      'SELECT * FROM user_wallets WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Wallets not found'
      });
    }

    res.json({
      success: true,
      wallets: result.rows
    });
  } catch (error) {
    logger.error('Error getting wallets:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// POST /api/wallets/generate
router.post('/generate', authenticateSupabaseToken, async (req, res) => {
  try {
    const userId = req.user.id; // UUID da Supabase
    const userEmail = req.user.email;
    const MASTER_SEED = process.env.MASTER_WALLET_SEED;

    logger.info(`Generating wallet for user: ${userId} (${userEmail})`);

    // Crea utente nella tabella users se non esiste (per foreign key constraint)
    await pool.query(
      `INSERT INTO users (id, email, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [userId, userEmail]
    );

    // Verifica se l'utente ha già un wallet
    const existingWallet = await pool.query(
      'SELECT * FROM user_wallets WHERE user_id = $1',
      [userId]
    );

    if (existingWallet.rows.length > 0) {
      logger.warn(`User ${userId} already has wallets`);

      // Restituisci i wallet esistenti con la struttura attesa dal frontend
      const firstWallet = existingWallet.rows[0];
      const tronWallet = existingWallet.rows.find(w => w.network === 'tron');
      const ethereumWallet = existingWallet.rows.find(w => w.network === 'ethereum');

      // Calcola walletIndex dal derivation_path se disponibile
      const derivationPath = firstWallet.derivation_path || '';
      const walletIndex = derivationPath ? parseInt(derivationPath.split('/').pop()) : 0;

      return res.json({
        message: 'Wallet already exists',
        wallet: {
          id: firstWallet.id.toString(),
          userId: userId,
          walletIndex: walletIndex,
          status: 'active',
          createdAt: firstWallet.created_at.toISOString(),
          updatedAt: firstWallet.created_at.toISOString(),
          tronAddress: tronWallet ? tronWallet.address : null,
          ethereumAddress: ethereumWallet ? ethereumWallet.address : null
        }
      });
    }

    // Genera indice derivazione deterministico da user_id
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(userId).digest();
    const numericId = parseInt(hash.toString('hex').slice(0, 8), 16) % 1000000;

    logger.info(`Derivation index: ${numericId}`);

    // Genera wallet usando walletGenerator
    const generatedWallets = walletGenerator.generateWalletFromSeed(MASTER_SEED, numericId);

    logger.info(`Wallets generated for ${userEmail}`);
    logger.info(`Tron: ${generatedWallets.tron.address}`);
    logger.info(`Ethereum: ${generatedWallets.ethereum.address}`);

    // Salva nel database e ottieni l'id del primo wallet inserito
    const tronWalletResult = await pool.query(
      `INSERT INTO user_wallets (user_id, network, address, derivation_path, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, created_at`,
      [userId, 'tron', generatedWallets.tron.address, generatedWallets.tron.path]
    );

    await pool.query(
      `INSERT INTO user_wallets (user_id, network, address, derivation_path, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, 'ethereum', generatedWallets.ethereum.address, generatedWallets.ethereum.path]
    );

    logger.info(`✅ Wallets saved to database`);

    const walletData = tronWalletResult.rows[0];

    // Struttura JSON attesa dal frontend Lovable
    res.json({
      message: 'Wallet generated successfully',
      wallet: {
        id: walletData.id.toString(),
        userId: userId,
        walletIndex: numericId,
        status: 'active',
        createdAt: walletData.created_at.toISOString(),
        updatedAt: walletData.created_at.toISOString(),
        // Indirizzi wallet - Ethereum supporta sia USDT ERC20 che USDC ERC20
        tronAddress: generatedWallets.tron.address,
        ethereumAddress: generatedWallets.ethereum.address
      }
    });
  } catch (error) {
    logger.error('Error generating wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

module.exports = router;
