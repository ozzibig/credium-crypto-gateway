/**
 * Ethereum Blockchain Service
 * Handles all Ethereum network interactions (ETH, USDT ERC20, USDC ERC20)
 */

const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Ethereum RPC configuration
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://ethereum.publicnode.com';

// ERC20 Token contract addresses (Ethereum mainnet)
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ERC20 ABI (minimal interface for balance and transfer)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function symbol() view returns (string)'
];

// Initialize Ethereum provider
const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);

logger.info(`🔗 Ethereum provider initialized: ${ETHEREUM_RPC_URL}`);

/**
 * Clean and validate private key format
 * @param {string} privateKey - Raw private key
 * @returns {string} Cleaned private key (with 0x prefix)
 */
function cleanPrivateKey(privateKey) {
  if (!privateKey) {
    throw new Error('Private key is required');
  }

  // Remove whitespace
  let cleaned = privateKey.trim();

  // Add 0x prefix if missing
  if (!cleaned.startsWith('0x')) {
    cleaned = '0x' + cleaned;
  }

  // Validate length (66 characters including 0x prefix)
  if (cleaned.length !== 66) {
    throw new Error(`Invalid private key length: ${cleaned.length} (expected 66 with 0x prefix)`);
  }

  // Validate hex format
  if (!/^0x[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error('Invalid private key format: must be 64 hex characters with 0x prefix');
  }

  return cleaned;
}

/**
 * Get ETH balance of an address
 * @param {string} address - Ethereum address
 * @returns {Promise<number>} Balance in ETH
 */
async function getETHBalance(address) {
  try {
    const balance = await provider.getBalance(address);
    const balanceETH = ethers.formatEther(balance);
    return parseFloat(balanceETH);
  } catch (error) {
    logger.error(`Error getting ETH balance for ${address}:`, error.message);
    throw error;
  }
}

/**
 * Get ERC20 token balance
 * @param {string} address - Ethereum address
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<number>} Balance in token units
 */
async function getTokenBalance(address, tokenAddress) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
      contract.symbol()
    ]);

    const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals));

    logger.info(`📊 ${symbol} balance for ${address}: ${balanceFormatted}`);

    return balanceFormatted;
  } catch (error) {
    logger.error(`Error getting token balance for ${address}:`, error.message);
    throw error;
  }
}

/**
 * Get USDT ERC20 balance
 * @param {string} address - Ethereum address
 * @returns {Promise<number>} Balance in USDT
 */
async function getUSDTBalance(address) {
  return getTokenBalance(address, USDT_CONTRACT_ADDRESS);
}

/**
 * Get USDC ERC20 balance
 * @param {string} address - Ethereum address
 * @returns {Promise<number>} Balance in USDC
 */
async function getUSDCBalance(address) {
  return getTokenBalance(address, USDC_CONTRACT_ADDRESS);
}

/**
 * Send ETH from one address to another
 * @param {string} fromPrivateKey - Sender's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amountETH - Amount in ETH
 * @returns {Promise<object>} Transaction result
 */
async function sendETH(fromPrivateKey, toAddress, amountETH) {
  try {
    const cleanedKey = cleanPrivateKey(fromPrivateKey);
    const wallet = new ethers.Wallet(cleanedKey, provider);
    const fromAddress = wallet.address;

    logger.info(`💸 Sending ${amountETH} ETH from ${fromAddress} to ${toAddress}`);

    // Convert ETH to Wei
    const amountWei = ethers.parseEther(amountETH.toString());

    // Get current gas price
    const feeData = await provider.getFeeData();

    // Send transaction
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei,
      gasLimit: 21000, // Standard ETH transfer
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
    });

    logger.info(`⏳ Transaction sent: ${tx.hash}, waiting for confirmation...`);

    // Wait for confirmation
    const receipt = await tx.wait();

    logger.info(`✅ ETH sent successfully!`);
    logger.info(`   From: ${fromAddress}`);
    logger.info(`   To: ${toAddress}`);
    logger.info(`   Amount: ${amountETH} ETH`);
    logger.info(`   TX Hash: ${receipt.hash}`);
    logger.info(`   Gas used: ${receipt.gasUsed.toString()}`);

    return {
      success: true,
      txHash: receipt.hash,
      amount: amountETH,
      from: fromAddress,
      to: toAddress,
      gasUsed: receipt.gasUsed.toString()
    };

  } catch (error) {
    logger.error(`❌ Error sending ETH:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send ERC20 token from one address to another
 * @param {string} fromPrivateKey - Sender's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amount - Amount in token units
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<object>} Transaction result
 */
async function sendToken(fromPrivateKey, toAddress, amount, tokenAddress) {
  try {
    const cleanedKey = cleanPrivateKey(fromPrivateKey);
    const wallet = new ethers.Wallet(cleanedKey, provider);
    const fromAddress = wallet.address;

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    const [decimals, symbol] = await Promise.all([
      contract.decimals(),
      contract.symbol()
    ]);

    logger.info(`💵 Sending ${amount} ${symbol} from ${fromAddress} to ${toAddress}`);

    // Convert amount to token units with proper decimals
    const amountWithDecimals = ethers.parseUnits(amount.toString(), decimals);

    // Get current gas price
    const feeData = await provider.getFeeData();

    // Estimate gas for token transfer
    const gasEstimate = await contract.transfer.estimateGas(toAddress, amountWithDecimals);

    // Send transaction with 20% gas buffer
    const tx = await contract.transfer(toAddress, amountWithDecimals, {
      gasLimit: gasEstimate * 120n / 100n,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
    });

    logger.info(`⏳ Transaction sent: ${tx.hash}, waiting for confirmation...`);

    // Wait for confirmation
    const receipt = await tx.wait();

    logger.info(`✅ ${symbol} sent successfully!`);
    logger.info(`   From: ${fromAddress}`);
    logger.info(`   To: ${toAddress}`);
    logger.info(`   Amount: ${amount} ${symbol}`);
    logger.info(`   TX Hash: ${receipt.hash}`);
    logger.info(`   Gas used: ${receipt.gasUsed.toString()}`);

    return {
      success: true,
      txHash: receipt.hash,
      amount: amount,
      token: symbol,
      from: fromAddress,
      to: toAddress,
      gasUsed: receipt.gasUsed.toString()
    };

  } catch (error) {
    logger.error(`❌ Error sending token:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send USDT ERC20
 * @param {string} fromPrivateKey - Sender's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amountUSDT - Amount in USDT
 * @returns {Promise<object>} Transaction result
 */
async function sendUSDT(fromPrivateKey, toAddress, amountUSDT) {
  return sendToken(fromPrivateKey, toAddress, amountUSDT, USDT_CONTRACT_ADDRESS);
}

/**
 * Send USDC ERC20
 * @param {string} fromPrivateKey - Sender's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amountUSDC - Amount in USDC
 * @returns {Promise<object>} Transaction result
 */
async function sendUSDC(fromPrivateKey, toAddress, amountUSDC) {
  return sendToken(fromPrivateKey, toAddress, amountUSDC, USDC_CONTRACT_ADDRESS);
}

/**
 * Wait for transaction confirmation
 * @param {string} txHash - Transaction hash
 * @param {number} requiredConfirmations - Number of confirmations (default: 2)
 * @param {number} maxWaitTime - Maximum time to wait in ms (default: 120000)
 * @returns {Promise<object>} Confirmation status
 */
async function waitForConfirmation(txHash, requiredConfirmations = 2, maxWaitTime = 120000) {
  const startTime = Date.now();

  logger.info(`⏳ Waiting for transaction confirmation: ${txHash}`);
  logger.info(`   Required confirmations: ${requiredConfirmations}`);

  try {
    const receipt = await provider.waitForTransaction(txHash, requiredConfirmations, maxWaitTime);

    if (receipt) {
      logger.info(`✅ Transaction confirmed! (${receipt.confirmations} confirmations)`);
      return {
        confirmed: true,
        confirmations: receipt.confirmations,
        blockNumber: receipt.blockNumber,
      };
    } else {
      logger.warn(`⚠️  Timeout waiting for confirmation after ${maxWaitTime}ms`);
      return {
        confirmed: false,
        reason: 'timeout',
        maxWaitTime: maxWaitTime,
      };
    }
  } catch (error) {
    logger.error(`Error waiting for confirmation:`, error.message);
    return {
      confirmed: false,
      reason: error.message,
    };
  }
}

/**
 * Estimate gas fee for ERC20 transfer in ETH
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<number>} Estimated fee in ETH
 */
async function estimateTokenTransferFee(tokenAddress) {
  try {
    const feeData = await provider.getFeeData();

    // Typical ERC20 transfer uses ~65,000 gas
    const gasLimit = 65000n;
    const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei');

    const estimatedFee = gasLimit * maxFeePerGas;
    const feeInETH = parseFloat(ethers.formatEther(estimatedFee));

    logger.info(`💰 Estimated ERC20 transfer fee: ${feeInETH.toFixed(6)} ETH`);

    return feeInETH;
  } catch (error) {
    logger.error(`Error estimating fee:`, error.message);
    // Return a conservative estimate
    return 0.005; // 0.005 ETH ~ $10-15 at current prices
  }
}

/**
 * Recover leftover ETH from a wallet after sweep
 * @param {string} fromPrivateKey - Wallet private key
 * @param {string} toAddress - Destination address (hot wallet)
 * @param {number} minAmount - Minimum amount to recover (default: 0.001 ETH)
 * @returns {Promise<object>} Recovery result
 */
async function recoverLeftoverETH(fromPrivateKey, toAddress, minAmount = 0.001) {
  try {
    const cleanedKey = cleanPrivateKey(fromPrivateKey);
    const wallet = new ethers.Wallet(cleanedKey, provider);
    const fromAddress = wallet.address;

    logger.info(`🔄 ETH Recovery from ${fromAddress}`);

    // Get current balance
    const balance = await getETHBalance(fromAddress);
    logger.info(`💰 Current balance: ${balance} ETH`);

    // Get gas price for estimation
    const feeData = await provider.getFeeData();
    const gasLimit = 21000n;
    const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei');

    // Calculate gas cost
    const gasCost = gasLimit * maxFeePerGas;
    const gasCostETH = parseFloat(ethers.formatEther(gasCost));

    // Calculate amount to recover (balance - gas cost)
    const amountToRecover = balance - gasCostETH;

    logger.info(`⛽ Estimated gas cost: ${gasCostETH.toFixed(6)} ETH`);
    logger.info(`📤 Amount to recover: ${amountToRecover.toFixed(6)} ETH`);

    // Check if amount is worth recovering
    if (amountToRecover < minAmount) {
      logger.info(`⚠️  Amount too low (${amountToRecover.toFixed(6)} ETH), skipping recovery`);
      return { success: false, reason: 'insufficient_amount' };
    }

    // Execute recovery
    const result = await sendETH(fromPrivateKey, toAddress, amountToRecover);

    if (result.success) {
      logger.info(`✅ ETH Recovery SUCCESS!`);
      logger.info(`   Amount: ${amountToRecover.toFixed(6)} ETH`);
      logger.info(`   TX Hash: ${result.txHash}`);

      return {
        success: true,
        txHash: result.txHash,
        amount: amountToRecover,
        gasCost: gasCostETH
      };
    } else {
      throw new Error(result.error || 'Transaction failed');
    }

  } catch (error) {
    logger.error(`❌ ETH recovery failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export all functions
module.exports = {
  provider,
  cleanPrivateKey,
  getETHBalance,
  getTokenBalance,
  getUSDTBalance,
  getUSDCBalance,
  sendETH,
  sendToken,
  sendUSDT,
  sendUSDC,
  waitForConfirmation,
  estimateTokenTransferFee,
  recoverLeftoverETH,
  USDT_CONTRACT_ADDRESS,
  USDC_CONTRACT_ADDRESS,
};
