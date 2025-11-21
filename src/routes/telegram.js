const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { verifyTelegramAuth, parseTelegramUser, generateReferralCode } = require('../services/telegramAuth');
const { generateWalletFromSeed } = require('../services/walletGenerator');
const logger = require('../utils/logger');

router.post('/auth', async (req, res) => {
  try {
    const { initData, referralCode } = req.body;
    
    if (!verifyTelegramAuth(initData)) {
      return res.status(401).json({ success: false, error: 'Invalid authentication' });
    }
    
    const telegramUser = parseTelegramUser(initData);
    if (!telegramUser) {
      return res.status(400).json({ success: false, error: 'User data not found' });
    }
    
    let userResult = await pool.query(
      'SELECT id, email, full_name, referral_code FROM users WHERE telegram_id = $1',
      [telegramUser.id]
    );
    
    let userId;
    let isNewUser = false;
    
    if (userResult.rows.length === 0) {
      isNewUser = true;
      const email = `telegram_${telegramUser.id}@credium.app`;
      const fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim();
      const userReferralCode = generateReferralCode(telegramUser.id);
      
      let referrerId = null;
      if (referralCode) {
        const referrerResult = await pool.query(
          'SELECT id FROM users WHERE referral_code = $1',
          [referralCode]
        );
        if (referrerResult.rows.length > 0) {
          referrerId = referrerResult.rows[0].id;
        }
      }
      
      userResult = await pool.query(
        'INSERT INTO users (email, full_name, telegram_id, telegram_username, referral_code, referred_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, referral_code',
        [email, fullName, telegramUser.id, telegramUser.username, userReferralCode, referrerId]
      );
      
      userId = userResult.rows[0].id;
      
      const seed = process.env.MASTER_WALLET_SEED;
      const wallets = generateWalletFromSeed(seed, userId);
      
      for (const [network, wallet] of Object.entries(wallets)) {
        await pool.query(
          'INSERT INTO user_wallets (user_id, network, address, derivation_path) VALUES ($1, $2, $3, $4)',
          [userId, network, wallet.address, wallet.path]
        );
      }
      
      logger.info(`✅ Created Credium user ${userId} (@${telegramUser.username})`);
    } else {
      userId = userResult.rows[0].id;
    }
    
    const walletsResult = await pool.query(
      'SELECT network, address FROM user_wallets WHERE user_id = $1',
      [userId]
    );
    
    const wallets = {};
    walletsResult.rows.forEach(w => {
      wallets[w.network] = {
        address: w.address,
        network: w.network.charAt(0).toUpperCase() + w.network.slice(1),
        token_support: ['USDT', 'USDC']
      };
    });
    
    const balanceResult = await pool.query(
      `SELECT SUM(amount_usd) as total FROM deposits WHERE user_id = $1 AND status = 'confirmed' AND swept_at IS NULL`,
      [userId]
    );
    
    const balance = parseFloat(balanceResult.rows[0].total || 0);
    
    res.json({
      success: true,
      isNewUser,
      user: {
        id: userId,
        telegram_id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
        referral_code: userResult.rows[0].referral_code
      },
      wallets,
      balance: { total_usd: balance }
    });
    
  } catch (error) {
    logger.error('Telegram auth error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
