require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');

const app = express();
const PORT = process.env.PORT || 8080; // PORT will still default to 8080 if not explicitly set

app.use(cors());
app.use(bodyParser.json());

// --- Solana Connection and Wallets ---
// Initialize Solana Connection
const solanaConnection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

// Initialize Sniping/Fees Wallet (for Solana transactions like gas fees)
// This wallet is conceptually auto-renewed for $100 equivalent in SOL
const snipingFeesSecret = JSON.parse(process.env.SNIPING_FEES_PRIVATE_KEY_JSON);
const snipingFeesWallet = Keypair.fromSecretKey(Uint8Array.from(snipingFeesSecret));
console.log(`Sniping/Fees Wallet Public Key: ${snipingFeesWallet.publicKey.toBase58()}`);

// Initialize Bot/Compounding Wallet (for holding compounding profits in SOL)
// This wallet starts with a conceptual $4000 equivalent in SOL
const botCompoundingSecret = JSON.parse(process.env.BOT_COMPOUNDING_PRIVATE_KEY_JSON);
const botCompoundingWallet = Keypair.fromSecretKey(Uint8Array.from(botCompoundingSecret));
console.log(`Bot/Compounding Wallet Public Key: ${botCompoundingWallet.publicKey.toBase58()}`);

// --- Bitcoin Balance (Conceptual for Payouts) ---
// This balance represents funds available for Bitcoin payouts, conceptually converted
// from Solana profits. It is now REQUIRED to be set in environment variables.
let botBitcoinBalance = parseFloat(process.env.INITIAL_BTC_PAYOUT_BALANCE); // Removed default fallback

// --- Utility Functions ---

/**
 * Fetches the current SOL/USD price from CoinGecko.
 * @returns {Promise<number>} The current price of SOL in USD, or a fallback of 150 if the API call fails.
 */
async function fetchSolPrice() {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    return res.data.solana.usd;
  } catch (error) {
    console.error('Error fetching SOL price:', error.message);
    return 150; // fallback price in case of API issues
  }
}

/**
 * Conceptually converts a portion of SOL profit to BTC for payouts.
 * This simulates the process of moving funds from the compounding wallet
 * to a pool designated for Bitcoin withdrawals.
 * @param {number} solAmount The amount of SOL profit to consider for conversion.
 * @param {number} conversionRate The conceptual SOL to BTC conversion rate (e.g., based on market prices).
 */
async function conceptuallyConvertSolToBtcForPayouts(solAmount) {
  // Convert SOL to USD first, then use the REQUIRED CURRENT_BTC_USD_PRICE for conversion.
  const solPriceUsd = await fetchSolPrice();
  const btcPriceUsd = parseFloat(process.env.CURRENT_BTC_USD_PRICE); // Removed default fallback

  const usdValueFromSol = solAmount * solPriceUsd;

  // Let's assume a certain percentage of profit is converted to BTC for "Take Home"
  const takeHomePercentage = 0.5; // 50% of simulated SOL profit is available for BTC payout
  const takeHomeUsd = usdValueFromSol * takeHomePercentage;
  const takeHomeBtc = takeHomeUsd / btcPriceUsd;

  botBitcoinBalance += takeHomeBtc;
  console.log(`Converted ${solAmount.toFixed(4)} SOL ($${usdValueFromSol.toFixed(2)}) to ` +
              `${takeHomeBtc.toFixed(8)} BTC for payouts. New BTC payout balance: ${botBitcoinBalance.toFixed(8)} BTC.`);
}

// --- Endpoints ---

/**
 * Health check endpoint.
 * @route GET /
 * @returns {string} A welcome message for the backend.
 */
app.get('/', (req, res) => {
  res.send('Welcome to backend');
});

/**
 * Endpoint to check the actual SOL balance of the Sniping/Fees wallet.
 * @route GET /sol-sniping-balance
 * @returns {Object} JSON object containing the wallet's balance in SOL.
 */
app.get('/sol-sniping-balance', async (req, res) => {
  try {
    const balance = await solanaConnection.getBalance(snipingFeesWallet.publicKey);
    res.json({ publicKey: snipingFeesWallet.publicKey.toBase58(), balance: balance / 1e9 }); // Convert lamports to SOL
  } catch (error) {
    console.error('Error fetching sniping/fees wallet balance:', error.message);
    res.status(500).json({ error: 'Failed to fetch sniping/fees wallet balance.' });
  }
});

/**
 * Endpoint to check the actual SOL balance of the Bot/Compounding wallet.
 * @route GET /sol-bot-balance
 * @returns {Object} JSON object containing the wallet's balance in SOL.
 */
app.get('/sol-bot-balance', async (req, res) => {
  try {
    const balance = await solanaConnection.getBalance(botCompoundingWallet.publicKey);
    res.json({ publicKey: botCompoundingWallet.publicKey.toBase58(), balance: balance / 1e9 }); // Convert lamports to SOL
  } catch (error) {
    console.error('Error fetching bot/compounding wallet balance:', error.message);
    res.status(500).json({ error: 'Failed to fetch bot/compounding wallet balance.' });
  }
});

/**
 * Endpoint to simulate profit generation in SOL for the Bot/Compounding Wallet.
 * This also triggers a conceptual conversion of a portion of this profit to BTC
 * for eventual payouts, aligning with the "Take Home" logic in the Capital Tracker PDF.
 * @route POST /simulate-sol-profit
 * @param {Object} req.body.solAmount - The amount of SOL profit to simulate.
 * @returns {Object} JSON object indicating success and updated balances.
 */
app.post('/simulate-sol-profit', async (req, res) => {
  try {
    const { solAmount } = req.body;
    const profitSol = parseFloat(solAmount);

    if (isNaN(profitSol) || profitSol <= 0) {
      return res.status(400).json({ error: 'Valid positive SOL amount for profit simulation is required.' });
    }

    // Immediately trigger the conceptual conversion for BTC payouts
    await conceptuallyConvertSolToBtcForPayouts(profitSol);

    res.json({
      success: true,
      message: `Simulated ${profitSol} SOL profit. A portion has been conceptually converted to BTC for payouts.`,
      currentConceptualBtcPayoutBalance: botBitcoinBalance.toFixed(8)
    });

  } catch (error) {
    console.error('Error during SOL profit simulation:', error.message);
    res.status(500).json({ error: `Failed to simulate SOL profit: ${error.message}` });
  }
});

/**
 * Endpoint to check the conceptual BTC balance available for payouts.
 * This is derived from the 'Take Home' portion of simulated SOL profits.
 * @route GET /btc-payout-balance
 * @returns {Object} JSON object containing the conceptual BTC balance.
 */
app.get('/btc-payout-balance', (req, res) => {
  try {
    res.json({ balance: botBitcoinBalance.toFixed(8) });
  } catch (error) {
    console.error('Error fetching conceptual BTC payout balance:', error.message);
    res.status(500).json({ error: 'Failed to fetch conceptual BTC payout balance.' });
  }
});


/**
 * Endpoint to process a BTC withdrawal.
 * This endpoint simulates an API call to a Bitcoin sending service using Blockonomics API Key.
 *
 * @route POST /withdraw-btc
 * @param {Object} req.body.recipient - The Bitcoin address of the recipient (e.g., '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').
 * @param {Object} req.body.amount - The amount of BTC to withdraw (e.g., 0.001).
 * @returns {Object} JSON object indicating success and a transaction ID.
 */
app.post('/withdraw-btc', async (req, res) => {
  try {
    const { recipient, amount } = req.body;

    // --- Input Validation ---
    if (!recipient || typeof recipient !== 'string' || recipient.length < 26 || recipient.length > 35) {
      return res.status(400).json({ error: 'Valid Bitcoin recipient address (26-35 characters) is required.' });
    }
    const btcAmount = parseFloat(amount);
    if (isNaN(btcAmount) || btcAmount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount in BTC is required.' });
    }

    // --- Conceptual Balance Check for BTC Payouts ---
    if (btcAmount > botBitcoinBalance) {
      return res.status(400).json({ error: `Insufficient conceptual BTC payout balance. Current: ${botBitcoinBalance.toFixed(8)} BTC. Requested: ${btcAmount.toFixed(8)} BTC.` });
    }

    // --- Conceptual BTC Withdrawal API Call ---
    const withdrawalApiEndpoint = 'https://api.blockonomics.co/api/sendbitcoin'; // Conceptual direct Blockonomics send API
    const blockonomicsApiKey = process.env.BLOCKONOMICS_API_KEY;

    if (!blockonomicsApiKey) {
      console.error('BLOCKONOMICS_API_KEY is not set in environment variables.');
      return res.status(500).json({ error: 'Server configuration error: Blockonomics API Key missing.' });
    }

    const payload = {
      address: recipient,
      amount: btcAmount,
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${blockonomicsApiKey}`
    };

    console.log(`Attempting to send ${btcAmount} BTC to ${recipient} using conceptual Blockonomics API...`);

    // Simulate the actual API call to the Bitcoin sending service
    // In a real scenario, you would await this call:
    // const apiResponse = await axios.post(withdrawalApiEndpoint, payload, { headers: headers });
    // const realTxid = apiResponse.data.txid;

    const simulatedTxid = 'simulated_btc_txid_' + Date.now().toString() + Math.random().toString(36).substring(2, 10);

    // --- Conceptual Balance Update ---
    botBitcoinBalance -= btcAmount;

    console.log(`Successfully simulated BTC withdrawal. TxID: ${simulatedTxid}. Remaining BTC Payout Balance: ${botBitcoinBalance.toFixed(8)} BTC`);

    res.json({
      success: true,
      message: 'BTC withdrawal initiated successfully (simulated).',
      txid: simulatedTxid,
      remainingBalance: botBitcoinBalance.toFixed(8)
    });

  } catch (error) {
    console.error('Error during BTC withdrawal:', error.message);
    res.status(500).json({ error: `Failed to process BTC withdrawal: ${error.message}` });
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 Backend live on port ${PORT}`);
});
