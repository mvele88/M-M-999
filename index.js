const express = require('express');
const app = express();

app.get('/status', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export app
module.exports = app;
