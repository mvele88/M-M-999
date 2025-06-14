require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

const PORT = process.env.PORT || 8080;
const BOT_PUBLIC_KEY = process.env.BOT_PUBLIC_KEY;
const API_KEY = process.env.API_KEY;

const BLOCKONOMICS_API_KEY = process.env.BLOCKONOMICS_API_KEY;
const USER_BTC_60 = process.env.USER_BTC_60.toLowerCase();
const USER_BTC_20 = process.env.USER_BTC_20.toLowerCase();
const RESERVE_BTC_20 = process.env.RESERVE_BTC_20.toLowerCase();

app.use(cors());
app.use(bodyParser.json());

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to the M & M A.I. PLATFORM Backend Service!');
});

// Health check route
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    botPublicKeyPresent: !!BOT_PUBLIC_KEY
  });
});

// Fetch current SOL price in USD using CoinGecko (no API key needed)
app.get('/api/sol-price', async (req, res) => {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const json = await response.json();
    if (json.solana && json.solana.usd) {
      res.json({ price: json.solana.usd });
    } else {
      res.status(500).json({ error: 'Failed to fetch SOL price' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error fetching SOL price' });
  }
});

// Middleware to check API key on protected routes
function checkApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(403).json({ error: 'Unauthorized – invalid API key' });
  }
  next();
}

// Simulated state for whether bot is running
let botRunning = false;

// Helper: fetch BTC address balance from Blockonomics API
async function getBtcAddressBalance(address) {
  const url = `https://www.blockonomics.co/api/balance?addr=${address}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${BLOCKONOMICS_API_KEY}`
      }
    });
    if (!response.ok) {
      throw new Error(`Blockonomics error: ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      // data[0].balance is in satoshis
      return data[0].balance / 1e8;
    }
    throw new Error('Invalid Blockonomics response');
  } catch (error) {
    console.error('Error fetching BTC balance:', error.message);
    throw error;
  }
}

// Check if BTC payments meet 60/20/20 split with >= minimum required total (e.g. 0.001 BTC)
async function verifyBtcPayments() {
  try {
    const balance60 = await getBtcAddressBalance(USER_BTC_60);
    const balance20User = await getBtcAddressBalance(USER_BTC_20);
    const balance20Reserve = await getBtcAddressBalance(RESERVE_BTC_20);

    // Minimum total payment to allow bot start (example: 0.001 BTC total)
    const minTotalBtc = 0.001;

    const totalPaid = balance60 + balance20User + balance20Reserve;

    // Check total threshold
    if (totalPaid < minTotalBtc) {
      return { valid: false, error: `Total BTC received too low (${totalPaid.toFixed(8)} BTC)` };
    }

    // Calculate ratios
    const ratio60 = balance60 / totalPaid;
    const ratio20UserCheck = balance20User / totalPaid;
    const ratio20ReserveCheck = balance20Reserve / totalPaid;

    // Allow a small margin ±5% due to tx differences
    const margin = 0.05;

    if (
      Math.abs(ratio60 - 0.60) > margin ||
      Math.abs(ratio20UserCheck - 0.20) > margin ||
      Math.abs(ratio20ReserveCheck - 0.20) > margin
    ) {
      return {
        valid: false,
        error: `BTC split incorrect. Expected 60/20/20 split with margin ±5%. Actual: ${(
          ratio60 * 100
        ).toFixed(2)}% / ${(ratio20UserCheck * 100).toFixed(2)}% / ${(ratio20ReserveCheck * 100).toFixed(2)}%`
      };
    }

    return { valid: true, totalPaid };
  } catch (error) {
    return { valid: false, error: 'Error verifying BTC payments: ' + error.message };
  }
}

// Start sniping bot
app.post('/api/start', checkApiKey, async (req, res) => {
  if (botRunning) {
    return res.status(400).json({ success: false, error: 'Sniping bot already running' });
  }

  // Verify BTC payments before starting
  const btcCheck = await verifyBtcPayments();
  if (!btcCheck.valid) {
    return res.status(400).json({ success: false, error: btcCheck.error });
  }

  // Start bot logic here (this is where you would integrate real Solana sniping)
  botRunning = true;
  console.log(`Sniping bot started by wallet ${req.body.wallet} with BTC paid: ${btcCheck.totalPaid.toFixed(8)} BTC`);
  res.json({ success: true, message: 'Sniping bot started!' });
});

// Stop sniping bot
app.post('/api/stop', checkApiKey, (req, res) => {
  if (!botRunning) {
    return res.status(400).json({ success: false, error: 'Sniping bot is not running' });
  }

  botRunning = false;
  console.log('Sniping bot stopped');
  res.json({ success: true, message: 'Sniping bot stopped.' });
});

// Return bot wallet profit (fetch real profit here)
app.get('/api/bot-balance', checkApiKey, (req, res) => {
  // Replace this with your real bot wallet logic to fetch profit
  // For demonstration, return dummy data
  // In real, fetch on-chain balances, calculate USD value, etc.
  if (!botRunning) {
    return res.json({ usd: 0, sol: 0 });
  }

  // Dummy example - replace with your real data retrieval
  const dummySolProfit = 3.1415;
  const dummyUsdProfit = dummySolProfit * 150; // Use fixed price or fetch live price

  res.json({ usd: dummyUsdProfit.toFixed(2), sol: dummySolProfit.toFixed(4) });
});

app.listen(PORT, () => {
  console.log(`M & M A.I. PLATFORM backend listening on port ${PORT}`);
});
