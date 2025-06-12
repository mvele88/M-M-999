require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const winston = require('winston');
const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const bs58 = require('bs58');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} = require('@solana/web3.js');

// Initialize logger (consider limiting to console for serverless)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'crypto-backend' },
  transports: [
    new winston.transports.Console({ format: winston.format.simple() })
    // Commented out file transports because serverless environments do not persist files
    // new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'combined.log' }),
  ]
});

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests to this endpoint, please try again later.',
});

// Body parsing
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Validate environment variables (optional: consider doing this once in a startup script)
const validateConfig = () => {
  const required = [
    'NODE_ENV',
    'API_KEY',
    'X_ADMIN_KEY',
    'ALLOWED_ORIGINS',
    'BTC_WIF',
    'SOL_PRIVATE_KEY',
    'SOLANA_RPC_URL',
    'USER_BTC_60',
    'USER_BTC_20',
    'RESERVE_BTC_20',
    'SNIPER_SOL',
    'BOT_SOL'
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

try {
  validateConfig();
  logger.info('Configuration validation successful.');
} catch (error) {
  logger.error('Configuration validation failed:', error);
  // In serverless, process.exit will not stop the function, so just throw:
  throw error;
}

// Status endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Add your routes here...

// Export the app for Vercel serverless function
module.exports = app;
