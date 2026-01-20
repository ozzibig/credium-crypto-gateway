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

-- Telegram Whitelabel mapping (Turtle user → Telegram user)
CREATE TABLE IF NOT EXISTS telegram_whitelabel (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    turtle_user_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Profiles table (KYC status tracking)
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    turtle_user_id TEXT UNIQUE,
    kyc_status VARCHAR(50) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'submitted', 'approved', 'rejected')),
    kyc_rejection_reason TEXT,
    kyc_submitted_at TIMESTAMP,
    kyc_updated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cards table (with Turtle integration fields)
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    card_id TEXT UNIQUE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    turtle_user_id TEXT,
    card_type VARCHAR(50) NOT NULL,
    last_four_digits VARCHAR(4),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Transactions table (card operations and topups)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT UNIQUE NOT NULL,
    card_id TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('card_transaction', 'topup', 'withdrawal', 'refund')),
    amount DECIMAL(18, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    merchant_name TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ MIGRATIONS FOR EXISTING TABLES ============
-- These MUST run BEFORE indexes to ensure columns exist

-- Migration: Add card_id column to cards if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cards' AND column_name = 'card_id'
    ) THEN
        ALTER TABLE cards ADD COLUMN card_id TEXT;
    END IF;
END $$;

-- Migration: Add turtle_user_id column to cards if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cards' AND column_name = 'turtle_user_id'
    ) THEN
        ALTER TABLE cards ADD COLUMN turtle_user_id TEXT;
    END IF;
END $$;

-- Migration: Add last_four_digits column to cards if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cards' AND column_name = 'last_four_digits'
    ) THEN
        ALTER TABLE cards ADD COLUMN last_four_digits VARCHAR(4);
    END IF;
END $$;

-- Migration: Add updated_at column to cards if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cards' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE cards ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Add unique constraint to card_id if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cards_card_id_key'
    ) THEN
        ALTER TABLE cards ADD CONSTRAINT cards_card_id_key UNIQUE (card_id);
    END IF;
EXCEPTION WHEN others THEN
    -- Ignore if constraint already exists or column has duplicates
    NULL;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_cards_card_id ON cards(card_id);
CREATE INDEX IF NOT EXISTS idx_cards_turtle_user_id ON cards(turtle_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_whitelabel_telegram_id ON telegram_whitelabel(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_whitelabel_turtle_user_id ON telegram_whitelabel(turtle_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_turtle_user_id ON profiles(turtle_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status ON profiles(kyc_status);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

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
