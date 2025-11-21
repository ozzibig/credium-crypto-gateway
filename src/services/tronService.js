/**
 * Tron Blockchain Service
 * Handles all Tron network interactions (TRX, USDT TRC20)
 */

const TronWeb = require('tronweb');
const logger = require('../utils/logger');

// Tron RPC configuration
const TRON_RPC_URL = process.env.TRON_RPC_URL || 'https://api.trongrid.io';
const TRON_API_KEY = process.env.TRON_API_KEY || '';

// USDT TRC20 contract address (Tron mainnet)
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Initialize TronWeb
const tronWeb = new TronWeb({
  fullHost: TRON_RPC_URL,
  headers: TRON_API_KEY ? { 'TRON-PRO-API-KEY': TRON_API_KEY } : {},
});

logger.info(`🔗 TronWeb initialized: ${TRON_RPC_URL}`);

/**
 * Clean and validate private key format
 * @param {string} privateKey - Raw private key
 * @returns {string} Cleaned private key (no 0x prefix)
 */
function cleanPrivateKey(privateKey) {
  if (!privateKey) {
    throw new Error('Private key is required');
  }

  // Remove 0x prefix if present
  let cleaned = privateKey.trim();
  if (cleaned.startsWith('0x') || cleaned.startsWith('0X')) {
    cleaned = cleaned.slice(2);
  }

  // Validate length (64 hex characters)
  if (cleaned.length !== 64) {
    throw new Error(`Invalid private key length: ${cleaned.length} (expected 64)`);
  }

  // Validate hex format
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error('Invalid private key format: must be 64 hex characters');
  }

  return cleaned;
}

/**
 * Get TRX balance of an address
 * @param {string} address - Tron address
 * @returns {Promise<number>} Balance in TRX
 */
async function getTRXBalance(address) {
  try {
    const balance = await tronWeb.trx.getBalance(address);
    const balanceTRX = tronWeb.fromSun(balance);
    return parseFloat(balanceTRX);
  } catch (error) {
    logger.error(`Error getting TRX balance for ${address}:`, error.message);
    throw error;
  }
}

/**
 * Get USDT TRC20 balance of an address
 * @param {string} address - Tron address
 * @returns {Promise<number>} Balance in USDT
 */
async function getUSDTBalance(address) {
  try {
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    const balance = await contract.balanceOf(address).call();

    // USDT has 6 decimals on Tron
    const balanceUSDT = balance.toNumber() / 1e6;
    return balanceUSDT;
  } catch (error) {
    logger.error(`Error getting USDT balance for ${address}:`, error.message);
    throw error;
  }
}

/**
 * Send TRX from one address to another
 * @param {string} fromPrivateKey - Sender's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amountTRX - Amount in TRX
 * @returns {Promise<object>} Transaction result
 */
async function sendTRX(fromPrivateKey, toAddress, amountTRX) {
  try {
    const cleanedKey = cleanPrivateKey(fromPrivateKey);
    const fromAddress = tronWeb.address.fromPrivateKey(cleanedKey);

    logger.info(`💸 Sending ${amountTRX} TRX from ${fromAddress} to ${toAddress}`);

    // Set private key
    tronWeb.setPrivateKey(cleanedKey);

    // Convert TRX to SUN (1 TRX = 1,000,000 SUN)
    const amountSUN = tronWeb.toSun(amountTRX);

    // Send transaction
    const transaction = await tronWeb.trx.sendTransaction(
      toAddress,
      amountSUN
    );

    const txHash = transaction.txid || transaction.transaction?.txID;

    logger.info(`✅ TRX sent successfully!`);
    logger.info(`   From: ${fromAddress}`);
    logger.info(`   To: ${toAddress}`);
    logger.info(`   Amount: ${amountTRX} TRX`);
    logger.info(`   TX Hash: ${txHash}`);

    return {
      success: true,
      txHash: txHash,
      amount: amountTRX,
      from: fromAddress,
      to: toAddress,
    };

  } catch (error) {
    logger.error(`❌ Error sending TRX:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send USDT TRC20 from one address to another
 * @param {string} fromPrivateKey - Sender's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amountUSDT - Amount in USDT
 * @returns {Promise<object>} Transaction result
 */
async function sendUSDT(fromPrivateKey, toAddress, amountUSDT) {
  try {
    const cleanedKey = cleanPrivateKey(fromPrivateKey);
    const fromAddress = tronWeb.address.fromPrivateKey(cleanedKey);

    logger.info(`💵 Sending ${amountUSDT} USDT from ${fromAddress} to ${toAddress}`);

    // Set private key
    tronWeb.setPrivateKey(cleanedKey);

    // Get USDT contract
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);

    // USDT has 6 decimals on Tron
    const amountWithDecimals = Math.floor(amountUSDT * 1e6);

    // Send USDT
    const transaction = await contract.transfer(
      toAddress,
      amountWithDecimals
    ).send({
      feeLimit: 100_000_000, // 100 TRX fee limit
      callValue: 0,
      shouldPollResponse: false, // Don't wait for confirmation here
    });

    logger.info(`✅ USDT sent successfully!`);
    logger.info(`   From: ${fromAddress}`);
    logger.info(`   To: ${toAddress}`);
    logger.info(`   Amount: ${amountUSDT} USDT`);
    logger.info(`   TX Hash: ${transaction}`);

    return {
      success: true,
      txHash: transaction,
      amount: amountUSDT,
      from: fromAddress,
      to: toAddress,
    };

  } catch (error) {
    logger.error(`❌ Error sending USDT:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Wait for transaction confirmation on Tron network
 * @param {string} txHash - Transaction hash
 * @param {number} requiredConfirmations - Number of confirmations to wait for (default: 19)
 * @param {number} maxWaitTime - Maximum time to wait in ms (default: 60000)
 * @returns {Promise<object>} Confirmation status
 */
async function waitForConfirmation(txHash, requiredConfirmations = 19, maxWaitTime = 60000) {
  const startTime = Date.now();
  const pollInterval = 3000; // Check every 3 seconds

  logger.info(`⏳ Waiting for transaction confirmation: ${txHash}`);
  logger.info(`   Required confirmations: ${requiredConfirmations}`);

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const txInfo = await tronWeb.trx.getTransactionInfo(txHash);

      if (!txInfo || !txInfo.blockNumber) {
        // Transaction not yet confirmed
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      // Calculate confirmations
      const currentBlock = await tronWeb.trx.getCurrentBlock();
      const confirmations = currentBlock.block_header.raw_data.number - txInfo.blockNumber;

      logger.info(`   Confirmations: ${confirmations}/${requiredConfirmations}`);

      if (confirmations >= requiredConfirmations) {
        logger.info(`✅ Transaction confirmed! (${confirmations} confirmations)`);
        return {
          confirmed: true,
          confirmations: confirmations,
          blockNumber: txInfo.blockNumber,
        };
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      logger.error(`Error checking confirmation:`, error.message);
      // Continue waiting
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  logger.warn(`⚠️  Timeout waiting for confirmation after ${maxWaitTime}ms`);
  return {
    confirmed: false,
    reason: 'timeout',
    maxWaitTime: maxWaitTime,
  };
}

/**
 * Estimate fee for USDT transfer
 * @returns {Promise<number>} Estimated fee in TRX
 */
async function estimateUSDTTransferFee() {
  // Tron USDT transfers typically cost around 13-15 TRX
  // This includes energy costs converted to TRX
  return 15;
}

/**
 * Recover leftover TRX from a wallet after sweep
 * Uses incremental buffer strategy to handle "balance not sufficient" errors
 * @param {string} fromPrivateKey - Wallet private key
 * @param {string} toAddress - Destination address (hot wallet)
 * @param {number} minAmount - Minimum amount to recover (default: 0.5 TRX)
 * @returns {Promise<object>} Recovery result
 */
async function recoverLeftoverTRX(fromPrivateKey, toAddress, minAmount = 0.5) {
  const maxRetries = 10; // Max buffer: 10 TRX
  let bufferTRX = 1.0; // Start with 1 TRX buffer

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const cleanedKey = cleanPrivateKey(fromPrivateKey);
      const fromAddress = tronWeb.address.fromPrivateKey(cleanedKey);

      logger.info(`🔄 TRX Recovery Attempt ${attempt}/${maxRetries} (buffer: ${bufferTRX} TRX)`);

      tronWeb.setPrivateKey(cleanedKey);

      // Query balance
      const balance = await getTRXBalance(fromAddress);
      logger.info(`💰 Current balance: ${balance} TRX`);

      // Calculate amount with current buffer
      const amountToRecover = balance - bufferTRX;

      // Check if amount is worth recovering
      if (amountToRecover < minAmount) {
        logger.info(`⚠️  Amount too low (${amountToRecover.toFixed(2)} TRX), skipping recovery`);
        return { success: false, reason: 'insufficient_amount' };
      }

      logger.info(`📤 Attempting to recover: ${amountToRecover.toFixed(2)} TRX (leaving ${bufferTRX} TRX buffer)`);

      // Execute recovery
      const result = await sendTRX(fromPrivateKey, toAddress, amountToRecover);

      if (result.success) {
        logger.info(`✅ TRX Recovery SUCCESS!`);
        logger.info(`   Amount: ${amountToRecover.toFixed(2)} TRX`);
        logger.info(`   Buffer used: ${bufferTRX} TRX`);
        logger.info(`   TX Hash: ${result.txHash}`);

        return {
          success: true,
          txHash: result.txHash,
          amount: amountToRecover,
          bufferUsed: bufferTRX,
          attempts: attempt
        };
      } else {
        throw new Error(result.error || 'Transaction failed');
      }

    } catch (error) {
      logger.info(`❌ Attempt ${attempt} failed: ${error.message}`);

      // If error is "balance not sufficient", increase buffer and retry
      if (error.message.includes('balance is not sufficient') ||
          error.message.includes('balance not sufficient')) {

        bufferTRX += 1.0; // Increase by 1 TRX
        logger.info(`🔄 Increasing buffer to ${bufferTRX} TRX and retrying...`);

        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;

      } else {
        // Different error, no point retrying
        logger.info(`🛑 Non-recoverable error, stopping retries`);
        return {
          success: false,
          reason: 'non_recoverable_error',
          error: error.message,
          attempts: attempt
        };
      }
    }
  }

  // Max retries exceeded
  logger.info(`🛑 Max retries reached (${maxRetries}). Buffer needed would be > 10 TRX`);
  return {
    success: false,
    reason: 'max_retries_exceeded',
    maxBufferTried: bufferTRX,
    attempts: maxRetries
  };
}

// Export all functions
module.exports = {
  tronWeb,
  cleanPrivateKey,
  getTRXBalance,
  getUSDTBalance,
  sendTRX,
  sendUSDT,
  waitForConfirmation,
  estimateUSDTTransferFee,
  recoverLeftoverTRX,
  USDT_CONTRACT_ADDRESS,
};
