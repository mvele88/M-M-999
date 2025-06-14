// Load environment variables from .env file
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// 🔁 Load variables from .env
// Use environment variables provided by Vercel for PORT in production
const PORT = process.env.PORT || 3000;
const BOT_PUBLIC_KEY = process.env.BOT_PUBLIC_KEY;
const API_KEY = process.env.API_KEY;

// Middleware setup
// Enable CORS for all origins, allowing requests from different domains
app.use(cors());
// Parse incoming request bodies in a middleware before your handlers, available under the req.body property.
app.use(bodyParser.json());

// 🟢 Public route for the root path (/)
// This route will respond when users access the base URL of your deployed application.
app.get('/', (req, res) => {
  res.send('Welcome to the M-M-8080 Backend Service!');
});

// 🟢 Public route for health check
// This route provides a status check for your backend.
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    // Check if BOT_PUBLIC_KEY is present in environment variables
    botPublicKeyPresent: !!BOT_PUBLIC_KEY,
  });
});

// 🔐 Protected route that checks API key
// This route requires a valid API key for access.
app.post('/api/start', (req, res) => {
  // Get the API key from the 'x-api-key' header
  const clientKey = req.headers['x-api-key'];

  // Validate the API key against the one loaded from environment variables
  if (clientKey !== API_KEY) {
    // If keys do not match, send a 403 Unauthorized response
    return res.status(403).json({ error: 'Unauthorized – invalid API key' });
  }

  // If the API key is valid, proceed with the bot logic (placeholder for now)
  // You would integrate your real Solana bot logic here
  res.json({ success: true, message: 'Sniping bot started!' });
});

// 🚀 Start server
// In a Vercel environment, process.env.PORT is automatically provided.
// Locally, it will fall back to 3000 if PORT is not set in .env.
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
