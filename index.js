
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

const secret = JSON.parse(process.env.BOT_PRIVATE_KEY_JSON);
const botWallet = Keypair.fromSecretKey(Uint8Array.from(secret));

// Check balance endpoint
app.get('/balance', async (req, res) => {
  try {
    const balance = await connection.getBalance(botWallet.publicKey);
    res.json({ balance: balance / 1e9 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Withdraw endpoint
app.post('/withdraw', async (req, res) => {
  try {
    const { recipient, amount } = req.body;
    const recipientPubkey = new PublicKey(recipient);
    const lamports = Math.floor(parseFloat(amount) * 1e9);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: botWallet.publicKey,
        toPubkey: recipientPubkey,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [botWallet]);
    res.json({ success: true, tx: signature });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend live on port ${PORT}`));
