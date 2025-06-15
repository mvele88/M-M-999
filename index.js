require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');

// Firebase Admin SDK for server-side interaction with Firestore
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

// --- Firebase Initialization (for Firestore) ---
let db; // Firestore database instance
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialize Firebase Admin SDK using the service account key from environment variables.
// This is critical for secure server-side access to Firestore.
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccountKeyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    console.log("Attempting to parse FIREBASE_SERVICE_ACCOUNT_KEY.");
    console.log(`Key string length: ${serviceAccountKeyString.length}`);
    // Log a small snippet around the expected problematic position (position 6 from error)
    console.log(`Snippet around pos 0-20: '${serviceAccountKeyString.substring(0, 20)}'`);
    console.log(`Snippet around pos 0-10 (raw chars): ${Array.from(serviceAccountKeyString.substring(0, 10)).map(c => `U+${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join(' ')}`);


    const parsedServiceAccountKey = JSON.parse(serviceAccountKeyString);

    if (!admin.apps.length) { // Prevent re-initialization in hot-reloading environments
      admin.initializeApp({
        credential: admin.credential.cert(parsedServiceAccountKey),
        // databaseURL: `https://${parsedServiceAccountKey.project_id}.firebaseio.com` // Optional
      });
    }
    db = admin.firestore();
    console.log(`Firestore initialized for app: ${appId}`);
  } catch (e) {
    console.error("Failed to initialize Firebase Admin SDK. Please check FIREBASE_SERVICE_ACCOUNT_KEY format and content:", e);
    // Exit the process so Vercel flags the deployment as failed
    process.exit(1);
  }
} else {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Firestore will not be initialized.");
  process.exit(1); // Exit if critical component is missing
}


// --- Solana Connection and Wallets ---
// Ensure SOLANA_RPC_URL is set in environment variables
if (!process.env.SOLANA_RPC_URL) {
    console.error("SOLANA_RPC_URL environment variable is not set.");
    process.exit(1);
}
const solanaConnection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

// Initialize Sniping/Fees Wallet from private key JSON
if (!process.env.SNIPING_FEES_PRIVATE_KEY_JSON) {
    console.error("SNIPING_FEES_PRIVATE_KEY_JSON environment variable is not set.");
    process.exit(1);
}
const snipingFeesSecret = JSON.parse(process.env.SNIPING_FEES_PRIVATE_KEY_JSON);
const snipingFeesWallet = Keypair.fromSecretKey(Uint8Array.from(snipingFeesSecret));
console.log(`Sniping/Fees Wallet Public Key: ${snipingFeesWallet.publicKey.toBase58()}`);

// Initialize Bot/Compounding Wallet from private key JSON
if (!process.env.BOT_COMPOUNDING_PRIVATE_KEY_JSON) {
    console.error("BOT_COMPOUNDING_PRIVATE_KEY_JSON environment variable is not set.");
    process.exit(1);
}
const botCompoundingSecret = JSON.parse(process.env.BOT_COMPOUNDING_PRIVATE_KEY_JSON);
const botCompoundingWallet = Keypair.fromSecretKey(Uint8Array.from(botCompoundingSecret));
console.log(`Bot/Compounding Wallet Public Key: ${botCompoundingWallet.publicKey.toBase58()}`);

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
  }
  catch (error) {
    console.error('Error fetching bot/compounding wallet balance:', error.message);
    res.status(500).json({ error: 'Failed to fetch bot/compounding wallet balance.' });
  }
});

/**
 * Endpoint to check the *actual* BTC balance using Blockonomics Wallet Watcher.
 * This requires BLOCKONOMICS_API_KEY and BLOCKONOMICS_XPUB to be set.
 * @route GET /btc-payout-balance
 * @returns {Object} JSON object containing the actual BTC balance.
 */
app.get('/btc-payout-balance', async (req, res) => {
  const blockonomicsApiKey = process.env.BLOCKONOMICS_API_KEY;
  const blockonomicsXpub = process.env.BLOCKONOMICS_XPUB;

  if (!blockonomicsApiKey || !blockonomicsXpub) {
    return res.status(500).json({ error: 'Missing BLOCKONOMICS_API_KEY or BLOCKONOMICS_XPUB for BTC balance check.' });
  }

  try {
    const blockonomicsBalanceUrl = `https://www.blockonomics.co/api/xpub/${blockonomicsXpub}`;
    const response = await axios.get(blockonomicsBalanceUrl, {
      headers: {
        'Authorization': `Bearer ${blockonomicsApiKey}` // Or adjust if Blockonomics uses Basic Auth/query param
      }
    });

    const confirmedBalanceSatoshis = response.data.response[0].confirmed; // Assuming first wallet in response
    const btcBalance = confirmedBalanceSatoshis / 1e8; // Convert satoshis to BTC

    res.json({ balance: btcBalance.toFixed(8) });
  } catch (error) {
    console.error('Error fetching actual BTC payout balance:', error.message);
    // Log more details if possible from error.response
    if (error.response) {
      console.error('Blockonomics API Error Response (BTC balance):', error.response.data);
    }
    res.status(500).json({ error: 'Failed to fetch actual BTC payout balance. Check API key/xPub or Blockonomics status.' });
  }
});

/**
 * Endpoint to get the total recorded SOL profit from Firestore.
 * @route GET /total-recorded-profit
 * @returns {Object} JSON object with totalSolProfit.
 */
app.get('/total-recorded-profit', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Firestore not initialized.' });
  }
  try {
    const profitsRef = db.collection(`artifacts/${appId}/public/data/profits`);
    const profitsSnapshot = await profitsRef.get();
    let totalSolProfit = 0;
    profitsSnapshot.forEach(doc => {
      totalSolProfit += doc.data().solAmount;
    });
    res.json({ totalSolProfit: totalSolProfit });
  } catch (error) {
    console.error('Error fetching total recorded profit:', error.message);
    res.status(500).json({ error: 'Failed to fetch total recorded profit.' });
  }
});

/**
 * Endpoint to get the last monthly process date from Firestore.
 * @route GET /last-monthly-process
 * @returns {Object} JSON object with lastProcessedMonth.
 */
app.get('/last-monthly-process', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Firestore not initialized.' });
  }
  try {
    const capitalTrackerRef = db.collection(`artifacts/${appId}/public/data/capitalTracker`);
    // Ensure you have an index on 'processedAt' field in Firestore for this query to work efficiently
    const lastProcessSnapshot = await capitalTrackerRef.orderBy('processedAt', 'desc').limit(1).get();
    let lastProcessedMonth = null;
    if (!lastProcessSnapshot.empty) {
      lastProcessedMonth = lastProcessSnapshot.docs[0].data().month;
    }
    res.json({ lastProcessedMonth: lastProcessedMonth });
  } catch (error) {
    console.error('Error fetching last monthly process date:', error.message);
    res.status(500).json({ error: 'Failed to fetch last monthly process date.' });
  }
});

/**
 * Endpoint for an external trading bot to report actual profit.
 * This profit is stored in Firestore.
 * @route POST /report-actual-profit
 * @param {string} req.body.profitId - A unique ID for this profit report (e.g., transaction hash).
 * @param {number} req.body.solAmount - The actual SOL profit earned.
 * @param {string} req.body.timestamp - ISO string timestamp of when profit occurred.
 * @returns {Object} JSON indicating success.
 */
app.post('/report-actual-profit', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Firestore not initialized.' });
  }

  const { profitId, solAmount, timestamp } = req.body;

  if (!profitId || isNaN(parseFloat(solAmount)) || parseFloat(solAmount) <= 0 || !timestamp) {
    return res.status(400).json({ error: 'profitId, positive solAmount, and timestamp are required.' });
  }

  try {
    const profitData = {
      solAmount: parseFloat(solAmount),
      timestamp: new Date(timestamp), // Store as Firestore Timestamp
      reportedAt: admin.firestore.FieldValue.serverTimestamp(), // When backend received it
      status: 'recorded'
    };

    // Store profit in a 'profits' collection under the app's public data
    const docRef = db.collection(`artifacts/${appId}/public/data/profits`).doc(profitId);
    await docRef.set(profitData, { merge: true }); // Use merge to update if ID exists

    console.log(`Actual profit reported and stored: ${profitId}, ${solAmount} SOL`);
    res.json({ success: true, message: 'Profit reported and recorded.', profitId });
  } catch (error) {
    console.error('Error reporting actual profit:', error.message);
    res.status(500).json({ error: `Failed to report profit: ${error.message}` });
  }
});

/**
 * Endpoint to process monthly financial data and initiate SOL transfers.
 * This endpoint would be triggered by a Vercel Cron Job.
 * It fetches profits, calculates 100% 'Take Home' in SOL, and triggers SOL transfer to exchange.
 * The subsequent BTC conversion and distribution are manual steps for the user.
 * @route POST /process-monthly-data
 * @param {string} [req.body.month] - Optional: Specify month/year (e.g., "2025-06") for processing.
 * @returns {Object} JSON indicating processing status.
 */
app.post('/process-monthly-data', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Firestore not initialized.' });
  }

  // Define the month to process. Defaults to current month.
  const targetMonth = req.body.month || new Date().toISOString().slice(0, 7); //YYYY-MM

  try {
    // 1. Fetch profits for the target month from Firestore
    // This is a simplified query; in real app, you'd filter by timestamp range for the month
    const profitsRef = db.collection(`artifacts/${appId}/public/data/profits`);
    const profitsSnapshot = await profitsRef
      .where('timestamp', '>=', new Date(`${targetMonth}-01T00:00:00Z`))
      .where('timestamp', '<', new Date(new Date(`${targetMonth}-01T00:00:00Z`).setMonth(new Date(`${targetMonth}-01T00:00:00Z`).getMonth() + 1)))
      .get();

    let totalProfitSolThisMonth = 0;
    profitsSnapshot.forEach(doc => {
      totalProfitSolThisMonth += doc.data().solAmount;
    });

    console.log(`Processing month ${targetMonth}. Total SOL profit: ${totalProfitSolThisMonth.toFixed(4)}`);

    // 2. 100% of monthly profit is 'Take Home' for transfer.
    const solToTransferForTakeHome = totalProfitSolThisMonth; // 100%

    if (solToTransferForTakeHome <= 0) {
        return res.json({ success: true, message: `No sufficient profit to process for month ${targetMonth}. No SOL transfer initiated.` });
    }

    // 3. Initiate SOL Transfer to Exchange for subsequent manual BTC Conversion
    const exchangeDepositAddress = process.env.SOL_TO_BTC_EXCHANGE_DEPOSIT_ADDRESS;
    if (!exchangeDepositAddress) {
      return res.status(500).json({ error: 'SOL_TO_BTC_EXCHANGE_DEPOSIT_ADDRESS is not set for SOL transfer.' });
    }

    const recipientPubkey = new PublicKey(exchangeDepositAddress);
    const lamports = Math.floor(solToTransferForTakeHome * 1e9);

    if (lamports <= 0) {
      return res.json({ success: true, message: `Calculated SOL for transfer is too small for month ${targetMonth}.` });
    }

    // Check bot compounding wallet balance before transfer
    const botBalance = await solanaConnection.getBalance(botCompoundingWallet.publicKey);
    if (botBalance < lamports) {
      return res.status(400).json({ error: `Insufficient SOL in bot compounding wallet (${botBalance / 1e9} SOL) to transfer ${solToTransferForTakeHome} SOL.` });
    }

    console.log(`Initiating SOL transfer of ${solToTransferForTakeHome} SOL to exchange deposit address: ${exchangeDepositAddress}`);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: botCompoundingWallet.publicKey,
        toPubkey: recipientPubkey,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(solanaConnection, tx, [botCompoundingWallet]);
    console.log(`SOL transfer to exchange successful. Tx: ${signature}`);

    // 4. Update Capital Tracker in Firestore
    const capitalTrackerDocRef = db.collection(`artifacts/${appId}/public/data/capitalTracker`).doc(targetMonth);
    await capitalTrackerDocRef.set({
      month: targetMonth,
      totalProfitSol: totalProfitSolThisMonth,
      solTransferredForTakeHome: solToTransferForTakeHome,
      solTransferTxId: signature,
      status: 'processed_sol_transfer', // Indicate that SOL was transferred
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({
      success: true,
      message: `Monthly data for ${targetMonth} processed. SOL transferred to exchange.`,
      solTransferTxId: signature,
      nextStep: "Action Required: Manually log into your exchange (Coinbase), convert SOL to BTC, and distribute BTC to your payout addresses (60% to USER_BTC_60, 20% to USER_BTC_20, 20% to RESERVE_BTC_20)."
    });

  } catch (error) {
    console.error('Error processing monthly data:', error.message);
    if (error.response) {
      console.error('Error Response:', error.response.data);
    }
    res.status(500).json({ error: `Failed to process monthly data: ${error.message}` });
  }
});

/**
 * Endpoint for BTC withdrawal. In Plan C, this operation is manual.
 * This endpoint will now inform the user that direct BTC withdrawals are not supported by the backend.
 * @route POST /withdraw-btc
 * @param {Object} req.body.recipient - The Bitcoin address of the recipient.
 * @param {Object} req.body.amount - The amount of BTC to withdraw.
 * @returns {Object} JSON indicating that the operation is manual.
 */
app.post('/withdraw-btc', async (req, res) => {
  console.warn('Attempted BTC withdrawal request. This functionality is handled manually in Plan C.');
  res.status(400).json({
    success: false,
    error: 'BTC withdrawals are handled manually via your chosen exchange (e.g., Coinbase) in this configuration. This backend no longer supports direct BTC withdrawals.'
  });
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 Backend live on port ${PORT}`);
});
