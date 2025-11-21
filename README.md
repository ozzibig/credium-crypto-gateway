# 🚀 Wealty Crypto Gateway

Sistema completo di pagamento crypto multi-chain per Wealty.ai

## 📋 Features

✅ **Multi-Chain Support**: Ethereum (ERC20), Polygon, Tron (TRC20)  
✅ **HD Wallets**: Generazione automatica wallet univoci per ogni utente  
✅ **Auto-Detection**: Rilevamento automatico depositi ogni 60s  
✅ **Auto-Sweep**: Trasferimento automatico fondi a wallet principale  
✅ **REST API**: Integrazione facile con frontend  
✅ **PostgreSQL**: Database robusto per tracking  
✅ **Logging**: Winston logger completo  
✅ **Production Ready**: Deploy su Railway con 1 click  

## 🏗️ Architettura
```
User → Deposit → Unique Wallet → Monitor → Sweep → Main Wallet
```

## 📦 Installation
```bash
git clone <repo>
cd wealty-crypto-gateway
npm install
cp .env.example .env
```

## ⚙️ Configuration

1. **Generate Master Seed:**
```bash
npm run generate-master
```

2. **Configure `.env`:**
```env
MASTER_WALLET_SEED=<generated-seed>
MAIN_WALLET_ADDRESS_EVM=0x4933CE990cF2702359fc2e7729e86315777fa980
MAIN_WALLET_ADDRESS_TRON=TLazXgujrQB9hMMxMB9Z5LmJaDeHeEjGkt
```

3. **Setup Database:**
```bash
npm run setup-db
```

## 🚀 Usage

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

**Test Wallet Generation:**
```bash
npm run test-wallet
```

## 🔌 API Endpoints

### Health Check
```
GET /health
```

### Create User + Generate Wallets
```
POST /api/users
Body: { "email": "user@example.com", "full_name": "John Doe" }
```

### Get User Details
```
GET /api/users/:userId
```

### Get Deposits
```
GET /api/deposits/:userId?status=swept&limit=50
```

### Admin Stats
```
GET /api/admin/stats
GET /api/admin/pending-sweeps
```

## 🐳 Deploy Railway

1. Push to GitHub
2. Connect Railway to repo
3. Add PostgreSQL database
4. Configure environment variables
5. Deploy! 🎉

## 🔒 Security

- ⚠️ Never commit `.env` or `MASTER_WALLET_SEED`
- ✅ Use secure RPC endpoints (Infura/Alchemy)
- ✅ Enable 2FA on deployment platforms
- ✅ Regular database backups
- ✅ Monitor logs for suspicious activity

## 📊 Monitoring

- **Deposit Monitor**: Checks wallets every 60s
- **Sweep Engine**: Auto-transfers confirmed deposits
- **Winston Logging**: Complete audit trail
- **Health Endpoint**: Monitor service status

## 🛠️ Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server
- `npm run setup-db` - Initialize database
- `npm run generate-master` - Generate master seed
- `npm run test-wallet` - Test wallet generation

## 💰 Wallet Configuration

**Main Wallets (Wealty):**
- EVM (Ethereum/Polygon): `0x4933CE990cF2702359fc2e7729e86315777fa980`
- Tron: `TLazXgujrQB9hMMxMB9Z5LmJaDeHeEjGkt`

## 📈 Scaling

- Increase `MONITOR_INTERVAL_SECONDS` for more frequent checks
- Use premium RPC endpoints (Alchemy/Infura Pro)
- Enable Redis caching for API responses
- Implement queue system (Bull/RabbitMQ) for sweeps

## 🐛 Troubleshooting

**"MASTER_WALLET_SEED not configured"**
→ Run `npm run generate-master`

**"Database connection failed"**
→ Check `DATABASE_URL` in `.env`

**"RPC connection error"**
→ Verify RPC URLs and API keys

## 📄 License

MIT © Wealty Team 2025

---

**Made with ❤️ for Wealty.ai**
