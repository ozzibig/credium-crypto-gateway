const { generateMasterSeed } = require('../services/walletGenerator');
const fs = require('fs');
const path = require('path');

console.log('🔐 Generating Master Wallet Seed...\n');

const { mnemonic, seed } = generateMasterSeed();

console.log('✅ Master Seed Generated!\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔑 MNEMONIC (24 words):');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(mnemonic);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔐 SEED (hex):');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(seed);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('⚠️  IMPORTANT: Save this seed in a SECURE location!');
console.log('⚠️  This seed controls ALL user wallets!');
console.log('⚠️  Never commit it to Git or share it!\n');

// Offer to save to .env
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('Save seed to .env file? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    const envPath = path.join(__dirname, '../../.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('MASTER_WALLET_SEED=')) {
        console.log('\n⚠️  MASTER_WALLET_SEED already exists in .env');
        console.log('Please update it manually if needed.\n');
        readline.close();
        return;
      }
    }
    
    envContent += `\n# Generated on ${new Date().toISOString()}\nMASTER_WALLET_SEED=${seed}\n`;
    fs.writeFileSync(envPath, envContent);
    console.log('\n✅ Seed saved to .env file!\n');
  } else {
    console.log('\n⚠️  Remember to add MASTER_WALLET_SEED to your .env manually!\n');
  }
  
  readline.close();
});
