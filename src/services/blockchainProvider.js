const { ethers } = require('ethers');
const axios = require('axios');
const logger = require('../utils/logger');

const providers = {
  ethereum: new ethers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'
  ),
  polygon: new ethers.JsonRpcProvider(
    process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
  )
};

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function getBalance(address, network, tokenAddress = null) {
  try {
    if (network === 'tron') {
      return await getTronBalance(address, tokenAddress);
    }
    
    const provider = providers[network];
    if (!provider) {
      throw new Error(`Unknown network: ${network}`);
    }
    
    if (!tokenAddress) {
      // Native balance (ETH/MATIC)
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    }
    
    // ERC20 token balance
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await tokenContract.balanceOf(address);
    const decimals = await tokenContract.decimals();
    return ethers.formatUnits(balance, decimals);
    
  } catch (error) {
    logger.error(`Error getting balance for ${address} on ${network}:`, error.message);
    return '0';
  }
}

async function getTronBalance(address, tokenAddress = null) {
  try {
    if (!tokenAddress) {
      // TRX balance
      const url = `https://api.trongrid.io/v1/accounts/${address}`;
      const response = await axios.get(url);
      const balance = response.data?.data?.[0]?.balance || 0;
      return (balance / 1000000).toString(); // TRX has 6 decimals
    }
    
    // TRC20 token balance
    const url = `https://api.trongrid.io/v1/accounts/${address}`;
    const response = await axios.get(url, {
      headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY || '' }
    });
    
    const trc20 = response.data?.data?.[0]?.trc20 || [];
    const tokenData = trc20.find(t => 
      Object.keys(t)[0] === tokenAddress
    );
    
    if (tokenData) {
      const balance = tokenData[tokenAddress];
      return (balance / 1000000).toString(); // USDT/USDC have 6 decimals
    }
    
    return '0';
  } catch (error) {
    if (error.response?.status === 429) {
      logger.warn('TronGrid rate limit hit, waiting...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return '0';
    }
    logger.error(`Error getting Tron balance:`, error.message);
    return '0';
  }
}

module.exports = {
  getBalance
};
