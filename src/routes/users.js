const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { generateWalletFromSeed } = require('../services/walletGenerator');
const logger = require('../utils/logger');

const MASTER_SEED = process.env.MASTER_WALLET_SEED;

router.post('/register', async (req, res) => {
  try {
    const { user_id, email, full_name } = req.body;

    if (!user_id || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'user_id and email are required' 
      });
    }

    logger.info(`📝 Generating wallets for user: ${user_id} (${email})`);

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(user_id).digest();
    const numericId = parseInt(hash.toString('hex').slice(0, 8), 16) % 1000000;
    
    logger.info(`   Derivation index: ${numericId}`);

    const wallets = generateWalletFromSeed(MASTER_SEED, numericId);
    
    logger.info(`🔑 Wallets generated for ${email}`);
    logger.info(`   Tron: ${wallets.tron.address}`);
    logger.info(`   Ethereum: ${wallets.ethereum.address}`);

    try {
      await pool.query(
        `INSERT INTO user_wallets (user_id, network, address, derivation_path, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, network) 
         DO UPDATE SET address = EXCLUDED.address`,
        [user_id, 'tron', wallets.tron.address, wallets.tron.path]
      );

      await pool.query(
        `INSERT INTO user_wallets (user_id, network, address, derivation_path, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, network)
         DO UPDATE SET address = EXCLUDED.address`,
        [user_id, 'ethereum', wallets.ethereum.address, wallets.ethereum.path]
      );

      logger.info(`✅ Wallets saved to Gateway database`);
    } catch (dbError) {
      logger.error(`⚠️ Database save error (non-critical): ${dbError.message}`);
    }

    res.json({
      success: true,
      user_id: user_id,
      tron_address: wallets.tron.address,
      ethereum_address: wallets.ethereum.address,
      derivation_index: numericId,
      wallets: {
        tron: {
          address: wallets.tron.address,
          network: 'tron',
          crypto: 'USDT',
          network_name: 'TRC20'
        },
        ethereum: {
          address: wallets.ethereum.address,
          network: 'ethereum',
          crypto: 'USDT, USDC',
          network_name: 'Ethereum (ERC20)'
        }
      }
    });

    logger.info(`✅ Wallets registered for ${email}`);

  } catch (error) {
    logger.error(`❌ Error generating wallets: ${error.message}`);
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate wallets',
      details: error.message 
    });
  }
});

router.get('/:userId/wallets', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT network, address, created_at 
       FROM user_wallets 
       WHERE user_id = $1 
       ORDER BY network`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'User wallets not found' 
      });
    }

    const wallets = {};
    result.rows.forEach(row => {
      wallets[row.network] = {
        address: row.address,
        network: row.network,
        created_at: row.created_at
      };
    });

    res.json({
      success: true,
      user_id: userId,
      wallets
    });

  } catch (error) {
    logger.error(`Error fetching wallets: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch wallets' 
    });
  }
});

module.exports = router;
