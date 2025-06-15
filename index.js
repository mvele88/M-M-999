require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } = require('@solana/web3.js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=solana-sniper",
  "confirmed"
);

// Replace this with your real bot wallet private key JSON
const secret = JSON.parse(process.env.BOT_PRIVATE_KEY_JSON);
const botWallet = Keypair.fromSecretKey(Uint8Array.from(secret));

// Endpoint: check balance
app.get('/balance', async (req, res) => {
  try {
    const balance = await connection.getBalance(botWallet.publicKey);
    res.json({ balance: balance / 1e9 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: withdraw to user wallet
app.post('/withdraw', async (req, res) => {
  const { recipient, amount } = req.body;

  try {
    const recipientPubkey = new PublicKey(recipient);
    const lamports = Math.floor(parseFloat(amount) * 1e9);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: botWallet.publicKey,
        toPubkey: recipientPubkey,
        lamports
      })
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [botWallet]);
    res.json({ success: true, tx: sig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend live on port ${PORT}`));