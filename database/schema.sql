-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    telegram_id BIGINT UNIQUE,
    telegram_username VARCHAR(255),
    language_code VARCHAR(10) DEFAULT 'it',
    referral_code VARCHAR(50) UNIQUE,
    referred_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration: Add language_code column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'language_code'
    ) THEN
        ALTER TABLE users ADD COLUMN language_code VARCHAR(10) DEFAULT 'it';
    END IF;
END $$;

-- User wallets
CREATE TABLE IF NOT EXISTS user_wallets (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    network TEXT NOT NULL,
    address TEXT NOT NULL,
    derivation_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, network)
);

-- Deposits
CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    network TEXT NOT NULL,
    token TEXT NOT NULL,
    from_address TEXT,
    wallet_address TEXT NOT NULL,
    amount DECIMAL(36, 18) NOT NULL,
    amount_usd DECIMAL(18, 2),
    tx_hash TEXT UNIQUE,
    block_number BIGINT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'swept', 'failed')),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    swept_at TIMESTAMP,
    sweep_tx_hash TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sweeps
CREATE TABLE IF NOT EXISTS sweeps (
    id SERIAL PRIMARY KEY,
    deposit_id INTEGER REFERENCES deposits(id),
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    network TEXT NOT NULL,
    token TEXT NOT NULL,
    amount DECIMAL(36, 18) NOT NULL,
    tx_hash TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    referred_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    karat_earned DECIMAL(20,2) DEFAULT 0,
    usdt_value DECIMAL(20,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(referrer_id, referred_id)
);

-- Karat transactions table
CREATE TABLE IF NOT EXISTS karat_transactions (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(20,2) NOT NULL,
    usdt_value DECIMAL(20,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    card_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposits(tx_hash);
CREATE INDEX IF NOT EXISTS idx_deposits_wallet_address ON deposits(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sweeps_deposit_id ON sweeps(deposit_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_karat_transactions_user_id ON karat_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);

-- Add self-referencing foreign key constraint for users.referred_by (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_referred_by_fkey'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_referred_by_fkey
            FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
