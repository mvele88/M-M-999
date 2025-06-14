require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch'); // Ensure node-fetch is installed (added to package.json)
const { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js'); // For real bot balance
const { spawn } = require('child_process'); // For managing the bot process

const app = express();

const PORT = process.env.PORT || 8080;
// BOT_PUBLIC_KEY is now the actual address of the bot's wallet
const BOT_PUBLIC_KEY = process.env.BOT_PUBLIC_KEY; 
// BOT_PRIVATE_KEY is EXTREMELY SENSITIVE. Must be handled securely.
// For a real bot, you'd likely load a Keypair from a file or a secure vault.
// For now, it's just a placeholder variable.
const BOT_PRIVATE_KEY_BYTES = process.env.BOT_PRIVATE_KEY_BYTES ? JSON.parse(process.env.BOT_PRIVATE_KEY_BYTES) : null;

// The API_KEY from the frontend is still here for reference,
// but it will NOT be used for starting/stopping the bot in this revised version.
// You still need to manage it for other purposes if applicable.
const CLIENT_API_KEY = process.env.CLIENT_API_KEY; // Renamed from API_KEY for clarity

const BLOCKONOMICS_API_KEY = process.env.BLOCKONOMICS_API_KEY;
const USER_BTC_60 = process.env.USER_BTC_60 ? process.env.USER_BTC_60.toLowerCase() : '';
const USER_BTC_20 = process.env.USER_BTC_20 ? process.env.USER_BTC_20.toLowerCase() : '';
const RESERVE_BTC_20 = process.env.RESERVE_BTC_20 ? process.env.RESERVE_BTC_20.toLowerCase() : '';

// Ensure critical BTC addresses are set at startup
if (!USER_BTC_60 || !USER_BTC_20 || !RESERVE_BTC_20) {
    console.error("CRITICAL ERROR: One or more BTC address environment variables are missing!");
    // In a real application, you might want to exit the process or mark the app unhealthy
}
// Ensure BOT_PUBLIC_KEY is set
if (!BOT_PUBLIC_KEY) {
    console.error("CRITICAL ERROR: BOT_PUBLIC_KEY environment variable is missing!");
    // process.exit(1);
}
// Ensure BOT_PRIVATE_KEY_BYTES is set if needed for bot internal operations or balance fetching
// If your bot handles its own keys, this might not be needed directly here.
// But if this backend needs to sign transactions or check actual balance of a private key, it is.
if (!BOT_PRIVATE_KEY_BYTES || !Array.isArray(BOT_PRIVATE_KEY_BYTES)) {
    console.warn("WARNING: BOT_PRIVATE_KEY_BYTES is missing or malformed. Bot functionality might be limited.");
}


app.use(cors());
app.use(bodyParser.json());

// Solana Connection (re-usable)
const solanaConnection = new Connection(clusterApiUrl('mainnet-beta'));

// Bot process management
let botProcess = null; // Stores the ChildProcess object
let isBotActuallyRunning = false; // Tracks the actual process state

// Root route
app.get('/', (req, res) => {
    res.send('Welcome to the M & M A.I. PLATFORM Backend Service!');
});

// Health check route
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        botPublicKeyPresent: !!BOT_PUBLIC_KEY,
        isBotProcessActive: isBotActuallyRunning, // Real-time check
        // Consider adding checks for Blockonomics and CoinGecko API connectivity here
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
            console.error('CoinGecko did not return expected SOL price:', json);
            res.status(500).json({ error: 'Failed to fetch SOL price' });
        }
    } catch (error) {
        console.error('Error fetching SOL price from CoinGecko:', error.message);
        res.status(500).json({ error: 'Error fetching SOL price' });
    }
});

// Middleware to check API key on protected routes (if any still use it)
// NOTE: For 'start' and 'stop' we will use wallet signature verification instead of this.
function checkClientApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || key !== CLIENT_API_KEY) {
        return res.status(403).json({ error: 'Unauthorized – invalid client API key' });
    }
    next();
}

// Helper: fetch BTC address balance from Blockonomics API
async function getBtcAddressBalance(address) {
    if (!BLOCKONOMICS_API_KEY) {
        throw new Error('BLOCKONOMICS_API_KEY is not configured.');
    }
    const url = `https://www.blockonomics.co/api/balance?addr=${address}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${BLOCKONOMICS_API_KEY}`
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Blockonomics API error (${response.status}): ${errorText}`);
        }
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0 && data[0].balance !== undefined) {
            // data[0].balance is in satoshis
            return data[0].balance / 1e8;
        }
        throw new Error('Invalid Blockonomics response format or empty data');
    } catch (error) {
        console.error(`Error fetching BTC balance for ${address}:`, error.message);
        throw error; // Re-throw to be caught by calling function
    }
}

// Check if BTC payments meet 60/20/20 split with >= minimum required total (e.g. 0.001 BTC)
async function verifyBtcPayments() {
    try {
        if (!USER_BTC_60 || !USER_BTC_20 || !RESERVE_BTC_20) {
            return { valid: false, error: 'BTC payment addresses are not configured on the server.' };
        }

        const balance60 = await getBtcAddressBalance(USER_BTC_60);
        const balance20User = await getBtcAddressBalance(USER_BTC_20);
        const balance20Reserve = await getBtcAddressBalance(RESERVE_BTC_20);

        // Minimum total payment to allow bot start (example: 0.001 BTC total)
        const minTotalBtc = 0.001; 

        const totalPaid = balance60 + balance20User + balance20Reserve;

        // Check total threshold
        if (totalPaid < minTotalBtc) {
            return { valid: false, error: `Total BTC received too low (${totalPaid.toFixed(8)} BTC). Minimum required: ${minTotalBtc} BTC` };
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
                error: `BTC split incorrect. Expected 60/20/20 split with margin ±${margin * 100}%. Actual: ${
                    (ratio60 * 100).toFixed(2)}% / ${(ratio20UserCheck * 100).toFixed(2)}% / ${(ratio20ReserveCheck * 100).toFixed(2)}%`
            };
        }

        return { valid: true, totalPaid };
    } catch (error) {
        return { valid: false, error: 'Error verifying BTC payments: ' + error.message };
    }
}

// --- NEW BOT PROCESS MANAGEMENT ---

// Function to start the actual bot process
// This assumes your bot is a Node.js script located at a known path
// e.g., 'path/to/your/solana-sniping-bot.js'
// You will need to replace 'your_bot_script.js' with the actual path to your bot.
async function startBotProcess(userWalletAddress) {
    if (botProcess && !botProcess.killed) {
        console.warn('Attempted to start bot, but a process is already running.');
        isBotActuallyRunning = true; // Ensure state is correct
        return { success: false, error: 'Bot process is already active.' };
    }

    console.log(`Attempting to start bot for user: ${userWalletAddress}`);
    try {
        // You'll need to define the path to your actual bot script
        // For Vercel, this script would need to be part of your deployment bundle.
        // Example: if your bot script is in a 'bot' subdirectory
        const botScriptPath = './bot/solana-sniping-bot.js'; 

        // Spawn the bot process. Pass necessary info via environment variables or arguments.
        // The BOT_PUBLIC_KEY would be the wallet the bot operates from.
        // The USER_WALLET_ADDRESS would be the connected user's wallet.
        botProcess = spawn('node', [botScriptPath], {
            env: {
                ...process.env, // Inherit existing env vars
                BOT_WALLET_ADDRESS: BOT_PUBLIC_KEY,
                USER_CONNECTED_WALLET: userWalletAddress,
                // Any other bot-specific environment variables like private keys (handle with extreme care!)
                // BOT_WALLET_PRIVATE_KEY: process.env.BOT_WALLET_PRIVATE_KEY 
            },
            stdio: ['inherit', 'pipe', 'pipe'] // Pipe stdout/stderr to capture
        });

        isBotActuallyRunning = true;

        botProcess.stdout.on('data', (data) => {
            console.log(`BOT STDOUT: ${data}`);
            // You might want to log this to a file or a monitoring service
        });

        botProcess.stderr.on('data', (data) => {
            console.error(`BOT STDERR: ${data}`);
            // Crucial for debugging bot errors
        });

        botProcess.on('close', (code) => {
            console.log(`BOT PROCESS EXITED with code ${code}`);
            isBotActuallyRunning = false; // Update state when bot stops
            botProcess = null;
        });

        botProcess.on('error', (err) => {
            console.error(`Failed to start bot process: ${err.message}`);
            isBotActuallyRunning = false;
            botProcess = null;
        });

        console.log(`Bot process (PID: ${botProcess.pid}) started.`);
        return { success: true, message: 'Bot process initiated.' };

    } catch (error) {
        console.error('Error starting bot process:', error);
        isBotActuallyRunning = false;
        botProcess = null;
        return { success: false, error: `Failed to initiate bot process: ${error.message}` };
    }
}

// Function to stop the actual bot process
async function stopBotProcess() {
    if (!botProcess || botProcess.killed) {
        console.warn('Attempted to stop bot, but no active process found.');
        isBotActuallyRunning = false;
        return { success: false, error: 'No active bot process to stop.' };
    }

    console.log(`Attempting to stop bot process (PID: ${botProcess.pid}).`);
    try {
        botProcess.kill('SIGTERM'); // Send termination signal
        // You might need a more graceful shutdown mechanism within your bot script
        // or a timeout to forcefully kill if it doesn't respond.
        console.log('Termination signal sent to bot process.');
        isBotActuallyRunning = false; // Optimistically set to false
        return { success: true, message: 'Bot termination signal sent.' };
    } catch (error) {
        console.error('Error stopping bot process:', error);
        return { success: false, error: `Failed to stop bot process: ${error.message}` };
    }
}

// --- END NEW BOT PROCESS MANAGEMENT ---

// Start sniping bot - NO API KEY CHECK HERE FOR DEMO OF WALLET SIG AUTH
// This route should eventually require wallet signature verification
app.post('/api/start', async (req, res) => {
    // ----------------------------------------------------------------------
    // IMPORTANT: Implement real wallet signature verification here!
    // Example:
    // const { wallet, signature, message } = req.body;
    // const publicKey = new PublicKey(wallet);
    // const isValidSignature = await verifySignature(publicKey, signature, message);
    // if (!isValidSignature) {
    //     return res.status(403).json({ success: false, error: 'Unauthorized: Invalid wallet signature.' });
    // }
    // ----------------------------------------------------------------------

    const { wallet: userWalletAddress } = req.body; // Wallet address from the frontend

    if (!userWalletAddress) {
        return res.status(400).json({ success: false, error: 'User wallet address is required.' });
    }

    if (isBotActuallyRunning) {
        return res.status(400).json({ success: false, error: 'Sniping bot is already running.' });
    }

    // Verify BTC payments before attempting to start the bot
    const btcCheck = await verifyBtcPayments();
    if (!btcCheck.valid) {
        return res.status(400).json({ success: false, error: btcCheck.error });
    }

    // Attempt to start the real bot process
    const botStartResult = await startBotProcess(userWalletAddress);

    if (botStartResult.success) {
        console.log(`Sniping bot initiated by wallet ${userWalletAddress} with BTC paid: ${btcCheck.totalPaid.toFixed(8)} BTC`);
        res.json({ success: true, message: 'Sniping bot initiated!' });
    } else {
        console.error(`Failed to start bot: ${botStartResult.error}`);
        res.status(500).json({ success: false, error: `Failed to start sniping bot: ${botStartResult.error}` });
    }
});

// Stop sniping bot - NO API KEY CHECK HERE FOR DEMO OF WALLET SIG AUTH
// This route should eventually require wallet signature verification
app.post('/api/stop', async (req, res) => {
    // ----------------------------------------------------------------------
    // IMPORTANT: Implement real wallet signature verification here!
    // Example:
    // const { wallet, signature, message } = req.body; // You'd pass these from frontend
    // const publicKey = new PublicKey(wallet);
    // const isValidSignature = await verifySignature(publicKey, signature, message);
    // if (!isValidSignature) {
    //     return res.status(403).json({ success: false, error: 'Unauthorized: Invalid wallet signature.' });
    // }
    // ----------------------------------------------------------------------

    if (!isBotActuallyRunning) {
        return res.status(400).json({ success: false, error: 'Sniping bot is not running.' });
    }

    // Attempt to stop the real bot process
    const botStopResult = await stopBotProcess();

    if (botStopResult.success) {
        console.log('Sniping bot termination signal sent.');
        res.json({ success: true, message: 'Sniping bot stopped.' });
    } else {
        console.error(`Failed to stop bot: ${botStopResult.error}`);
        res.status(500).json({ success: false, error: `Failed to stop sniping bot: ${botStopResult.error}` });
    }
});

// Return real bot wallet profit
app.get('/api/bot-balance', checkClientApiKey, async (req, res) => {
    try {
        if (!BOT_PUBLIC_KEY) {
            return res.status(500).json({ error: 'Bot public key not configured.' });
        }

        const botPublicKey = new PublicKey(BOT_PUBLIC_KEY);
        const balanceLamports = await solanaConnection.getBalance(botPublicKey);
        const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;

        // Fetch current SOL price
        const solPriceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const solPriceJson = await solPriceRes.json();
        const solPrice = solPriceJson.solana && solPriceJson.solana.usd ? solPriceJson.solana.usd : 150; // Fallback price

        const balanceUSD = balanceSOL * solPrice;

        res.json({ usd: balanceUSD.toFixed(2), sol: balanceSOL.toFixed(4) });

    } catch (error) {
        console.error('Error fetching real bot balance:', error.message);
        res.status(500).json({ error: 'Failed to fetch bot wallet balance.' });
    }
});

app.listen(PORT, () => {
    console.log(`M & M A.I. PLATFORM backend listening on port ${PORT}`);
    // Log initial bot status
    console.log(`Initial bot process status: ${isBotActuallyRunning ? 'Running' : 'Not Running'}`);
});