/**
 * Ethereum Gas Funder Service
 * Funds user wallets with ETH for ERC20 transaction fees
 * Critical for enabling USDT/USDC sweeps from user wallets
 */

const { sendETH, getETHBalance } = require('./ethereumService');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

// Gas funder configuration
const ETH_GAS_FUNDER_PRIVATE_KEY = process.env.ETH_GAS_FUNDER_PRIVATE_KEY;
const DEFAULT_ETH_GAS_AMOUNT = parseFloat(process.env.DEFAULT_ETH_GAS_AMOUNT || '0.01'); // Default 0.01 ETH
const MIN_ETH_FUNDER_BALANCE = parseFloat(process.env.MIN_ETH_FUNDER_BALANCE || '0.5'); // Minimum 0.5 ETH in funder wallet
const MAX_ETH_FUND_AMOUNT = parseFloat(process.env.MAX_ETH_FUND_AMOUNT || '0.02'); // Maximum 0.02 ETH per funding

// Validate configuration on module load
if (!ETH_GAS_FUNDER_PRIVATE_KEY) {
  logger.warn('⚠️  ETH_GAS_FUNDER_PRIVATE_KEY not configured! Ethereum gas funding will fail.');
}

/**
 * Fund a wallet with ETH for gas fees
 * @param {string} walletAddress - Destination wallet address
 * @param {number} amountETH - Amount of ETH to send (default: DEFAULT_ETH_GAS_AMOUNT)
 * @returns {Promise<object>} Funding result
 */
async function fundWalletWithETH(walletAddress, amountETH = DEFAULT_ETH_GAS_AMOUNT) {
  try {
    // Validate inputs
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    if (!ETH_GAS_FUNDER_PRIVATE_KEY) {
      throw new Error('ETH_GAS_FUNDER_PRIVATE_KEY not configured');
    }

    // Validate amount
    if (amountETH <= 0) {
      throw new Error(`Invalid gas amount: ${amountETH} ETH`);
    }

    if (amountETH > MAX_ETH_FUND_AMOUNT) {
      logger.warn(`⚠️  Requested amount ${amountETH} ETH exceeds MAX_ETH_FUND_AMOUNT ${MAX_ETH_FUND_AMOUNT} ETH. Capping to max.`);
      amountETH = MAX_ETH_FUND_AMOUNT;
    }

    logger.info(`⛽ Funding wallet ${walletAddress} with ${amountETH} ETH for gas`);

    // Check funder wallet health before funding
    const healthCheck = await checkETHGasFunderHealth();
    if (!healthCheck.healthy) {
      throw new Error(`ETH gas funder unhealthy: ${healthCheck.reason}`);
    }

    // Send ETH from gas funder to user wallet
    const result = await sendETH(ETH_GAS_FUNDER_PRIVATE_KEY, walletAddress, amountETH);

    if (result.success) {
      logger.info(`✅ ETH gas funding successful!`);
      logger.info(`   Wallet: ${walletAddress}`);
      logger.info(`   Amount: ${amountETH} ETH`);
      logger.info(`   TX Hash: ${result.txHash}`);

      return {
        success: true,
        txHash: result.txHash,
        amount: amountETH,
        walletAddress: walletAddress,
        timestamp: new Date().toISOString(),
      };
    } else {
      throw new Error(result.error || 'ETH gas funding failed');
    }

  } catch (error) {
    logger.error(`❌ ETH gas funding failed for ${walletAddress}:`, error.message);

    return {
      success: false,
      error: error.message,
      walletAddress: walletAddress,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check ETH gas funder wallet health
 * Verifies that the funder has sufficient ETH to continue operations
 * @returns {Promise<object>} Health status
 */
async function checkETHGasFunderHealth() {
  try {
    if (!ETH_GAS_FUNDER_PRIVATE_KEY) {
      return {
        healthy: false,
        reason: 'ETH_GAS_FUNDER_PRIVATE_KEY not configured',
        balance: 0,
        minRequired: MIN_ETH_FUNDER_BALANCE,
      };
    }

    // Get funder wallet address from private key
    const wallet = new ethers.Wallet(ETH_GAS_FUNDER_PRIVATE_KEY);
    const funderAddress = wallet.address;

    logger.info(`🏥 Checking ETH gas funder health: ${funderAddress}`);

    // Query balance
    const balance = await getETHBalance(funderAddress);

    logger.info(`💰 ETH Gas Funder Balance: ${balance.toFixed(6)} ETH`);

    // Check if balance is sufficient
    const healthy = balance >= MIN_ETH_FUNDER_BALANCE;

    if (healthy) {
      logger.info(`✅ ETH gas funder healthy (${balance.toFixed(6)} ETH >= ${MIN_ETH_FUNDER_BALANCE} ETH minimum)`);
    } else {
      logger.warn(`⚠️  ETH gas funder LOW BALANCE: ${balance.toFixed(6)} ETH (minimum: ${MIN_ETH_FUNDER_BALANCE} ETH)`);
      logger.warn(`   🚨 Please refill ETH gas funder wallet: ${funderAddress}`);
    }

    return {
      healthy: healthy,
      balance: balance,
      minRequired: MIN_ETH_FUNDER_BALANCE,
      address: funderAddress,
      status: healthy ? 'operational' : 'low_balance',
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`❌ ETH gas funder health check failed:`, error.message);

    return {
      healthy: false,
      reason: error.message,
      balance: 0,
      minRequired: MIN_ETH_FUNDER_BALANCE,
      status: 'error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate optimal gas amount for a transaction
 * Based on current network conditions and transaction type
 * @param {string} txType - Transaction type ('usdt_sweep', 'usdc_sweep', 'recovery', 'custom')
 * @returns {number} Recommended ETH amount
 */
function calculateETHGasAmount(txType = 'usdt_sweep') {
  const gasAmounts = {
    'usdt_sweep': 0.01,    // USDT ERC20 transfer requires ~0.005-0.01 ETH
    'usdc_sweep': 0.01,    // USDC ERC20 transfer requires ~0.005-0.01 ETH
    'recovery': 0.001,     // ETH recovery requires minimal gas
    'custom': DEFAULT_ETH_GAS_AMOUNT,
  };

  const amount = gasAmounts[txType] || DEFAULT_ETH_GAS_AMOUNT;

  logger.info(`📊 Calculated ETH gas amount for ${txType}: ${amount} ETH`);

  return amount;
}

/**
 * Fund multiple wallets in batch
 * Useful for pre-funding multiple deposit wallets
 * @param {Array<{address: string, amount: number}>} wallets - Array of wallet funding requests
 * @returns {Promise<object>} Batch funding results
 */
async function fundWalletsBatchETH(wallets) {
  logger.info(`📦 Batch funding ${wallets.length} wallets with ETH`);

  const results = {
    success: [],
    failed: [],
    total: wallets.length,
  };

  for (const wallet of wallets) {
    try {
      const result = await fundWalletWithETH(wallet.address, wallet.amount);

      if (result.success) {
        results.success.push(result);
      } else {
        results.failed.push(result);
      }

      // Delay between transactions to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      logger.error(`Batch ETH funding error for ${wallet.address}:`, error.message);
      results.failed.push({
        success: false,
        walletAddress: wallet.address,
        error: error.message,
      });
    }
  }

  logger.info(`✅ Batch ETH funding complete: ${results.success.length} succeeded, ${results.failed.length} failed`);

  return results;
}

// Export all functions
module.exports = {
  fundWalletWithETH,
  checkETHGasFunderHealth,
  calculateETHGasAmount,
  fundWalletsBatchETH,
};
