const { pool } = require('../database/connection');

// Tron services
const {
  estimateUSDTTransferFee,
  sendTRX,
  sendUSDT: sendUSDTTron,
  getTRXBalance,
  recoverLeftoverTRX,
  waitForConfirmation: waitForTronConfirmation
} = require('./tronService');
const {
  fundWalletWithGas: fundTronWallet,
  checkGasFunderHealth: checkTronGasFunderHealth,
  calculateGasAmount: calculateTronGasAmount
} = require('./gasFunder');

// Ethereum services
const {
  getETHBalance,
  getUSDTBalance: getUSDTBalanceEth,
  getUSDCBalance,
  sendETH,
  sendUSDT: sendUSDTEth,
  sendUSDC,
  recoverLeftoverETH,
  waitForConfirmation: waitForEthConfirmation
} = require('./ethereumService');
const {
  fundWalletWithETH,
  checkETHGasFunderHealth,
  calculateETHGasAmount
} = require('./ethereumGasFunder');

const logger = require('../utils/logger');

const SWEEP_MIN_USD = parseFloat(process.env.SWEEP_MIN_AMOUNT_USD || '10');
const SWEEP_INTERVAL = 120000; // 2 minutes

// Tron configuration
const MIN_TRX_FOR_RECOVERY = 0.5; // Recover if > 0.5 TRX left
const MIN_TRX_TO_PROCEED = 15; // Minimum TRX on client wallet to proceed with sweep

// Ethereum configuration
const MIN_ETH_FOR_RECOVERY = 0.001; // Recover if > 0.001 ETH left
const MIN_ETH_TO_PROCEED = 0.01; // Minimum ETH on client wallet to proceed with sweep

// Hot wallet addresses (same for both networks if using same address)
const HOT_WALLET_TRON = process.env.HOT_WALLET_ADDRESS_TRON || process.env.HOT_WALLET_ADDRESS;
const HOT_WALLET_ETH = process.env.HOT_WALLET_ADDRESS_ETH || process.env.HOT_WALLET_ADDRESS;

let isRunning = false;
let intervalId = null;
let totalFeesPaid = 0;
let totalTRXSent = 0;
let totalTRXRecovered = 0;
let totalSweeps = 0;

async function sweepDeposits() {
  try {
    const result = await pool.query(
      `SELECT d.*, w.address, w.network
       FROM deposits d
       JOIN user_wallets w ON d.wallet_address = w.address
       WHERE d.status = 'confirmed'
       AND d.swept_at IS NULL
       AND d.amount_usd >= $1
       AND w.network IN ('tron', 'ethereum')
       ORDER BY d.detected_at ASC`,
      [SWEEP_MIN_USD]
    );

    if (result.rows.length === 0) {
      logger.info('💤 No deposits to sweep');
      return;
    }

    logger.info(`\n🔄 Found ${result.rows.length} deposit(s) to sweep`);

    for (const deposit of result.rows) {
      await sweepDeposit(deposit);
    }

    if (totalSweeps > 0) {
      const avgFee = totalFeesPaid / totalSweeps;
      const avgSent = totalTRXSent / totalSweeps;
      const efficiency = totalFeesPaid > 0 ? (totalTRXRecovered / totalFeesPaid * 100) : 0;
      
      logger.info(`\n📊 SWEEP STATISTICS`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`   Total sweeps completed: ${totalSweeps}`);
      logger.info(`   Total TRX sent for gas: ${totalTRXSent.toFixed(2)} TRX`);
      logger.info(`   Total fees actually paid: ${totalFeesPaid.toFixed(2)} TRX`);
      logger.info(`   Total TRX recovered: ${totalTRXRecovered.toFixed(2)} TRX`);
      logger.info(`   Average TRX sent per sweep: ${avgSent.toFixed(2)} TRX`);
      logger.info(`   Average fee per sweep: ${avgFee.toFixed(2)} TRX`);
      logger.info(`   Recovery efficiency: ${efficiency.toFixed(1)}%`);
      logger.info(`   Net TRX cost: ${(totalFeesPaid - totalTRXRecovered).toFixed(2)} TRX`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }

  } catch (error) {
    logger.error('Error in sweep engine:', error);
  }
}

async function sweepDeposit(deposit) {
  const { id, user_id, wallet_address, token, amount, network } = deposit;

  try {
    logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.info(`🔄 Processing deposit #${id}`);
    logger.info(`   User ID: ${user_id}`);
    logger.info(`   Network: ${network}`);
    logger.info(`   Wallet: ${wallet_address}`);
    logger.info(`   Amount: ${amount} ${token}`);

    // Route to appropriate network handler
    if (network === 'tron') {
      return await sweepTronDeposit(deposit);
    } else if (network === 'ethereum') {
      return await sweepEthereumDeposit(deposit);
    } else {
      throw new Error(`Unsupported network: ${network}`);
    }
  } catch (error) {
    logger.error(`\n❌ ERROR sweeping deposit #${id}`);
    logger.error(`   ${error.message}\n`);

    await pool.query(
      `UPDATE deposits SET error_message = $1 WHERE id = $2`,
      [error.message, id]
    );
  }
}

/**
 * Sweep Tron deposit (USDT TRC20)
 */
async function sweepTronDeposit(deposit) {
  const { id, user_id, wallet_address, token, amount } = deposit;

  try {
    // Step 1: Check current TRX balance
    const currentBalance = await getTRXBalance(wallet_address);
    logger.info(`   💰 Current wallet balance: ${currentBalance.toFixed(2)} TRX`);

  // Step 2: Check if wallet has minimum TRX to proceed
  if (currentBalance < MIN_TRX_TO_PROCEED) {
    logger.info(`   ⚠️  Wallet has only ${currentBalance.toFixed(2)} TRX, minimum required: ${MIN_TRX_TO_PROCEED} TRX`);

    // Calculate optimal gas amount for USDT sweep
    const gasAmount = calculateTronGasAmount('usdt_sweep');
    logger.info(`   💸 Funding wallet with ${gasAmount} TRX for gas...`);

    // Use centralized gas funder service (includes health check)
    const fundResult = await fundTronWallet(wallet_address, gasAmount);

      if (!fundResult.success) {
        logger.error(`   ❌ Gas funding failed: ${fundResult.error}`);

        // Check if we can proceed anyway
        const balanceAfterAttempt = await getTRXBalance(wallet_address);
        if (balanceAfterAttempt >= MIN_TRX_TO_PROCEED) {
          logger.warn(`   ⚠️  Proceeding with sweep anyway (wallet has ${balanceAfterAttempt.toFixed(2)} TRX)`);
        } else {
          throw new Error(`Insufficient TRX for sweep: ${balanceAfterAttempt.toFixed(2)} TRX (minimum ${MIN_TRX_TO_PROCEED} required)`);
        }
      } else {
        totalTRXSent += gasAmount;
        logger.info(`   ✅ Gas funded! TX: ${fundResult.txHash}`);

        logger.info(`   ⏳ Waiting for gas confirmation...`);
        await waitForTronConfirmation(fundResult.txHash);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } else {
      logger.info(`   ✅ Wallet has sufficient TRX (${currentBalance.toFixed(2)} TRX ≥ ${MIN_TRX_TO_PROCEED} TRX minimum)`);
      logger.info(`   ⏭️  Skipping gas funding, proceeding directly to sweep`);
    }

    // Step 3: Derive user wallet private key from master seed
    let userPrivateKey;
    try {
      const walletGenerator = require('./walletGenerator');
      const wallets = walletGenerator.generateWalletFromSeed(process.env.MASTER_WALLET_SEED, user_id);
      userPrivateKey = wallets.tron.privateKey;
      
      logger.info(`   🔑 Private key derived successfully`);
    } catch (error) {
      throw new Error(`Failed to derive private key: ${error.message}`);
    }

    // Step 4: Sweep USDT to hot wallet
    logger.info(`   📤 Sweeping ${amount} ${token} to hot wallet...`);

    const sweepResult = await sendUSDTTron(userPrivateKey, HOT_WALLET_TRON, parseFloat(amount));
    
    if (!sweepResult.success) {
      throw new Error(`USDT sweep failed: ${sweepResult.error}`);
    }

    logger.info(`   ✅ USDT sweep successful! TX: ${sweepResult.txHash}`);

    // Track actual fee paid
    if (sweepResult.feePaid) {
      totalFeesPaid += sweepResult.feePaid;
      totalSweeps += 1;
      logger.info(`   💰 Actual fee paid: ${sweepResult.feePaid.toFixed(2)} TRX`);
    }

    // Step 5: Update database
    await pool.query(
      `UPDATE deposits 
       SET swept_at = NOW(), sweep_tx_hash = $1, status = 'swept'
       WHERE id = $2`,
      [sweepResult.txHash, id]
    );

    logger.info(`   ✅ Database updated`);

    // Step 6: Recover leftover TRX to hot wallet with incremental retry
    logger.info(`\n   💸 Starting TRX recovery with incremental retry...`);
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 secondi per conferma sweep USDT

    const recoveryResult = await recoverLeftoverTRX(
      userPrivateKey,
      HOT_WALLET_TRON, // Leftover goes to hot wallet!
      MIN_TRX_FOR_RECOVERY
    );

    if (recoveryResult.success) {
      totalTRXRecovered += recoveryResult.amount;
      logger.info(`\n   🎉 COMPLETE SWEEP CYCLE SUCCESS!`);
      logger.info(`      USDT swept: ${amount} ${token}`);
      logger.info(`      TRX recovered: ${recoveryResult.amount.toFixed(2)} TRX`);
      logger.info(`      Optimal buffer found: ${recoveryResult.bufferUsed} TRX`);
      logger.info(`      Total attempts: ${recoveryResult.attempts}`);
    } else {
      logger.info(`\n   ⚠️ USDT sweep OK, but TRX recovery failed:`);
      logger.info(`      Reason: ${recoveryResult.reason}`);
      if (recoveryResult.maxBufferTried) {
        logger.info(`      Max buffer tried: ${recoveryResult.maxBufferTried} TRX`);
      }
      if (recoveryResult.error) {
        logger.info(`      Error: ${recoveryResult.error}`);
      }
    }

    logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  } catch (error) {
    logger.error(`\n❌ ERROR sweeping deposit #${id}`);
    logger.error(`   ${error.message}\n`);
    
    await pool.query(
      `UPDATE deposits SET error_message = $1 WHERE id = $2`,
      [error.message, id]
    );
  }
}

/**
 * Sweep Ethereum deposit (USDT ERC20 or USDC ERC20)
 */
async function sweepEthereumDeposit(deposit) {
  const { id, user_id, wallet_address, token, amount } = deposit;

  // Step 1: Check current ETH balance
  const currentBalance = await getETHBalance(wallet_address);
  logger.info(`   💰 Current wallet balance: ${currentBalance.toFixed(6)} ETH`);

  // Step 2: Check if wallet has minimum ETH to proceed
  if (currentBalance < MIN_ETH_TO_PROCEED) {
    logger.info(`   ⚠️  Wallet has only ${currentBalance.toFixed(6)} ETH, minimum required: ${MIN_ETH_TO_PROCEED} ETH`);

    // Calculate optimal gas amount for token sweep
    const gasAmount = calculateETHGasAmount(token === 'USDT' ? 'usdt_sweep' : 'usdc_sweep');
    logger.info(`   💸 Funding wallet with ${gasAmount} ETH for gas...`);

    // Use centralized gas funder service (includes health check)
    const fundResult = await fundWalletWithETH(wallet_address, gasAmount);

    if (!fundResult.success) {
      logger.error(`   ❌ ETH gas funding failed: ${fundResult.error}`);

      // Check if we can proceed anyway
      const balanceAfterAttempt = await getETHBalance(wallet_address);
      if (balanceAfterAttempt >= MIN_ETH_TO_PROCEED) {
        logger.warn(`   ⚠️  Proceeding with sweep anyway (wallet has ${balanceAfterAttempt.toFixed(6)} ETH)`);
      } else {
        throw new Error(`Insufficient ETH for sweep: ${balanceAfterAttempt.toFixed(6)} ETH (minimum ${MIN_ETH_TO_PROCEED} required)`);
      }
    } else {
      logger.info(`   ✅ ETH gas funded! TX: ${fundResult.txHash}`);

      logger.info(`   ⏳ Waiting for gas confirmation...`);
      await waitForEthConfirmation(fundResult.txHash);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } else {
    logger.info(`   ✅ Wallet has sufficient ETH (${currentBalance.toFixed(6)} ETH ≥ ${MIN_ETH_TO_PROCEED} ETH minimum)`);
    logger.info(`   ⏭️  Skipping gas funding, proceeding directly to sweep`);
  }

  // Step 3: Derive user wallet private key from master seed
  let userPrivateKey;
  try {
    const walletGenerator = require('./walletGenerator');
    const wallets = walletGenerator.generateWalletFromSeed(process.env.MASTER_WALLET_SEED, user_id);
    userPrivateKey = wallets.ethereum.privateKey;

    logger.info(`   🔑 Private key derived successfully`);
  } catch (error) {
    throw new Error(`Failed to derive private key: ${error.message}`);
  }

  // Step 4: Sweep token to hot wallet
  logger.info(`   📤 Sweeping ${amount} ${token} to hot wallet...`);

  let sweepResult;
  if (token === 'USDT') {
    sweepResult = await sendUSDTEth(userPrivateKey, HOT_WALLET_ETH, parseFloat(amount));
  } else if (token === 'USDC') {
    sweepResult = await sendUSDC(userPrivateKey, HOT_WALLET_ETH, parseFloat(amount));
  } else {
    throw new Error(`Unsupported token: ${token}`);
  }

  if (!sweepResult.success) {
    throw new Error(`${token} sweep failed: ${sweepResult.error}`);
  }

  logger.info(`   ✅ ${token} sweep successful! TX: ${sweepResult.txHash}`);

  // Step 5: Update database
  await pool.query(
    `UPDATE deposits
     SET swept_at = NOW(), sweep_tx_hash = $1, status = 'swept'
     WHERE id = $2`,
    [sweepResult.txHash, id]
  );

  logger.info(`   ✅ Database updated`);

  // Step 6: Recover leftover ETH to hot wallet
  logger.info(`\n   💸 Starting ETH recovery...`);
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for sweep confirmation

  const recoveryResult = await recoverLeftoverETH(
    userPrivateKey,
    HOT_WALLET_ETH, // Leftover goes to hot wallet!
    MIN_ETH_FOR_RECOVERY
  );

  if (recoveryResult.success) {
    logger.info(`\n   🎉 COMPLETE SWEEP CYCLE SUCCESS!`);
    logger.info(`      ${token} swept: ${amount}`);
    logger.info(`      ETH recovered: ${recoveryResult.amount.toFixed(6)} ETH`);
    logger.info(`      Gas cost: ${recoveryResult.gasCost.toFixed(6)} ETH`);
  } else {
    logger.info(`\n   ⚠️ ${token} sweep OK, but ETH recovery failed:`);
    logger.info(`      Reason: ${recoveryResult.reason}`);
    if (recoveryResult.error) {
      logger.info(`      Error: ${recoveryResult.error}`);
    }
  }

  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

async function start() {
  if (isRunning) {
    logger.warn('Sweep engine already running');
    return;
  }

  if (!HOT_WALLET_TRON && !HOT_WALLET_ETH) {
    logger.error('❌ Missing configuration: HOT_WALLET_ADDRESS_TRON or HOT_WALLET_ADDRESS_ETH');
    return;
  }

  isRunning = true;

  logger.info('\n🚀 STARTING INTELLIGENT SWEEP ENGINE');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`   🔥 Networks: Tron (TRC20) + Ethereum (ERC20)`);
  logger.info(`   💰 Tron Hot Wallet: ${HOT_WALLET_TRON || 'Not configured'}`);
  logger.info(`   💰 Ethereum Hot Wallet: ${HOT_WALLET_ETH || 'Not configured'}`);
  logger.info(`   📊 Minimum sweep amount: $${SWEEP_MIN_USD}`);
  logger.info(`   ⚡ Tron: Min ${MIN_TRX_TO_PROCEED} TRX, recover ${MIN_TRX_FOR_RECOVERY} TRX`);
  logger.info(`   ⚡ Ethereum: Min ${MIN_ETH_TO_PROCEED} ETH, recover ${MIN_ETH_FOR_RECOVERY} ETH`);
  logger.info(`   ⏱️  Check interval: ${SWEEP_INTERVAL/1000}s`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check Tron gas funder health
  logger.info('🏥 Checking Tron Gas Funder health...\n');
  const tronHealthStatus = await checkTronGasFunderHealth();

  if (tronHealthStatus.healthy) {
    logger.info(`✅ Tron Gas Funder operational`);
    logger.info(`   Address: ${tronHealthStatus.address}`);
    logger.info(`   Balance: ${tronHealthStatus.balance.toFixed(2)} TRX`);
    logger.info(`   Minimum required: ${tronHealthStatus.minRequired} TRX\n`);
  } else {
    logger.error(`❌ Tron Gas Funder unhealthy: ${tronHealthStatus.reason}`);
    logger.error(`   Status: ${tronHealthStatus.status}`);
    logger.error(`   Balance: ${tronHealthStatus.balance} TRX\n`);
  }

  // Check Ethereum gas funder health
  logger.info('🏥 Checking Ethereum Gas Funder health...\n');
  const ethHealthStatus = await checkETHGasFunderHealth();

  if (ethHealthStatus.healthy) {
    logger.info(`✅ Ethereum Gas Funder operational`);
    logger.info(`   Address: ${ethHealthStatus.address}`);
    logger.info(`   Balance: ${ethHealthStatus.balance.toFixed(6)} ETH`);
    logger.info(`   Minimum required: ${ethHealthStatus.minRequired} ETH\n`);
  } else {
    logger.error(`❌ Ethereum Gas Funder unhealthy: ${ethHealthStatus.reason}`);
    logger.error(`   Status: ${ethHealthStatus.status}`);
    logger.error(`   Balance: ${ethHealthStatus.balance} ETH\n`);
  }

  if (!tronHealthStatus.healthy && !ethHealthStatus.healthy) {
    logger.warn('⚠️  Both gas funders are unhealthy! Sweep engine will start but sweeps will likely fail!\n');
  }

  // Run immediately
  await sweepDeposits();

  // Then run on interval
  intervalId = setInterval(sweepDeposits, SWEEP_INTERVAL);
  logger.info(`✅ Sweep engine running\n`);
}

function stop() {
  if (!isRunning) return;

  clearInterval(intervalId);
  isRunning = false;
  logger.info('⏹️  Sweep engine stopped');
}

function getIsRunning() {
  return isRunning;
}

module.exports = {
  start,
  stop,
  isRunning: getIsRunning
};
