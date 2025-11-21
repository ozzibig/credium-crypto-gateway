/**
 * Gas Funder Service
 * Funds user wallets with TRX for transaction fees
 * Critical for enabling USDT sweeps from user wallets
 */

const { sendTRX, getTRXBalance } = require('./tronService');
const logger = require('../utils/logger');

// Gas funder configuration
const GAS_FUNDER_PRIVATE_KEY = process.env.GAS_FUNDER_PRIVATE_KEY;
const DEFAULT_GAS_AMOUNT = parseFloat(process.env.DEFAULT_GAS_AMOUNT || '15'); // Default 15 TRX
const MIN_FUNDER_BALANCE = parseFloat(process.env.MIN_FUNDER_BALANCE || '100'); // Minimum 100 TRX in funder wallet
const MAX_FUND_AMOUNT = parseFloat(process.env.MAX_FUND_AMOUNT || '20'); // Maximum 20 TRX per funding

// Validate configuration on module load
if (!GAS_FUNDER_PRIVATE_KEY) {
  logger.warn('⚠️  GAS_FUNDER_PRIVATE_KEY not configured! Gas funding will fail.');
}

/**
 * Fund a wallet with TRX for gas fees
 * @param {string} walletAddress - Destination wallet address
 * @param {number} amountTRX - Amount of TRX to send (default: DEFAULT_GAS_AMOUNT)
 * @returns {Promise<object>} Funding result
 */
async function fundWalletWithGas(walletAddress, amountTRX = DEFAULT_GAS_AMOUNT) {
  try {
    // Validate inputs
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    if (!GAS_FUNDER_PRIVATE_KEY) {
      throw new Error('GAS_FUNDER_PRIVATE_KEY not configured');
    }

    // Validate amount
    if (amountTRX <= 0) {
      throw new Error(`Invalid gas amount: ${amountTRX} TRX`);
    }

    if (amountTRX > MAX_FUND_AMOUNT) {
      logger.warn(`⚠️  Requested amount ${amountTRX} TRX exceeds MAX_FUND_AMOUNT ${MAX_FUND_AMOUNT} TRX. Capping to max.`);
      amountTRX = MAX_FUND_AMOUNT;
    }

    logger.info(`⛽ Funding wallet ${walletAddress} with ${amountTRX} TRX for gas`);

    // Check funder wallet health before funding
    const healthCheck = await checkGasFunderHealth();
    if (!healthCheck.healthy) {
      throw new Error(`Gas funder unhealthy: ${healthCheck.reason}`);
    }

    // Send TRX from gas funder to user wallet
    const result = await sendTRX(GAS_FUNDER_PRIVATE_KEY, walletAddress, amountTRX);

    if (result.success) {
      logger.info(`✅ Gas funding successful!`);
      logger.info(`   Wallet: ${walletAddress}`);
      logger.info(`   Amount: ${amountTRX} TRX`);
      logger.info(`   TX Hash: ${result.txHash}`);

      return {
        success: true,
        txHash: result.txHash,
        amount: amountTRX,
        walletAddress: walletAddress,
        timestamp: new Date().toISOString(),
      };
    } else {
      throw new Error(result.error || 'Gas funding failed');
    }

  } catch (error) {
    logger.error(`❌ Gas funding failed for ${walletAddress}:`, error.message);

    return {
      success: false,
      error: error.message,
      walletAddress: walletAddress,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check gas funder wallet health
 * Verifies that the funder has sufficient TRX to continue operations
 * @returns {Promise<object>} Health status
 */
async function checkGasFunderHealth() {
  try {
    if (!GAS_FUNDER_PRIVATE_KEY) {
      return {
        healthy: false,
        reason: 'GAS_FUNDER_PRIVATE_KEY not configured',
        balance: 0,
        minRequired: MIN_FUNDER_BALANCE,
      };
    }

    // Get funder wallet address from private key
    const { tronWeb } = require('./tronService');
    const funderAddress = tronWeb.address.fromPrivateKey(GAS_FUNDER_PRIVATE_KEY);

    logger.info(`🏥 Checking gas funder health: ${funderAddress}`);

    // Query balance
    const balance = await getTRXBalance(funderAddress);

    logger.info(`💰 Gas Funder Balance: ${balance.toFixed(2)} TRX`);

    // Check if balance is sufficient
    const healthy = balance >= MIN_FUNDER_BALANCE;

    if (healthy) {
      logger.info(`✅ Gas funder healthy (${balance.toFixed(2)} TRX >= ${MIN_FUNDER_BALANCE} TRX minimum)`);
    } else {
      logger.warn(`⚠️  Gas funder LOW BALANCE: ${balance.toFixed(2)} TRX (minimum: ${MIN_FUNDER_BALANCE} TRX)`);
      logger.warn(`   🚨 Please refill gas funder wallet: ${funderAddress}`);
    }

    return {
      healthy: healthy,
      balance: balance,
      minRequired: MIN_FUNDER_BALANCE,
      address: funderAddress,
      status: healthy ? 'operational' : 'low_balance',
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`❌ Gas funder health check failed:`, error.message);

    return {
      healthy: false,
      reason: error.message,
      balance: 0,
      minRequired: MIN_FUNDER_BALANCE,
      status: 'error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate optimal gas amount for a transaction
 * Based on current network conditions and transaction type
 * @param {string} txType - Transaction type ('usdt_sweep', 'recovery', 'custom')
 * @returns {number} Recommended TRX amount
 */
function calculateGasAmount(txType = 'usdt_sweep') {
  const gasAmounts = {
    'usdt_sweep': 15,    // USDT TRC20 transfer requires ~13-15 TRX
    'recovery': 2,       // TRX recovery requires minimal gas
    'custom': DEFAULT_GAS_AMOUNT,
  };

  const amount = gasAmounts[txType] || DEFAULT_GAS_AMOUNT;

  logger.info(`📊 Calculated gas amount for ${txType}: ${amount} TRX`);

  return amount;
}

/**
 * Fund multiple wallets in batch
 * Useful for pre-funding multiple deposit wallets
 * @param {Array<{address: string, amount: number}>} wallets - Array of wallet funding requests
 * @returns {Promise<object>} Batch funding results
 */
async function fundWalletsBatch(wallets) {
  logger.info(`📦 Batch funding ${wallets.length} wallets`);

  const results = {
    success: [],
    failed: [],
    total: wallets.length,
  };

  for (const wallet of wallets) {
    try {
      const result = await fundWalletWithGas(wallet.address, wallet.amount);

      if (result.success) {
        results.success.push(result);
      } else {
        results.failed.push(result);
      }

      // Small delay between transactions to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      logger.error(`Batch funding error for ${wallet.address}:`, error.message);
      results.failed.push({
        success: false,
        walletAddress: wallet.address,
        error: error.message,
      });
    }
  }

  logger.info(`✅ Batch funding complete: ${results.success.length} succeeded, ${results.failed.length} failed`);

  return results;
}

// Export all functions
module.exports = {
  fundWalletWithGas,
  checkGasFunderHealth,
  calculateGasAmount,
  fundWalletsBatch,
};
