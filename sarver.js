// server.js (optional)
const express = require('express');
const { router, startAllSessions } = require('./main'); // adjust path
const app = express();

app.use('/', router);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // optionally reconnect saved sessions
  startAllSessions();
});
