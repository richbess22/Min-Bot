// server.js
const express = require('express');
const { router, startAllSessions } = require('./main');
const app = express();

app.use('/', router);

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // auto reconnect saved sessions (non-blocking)
  startAllSessions().catch(e => console.error('startAllSessions failed', e));
});
