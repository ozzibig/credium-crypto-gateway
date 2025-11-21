const { ethers } = require('ethers');
const crypto = require('crypto');

// Tron address generation without TronWeb
function privateKeyToTronAddress(privateKeyHex) {
  const EC = require('elliptic').ec;
  const ec = new EC('secp256k1');
  const keccak256 = require('js-sha3').keccak256;
  
  // Get public key from private key
  const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
  const pubKey = keyPair.getPublic().encode('hex', false).slice(2);
  
  // Keccak256 hash of public key
  const hash = keccak256(Buffer.from(pubKey, 'hex'));
  
  // Take last 20 bytes and add Tron prefix (0x41)
  const addressBytes = Buffer.concat([
    Buffer.from([0x41]),
    Buffer.from(hash, 'hex').slice(-20)
  ]);
  
  // Base58 encode with checksum
  const bs58 = require('bs58');
  const hash0 = crypto.createHash('sha256').update(addressBytes).digest();
  const hash1 = crypto.createHash('sha256').update(hash0).digest();
  const checksum = hash1.slice(0, 4);
  const address = bs58.encode(Buffer.concat([addressBytes, checksum]));
  
  return address;
}

function generateWalletFromSeed(seedHex, userIndex) {
  if (!seedHex || typeof seedHex !== 'string') {
    throw new Error('Invalid MASTER_WALLET_SEED');
  }
  
  // Create deterministic mnemonic from seed
  const entropy = seedHex.slice(0, 64);
  const mnemonic = ethers.Mnemonic.entropyToPhrase('0x' + entropy);
  
  // Derive EVM wallet (Ethereum & Polygon)
  const evmPath = `m/44'/60'/0'/0/${userIndex}`;
  const evmWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, evmPath);
  
  // Derive Tron wallet
  const tronPath = `m/44'/195'/0'/0/${userIndex}`;
  const tronWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, tronPath);
  const tronPrivateKey = tronWallet.privateKey.slice(2); // Remove 0x prefix
  const tronAddress = privateKeyToTronAddress(tronPrivateKey);
  
  return {
    ethereum: {
      address: evmWallet.address,
      privateKey: evmWallet.privateKey,
      path: evmPath,
      network: 'Ethereum Mainnet'
    },
    polygon: {
      address: evmWallet.address,
      privateKey: evmWallet.privateKey,
      path: evmPath,
      network: 'Polygon Mainnet'
    },
    tron: {
      address: tronAddress,
      privateKey: tronPrivateKey,
      path: tronPath,
      network: 'Tron Mainnet'
    }
  };
}

function validateAddress(address, network) {
  try {
    if (network === 'tron') {
      // Basic Tron address validation
      return address.startsWith('T') && address.length === 34;
    } else {
      return ethers.isAddress(address);
    }
  } catch {
    return false;
  }
}

module.exports = {
  generateWalletFromSeed,
  validateAddress
};
