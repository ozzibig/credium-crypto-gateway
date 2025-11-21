const { generateWalletFromSeed, validateAddress } = require('../services/walletGenerator');
require('dotenv').config();

console.log('🧪 Testing Wallet Generation...\n');

const seed = process.env.MASTER_WALLET_SEED;

if (!seed) {
  console.error('❌ MASTER_WALLET_SEED not found in .env');
  console.log('Run: npm run generate-master\n');
  process.exit(1);
}

console.log('✅ Master seed found\n');
console.log('Generating 3 test wallets...\n');

for (let i = 1; i <= 3; i++) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`User Index: ${i}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  const wallets = generateWalletFromSeed(seed, i);
  
  console.log('Ethereum/Polygon:');
  console.log(`  Address: ${wallets.ethereum.address}`);
  console.log(`  Path: ${wallets.ethereum.path}`);
  console.log(`  Valid: ${validateAddress(wallets.ethereum.address, 'ethereum')}`);
  
  console.log('\nTron:');
  console.log(`  Address: ${wallets.tron.address}`);
  console.log(`  Path: ${wallets.tron.path}`);
  console.log(`  Valid: ${validateAddress(wallets.tron.address, 'tron')}`);
  
  console.log('');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('✅ Wallet generation test completed!\n');
