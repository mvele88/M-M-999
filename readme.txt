# Enhanced Crypto Backend

A production-ready cryptocurrency backend service supporting Bitcoin and Solana transactions with automated profit distribution.

## Features

- ✅ **Full Bitcoin Integration** - Send BTC with proper UTXO management and fee estimation
- ✅ **Complete Solana Support** - Send SOL with transaction confirmation
- ✅ **Automated Profit Distribution** - Monthly distribution with retry logic
- ✅ **Security** - API key authentication, rate limiting, helmet security headers
- ✅ **Comprehensive Logging** - Winston logger with file and console output
- ✅ **Error Handling** - Robust error handling with graceful degradation
- ✅ **State Management** - Persistent state and history tracking
- ✅ **Health Monitoring** - Health check endpoint and status monitoring
- ✅ **Production Ready** - Environment-based configuration, graceful shutdown

## Quick Start

### 1. Installation

```bash
git clone <your-repo>
cd crypto-backend
npm install
```

### 2. Environment Setup

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```bash
# Required
API_KEY=your-super-secret-api-key
BTC_WIF=your-bitcoin-private-key-wif
SOL_PRIVATE_KEY=your-solana-private-key-base58

# Optional (uses defaults if not provided)
USER_BTC_60=your-60-percent-btc-address
USER_BTC_20=your-20-percent-btc-address
RESERVE_BTC=your-reserve-btc-address
SNIPER_SOL=your-solana-sniper-address
BOT_SOL=your-solana-bot-address
```

### 3. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

All endpoints require authentication via `X-API-Key` header or `apiKey` query parameter.

### Core Operations

#### Start Sniping
```bash
POST /api/start
Content-Type: application/json
X-API-Key: your-api-key

{
  "wallet": "SolanaWalletAddress"
}
```

#### Stop Sniping
```bash
POST /api/stop
X-API-Key: your-api-key
```

#### Add Profit
```bash
POST /api/profit
Content-Type: application/json
X-API-Key: your-api-key

{
  "amount": 0.001
}
```

### Monitoring

#### Get Status
```bash
GET /api/status
X-API-Key: your-api-key
```

#### Get History
```bash
GET /api/history?limit=50&offset=0
X-API-Key: your-api-key
```

#### Health Check
```bash
GET /health
# No authentication required
```

### Admin Operations

#### Manual Distribution
```bash
POST /api/distribute
X-API-Key: your-api-key
X-Admin-Key: your-admin-key
```

## Profit Distribution

The system automatically distributes profits monthly (1st of each month at midnight UTC):

- **60%** → USER_BTC_60 address
- **20%** → USER_BTC_20 address  
- **20%** → RESERVE_BTC address
- **100 SOL** → SNIPER_SOL address (for refueling)

### Retry Logic
- Attempts 1-10: Retry every 5 minutes
- Attempts 11-17: Retry every 24 hours
- After 17 attempts: Log failure and stop

## Security Features

- **Authentication**: API key required for all endpoints
- **Rate Limiting**: 100 requests per 15 minutes (10 for sensitive endpoints)
- **CORS**: Configurable allowed origins
- **Helmet**: Security headers protection
- **Input Validation**: All inputs validated and sanitized

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | Yes | Authentication key for API access |
| `BTC_WIF` | Yes | Bitcoin private key in WIF format |
| `SOL_PRIVATE_KEY` | Yes | Solana private key in base58 format |
| `NODE_ENV` | No | Environment (development/production) |
| `PORT` | No | Server port (default: 3000) |
| `ALLOWED_ORIGINS` | No | CORS allowed origins |
| `SOLANA_RPC_URL` | No | Solana RPC endpoint |

### Network Configuration

- **Development**: Uses Bitcoin testnet and Solana devnet
- **Production**: Uses Bitcoin mainnet and Solana mainnet

## File Structure

```
crypto-backend/
├── index.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
├── .env.example          # Environment template
├── history.json          # Payment history (auto-generated)
├── state.json            # Application state (auto-generated)
├── combined.log          # All logs
├── error.log             # Error logs only
└── README.md             # This file
```

## Logging

The application uses Winston for comprehensive logging:

- **Console**: Development-friendly output
- **Files**: `combined.log` and `error.log`
- **Levels**: error, warn, info, debug

## Error Handling

- **Transaction Failures**: Automatic retry with exponential backoff
- **Network Issues**: Timeout handling and retry logic
- **Invalid Inputs**: Proper validation and error messages
- **Graceful Shutdown**: Saves state before termination

## Development

### Scripts

```bash
npm run dev        # Start with nodemon (auto-restart)
npm start          # Production start
npm test           # Run tests
npm run lint       # Check code style
npm run lint:fix   # Fix code style issues
```

### Testing

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test with authentication
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/status
```

## Deployment

### Vercel
```bash
vercel --prod
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables (Production)
Make sure to set all required environment variables in your deployment platform.

## Security Considerations

1. **Never commit private keys** to version control
2. **Use environment variables** for all sensitive data
3. **Keep API keys secret** and rotate them regularly
4. **Monitor logs** for unusual activity
5. **Use HTTPS** in production
6. **Regularly update dependencies**

## Troubleshooting

### Common Issues

1. **"Insufficient funds"**
   - Check wallet balances
   - Verify network (mainnet vs testnet)

2. **"Invalid address"**
   - Verify address format matches network
   - Check for typos in environment variables

3. **"Unauthorized"**
   - Verify API key is correct
   - Check X-API-Key header format

4. **Transaction failures**
   - Check network connectivity
   - Verify sufficient balance for fees
   - Monitor blockchain congestion

### Debug Mode

Set `LOG_LEVEL=debug` in your .env file for verbose logging.

## Support

For issues and questions:
1. Check the logs in `error.log`
2. Verify environment configuration
3. Test with health endpoint
4. Check network connectivity

## License

MIT License - see LICENSE file for details.