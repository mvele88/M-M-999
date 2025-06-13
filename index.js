require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = 'crypto-api-secure-key-2025';
const BOT_PUBLIC_KEY = new PublicKey(process.env.BOT_PUBLIC_KEY); // Set in .env

// Middleware
app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key === API_KEY) return next();
  return res.status(403).json({ success: false, error: 'Unauthorized request' });
});

let isSniping = false;

app.post('/api/start', async (req, res) => {
  const wallet = req.body.wallet;
  if (!wallet) return res.status(400).json({ success: false, error: 'Missing wallet address' });

  isSniping = true;
  console.log(`[✓] Sniping started for wallet: ${wallet}`);
  return res.status(200).json({ success: true, message: 'Sniping started' });
});

app.post('/api/stop', async (req, res) => {
  isSniping = false;
  console.log(`[✓] Sniping stopped`);
  return res.status(200).json({ success: true, message: 'Sniping stopped' });
});

// Real-Time Bot Wallet Balance Endpoint using public Solana mainnet RPC
app.get('/api/bot-balance', async (req, res) => {
  try {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const balanceLamports = await connection.getBalance(BOT_PUBLIC_KEY);
    const sol = balanceLamports / LAMPORTS_PER_SOL;
    const usdPricePerSol = 150; // Update if needed or fetch dynamically
    const usd = sol * usdPricePerSol;
    res.json({ sol: sol.toFixed(4), usd: usd.toFixed(2) });
  } catch (err) {
    console.error('Error fetching bot balance:', err);
    res.status(500).json({ error: 'Failed to retrieve bot balance.' });
  }
});

// Health check endpoint
app.get('/status', (req, res) => {
  res.status(200).json({ online: true, sniping: isSniping });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
