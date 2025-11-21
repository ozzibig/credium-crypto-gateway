const { pool } = require('../database/connection');
const { getBalance } = require('./blockchainProvider');
const logger = require('../utils/logger');
const TOKENS = require('../config/tokens');

const MINIMUM_DEPOSIT_USD = parseFloat(process.env.MINIMUM_DEPOSIT_USD || '10');
const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL_SECONDS || '60') * 1000;

let isRunning = false;
let intervalId = null;

async function checkDeposits() {
  try {
    // Get all user wallets
    const result = await pool.query(
      'SELECT id, user_id, network as chain, address FROM user_wallets'
    );
    
    const wallets = result.rows;
    logger.info(`🔍 Checking ${wallets.length} wallets for deposits...`);
    
    for (const wallet of wallets) {
      try {
        await checkWalletDeposits(wallet);
      } catch (error) {
        logger.error(`Error checking wallet ${wallet.address}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error in deposit monitor:', error);
  }
}

async function checkWalletDeposits(wallet) {
  const { id: walletId, user_id, chain, address } = wallet;
  
  // Get token addresses for this network
  const tokens = TOKENS[chain];
  if (!tokens) {
    logger.warn(`No tokens configured for network: ${chain}`);
    return;
  }
  
  // Check USDT balance
  try {
    const usdtBalance = await getBalance(address, chain, tokens.USDT);
    const usdtAmount = parseFloat(usdtBalance);
    
    if (usdtAmount >= MINIMUM_DEPOSIT_USD) {
      await recordDeposit(walletId, user_id, chain, 'USDT', usdtAmount, address);
    }
  } catch (error) {
    logger.error(`Error checking USDT for ${address} on ${chain}:`, error.message);
  }
  
  // Check USDC balance
  try {
    const usdcBalance = await getBalance(address, chain, tokens.USDC);
    const usdcAmount = parseFloat(usdcBalance);
    
    if (usdcAmount >= MINIMUM_DEPOSIT_USD) {
      await recordDeposit(walletId, user_id, chain, 'USDC', usdcAmount, address);
    }
  } catch (error) {
    logger.error(`Error checking USDC for ${address} on ${chain}:`, error.message);
  }
}

async function recordDeposit(walletId, userId, chain, token, amount, toAddress) {
  try {
    // Check if already recorded
    const existing = await pool.query(
      `SELECT id FROM deposits 
       WHERE user_id = $1 AND chain = $2 AND token = $3 AND wallet_address = $4 AND status = 'confirmed'`,
      [userId, chain, token, toAddress]
    );
    
    if (existing.rows.length > 0) {
      return; // Already recorded
    }
    
    // Record new deposit
    await pool.query(
      `INSERT INTO deposits (
        user_id, wallet_address, chain, token, amount, amount_usd, status, detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, toAddress, chain, token, amount, amount, 'confirmed']
    );
    
    logger.info(`💰 New deposit detected: ${amount} ${token} on ${chain} for user ${userId}`);
  } catch (error) {
    logger.error('Error recording deposit:', error);
  }
}

async function start() {
  if (isRunning) {
    logger.warn('Deposit monitor already running');
    return;
  }
  
  isRunning = true;
  logger.info('🚀 Starting deposit monitor...');
  
  // Run immediately
  await checkDeposits();
  
  // Then run on interval
  intervalId = setInterval(checkDeposits, MONITOR_INTERVAL);
  logger.info(`✅ Deposit monitor started (checking every ${MONITOR_INTERVAL/1000}s)`);
}

function stop() {
  if (!isRunning) return;
  
  clearInterval(intervalId);
  isRunning = false;
  logger.info('⏹️  Deposit monitor stopped');
}

function getIsRunning() {
  return isRunning;
}

module.exports = {
  start,
  stop,
  isRunning: getIsRunning
};
