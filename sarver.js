// server.js
require('dotenv').config();
const express = require('express');
const { router, startAllSessions } = require('./main');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', router);

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>SILA MD MINI</title></head>
            <body>
                <h1>🤖 SILA MD MINI BOT</h1>
                <p>Bot is running successfully!</p>
                <p>Use /api?number=YOUR_NUMBER to connect</p>
            </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 SILA MD MINI running on port ${PORT}`);
    console.log(`📱 Use: http://localhost:${PORT}/api?number=255612491554`);
    
    // Start existing sessions
    setTimeout(() => {
        startAllSessions().catch(console.error);
    }, 2000);
});
