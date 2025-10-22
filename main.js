// main.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const os = require('os');
const axios = require('axios');

const { Storage, File } = require('megajs'); // <-- restored MEGA
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  jidDecode
} = require('@whiskeysockets/baileys');

const storageAPI = require('./file-storage');
const assets = require('./assets.json');

const pluginsDir = path.join(__dirname, 'plugins');
const pluginFiles = fs.existsSync(pluginsDir) ? fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js')) : [];
const plugins = [];

// load plugins
for (const f of pluginFiles) {
  try {
    const p = require(path.join(pluginsDir, f));
    plugins.push(p);
    if (typeof p.init === 'function') p.init({ storage: storageAPI, assets });
    console.log('Loaded plugin:', p.name || f);
  } catch (e) {
    console.error('Failed loading plugin', f, e);
  }
}

const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || process.env.OWNER_NUMBER || '').split(',').map(s => s.trim()).filter(Boolean);
const ADMIN_NOTIFY_NUMBER = (process.env.ADMIN_NOTIFY_NUMBER || '').trim(); // single admin to notify on connect
const CONNECT_CHANNEL_JID = assets.joinChannelJid || null; // newsletter JID
const CONNECT_CHANNEL_URL = assets.joinChannelUrl || null;
const CONNECT_GROUP_INVITE = assets.joinGroupInvite || null;

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = path.resolve(process.env.SESSION_BASE_PATH || './session');

fs.ensureDirSync(SESSION_BASE_PATH);
fs.ensureDirSync(path.resolve(process.cwd(), 'data'));

// helper to run plugin handlers
async function runPluginsForCommand(cmd, ctx = {}) {
  for (const p of plugins) {
    try {
      if ((p.commands || []).includes(cmd) && typeof p.handle === 'function') {
        await p.handle(ctx);
        return true;
      }
    } catch (e) {
      console.error('plugin error', p.name, e);
    }
  }
  return false;
}

async function runPluginsForMessage(ctx) {
  for (const p of plugins) {
    try {
      if (typeof p.handle === 'function') {
        await p.handle(ctx);
      }
    } catch (e) {
      console.error('plugin message handler error', p.name, e);
    }
  }
}

function makeReply(socket, msg) {
  return async (text) => {
    try { await socket.sendMessage(msg.key.remoteJid, { text }, { quoted: msg }); } catch (e) { console.warn('reply failed', e); }
  }
}

async function tryAutoJoin(socket) {
  try {
    if (CONNECT_CHANNEL_JID && typeof socket.newsletterFollow === 'function') {
      try { await socket.newsletterFollow(CONNECT_CHANNEL_JID); console.log('Joined newsletter jid', CONNECT_CHANNEL_JID); } catch(e) {}
    }
    if (CONNECT_GROUP_INVITE) {
      console.log('Group invite configured:', CONNECT_GROUP_INVITE);
    }
  } catch (e) {
    console.warn('autoJoin error', e);
  }
}

async function kavixmdminibotmessagehandler(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg?.message || msg.key.remoteJid === 'status@broadcast') continue;

        const setting = await storageAPI.getSettings(number);
        const remoteJid = msg.key.remoteJid;
        const jidNumber = remoteJid.split('@')[0];
        const isGroup = remoteJid.endsWith('@g.us');
        const isOwner = OWNER_NUMBERS.some(o => jidNumber.endsWith(o));
        const msgContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
        const body = (msgContent || '').trim();
        const PREFIX = process.env.PREFIX || '.';
        const isCommand = body.startsWith(PREFIX);
        const reply = makeReply(socket, msg);

        const placeholder = {
          jid: msg.key.remoteJid,
          sender: msg.key.participant || msg.key.remoteJid,
          id: msg.key.id
        };

        if (msg.key.remoteJid === 'status@broadcast') {
          if (setting.autoswview) { try { await socket.readMessages([msg.key]); } catch(e) {} }
          if (setting.autoswlike) {
            try {
              const emojis = ['❤️','🧡','💛','💚','💙','💜'];
              const randomEmoji = emojis[Math.floor(Math.random()*emojis.length)];
              await socket.sendMessage(msg.key.remoteJid, { react: { key: msg.key, text: randomEmoji } }, { statusJidList: [msg.key.participant, socket.user.id] });
            } catch(e){}
          }
          continue;
        }

        await runPluginsForMessage({ socket, msg, text: body, number, reply, storage: storageAPI, placeholder });

        if (!isCommand) continue;

        const parts = body.slice(PREFIX.length).trim().split(/ +/);
        const command = parts.shift().toLowerCase();
        const args = parts;

        let handled = false;
        for (const p of plugins) {
          try {
            if ((p.commands || []).includes(command) && typeof p.handle === 'function') {
              await p.handle({ socket, msg, args, number, reply, storage: storageAPI, placeholder });
              handled = true;
              break;
            }
          } catch (e) {
            console.error('plugin command error', p.name, e);
            await reply('Command failed: ' + (e.message || e));
            handled = true;
            break;
          }
        }

        if (!handled) {
          await reply('Unknown command. Send .menu to see commands.');
        }
      } catch (e) {
        console.error('messages.upsert handler error', e);
      }
    }
  });
}

async function kavixmdminibotstatushandler(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {});
  socket.ev.on('group-participants.update', async (update) => {
    try {
      const jid = update.id;
      const welcomePlugin = plugins.find(p => p.name === 'welcome');
      if (welcomePlugin && typeof welcomePlugin.sendWelcome === 'function') {
        await welcomePlugin.sendWelcome({ socket, jid, participants: update.participants.map(p => ({ id: p, action: update.action })), storage: storageAPI });
      }
    } catch (e) {
      console.error('group participants update error', e);
    }
  });
}

/* session download/MEGA upload functions restored */
async function sessionDownload(sessionId, number, retries = 3) {
  const sanitizedNumber = (number || '').replace(/[^0-9]/g, '');
  const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
  const credsFilePath = path.join(sessionPath, 'creds.json');

  if (!sessionId || typeof sessionId !== 'string') {
    return { success: false, error: 'Invalid session ID format' };
  }

  // LOCAL fallback
  if (sessionId.startsWith('LOCAL~')) {
    const localPath = sessionId.slice('LOCAL~'.length);
    const resolved = path.isAbsolute(localPath) ? localPath : path.resolve(process.cwd(), localPath);
    if (!fs.existsSync(resolved)) return { success: false, error: 'Local creds not found' };
    return { success: true, path: resolved };
  }

  // MEGA
  if (sessionId.startsWith('SESSION-ID~')) {
    const fileCode = sessionId.split('SESSION-ID~')[1];
    const megaUrl = `https://mega.nz/file/${fileCode}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await fs.ensureDir(sessionPath);
        const file = await File.fromURL(megaUrl);
        await new Promise((resolve, reject) => {
          file.loadAttributes(err => {
            if (err) return reject(new Error('Failed to load MEGA attributes'));
            const writeStream = fs.createWriteStream(credsFilePath);
            const downloadStream = file.download();
            downloadStream.pipe(writeStream).on('finish', resolve).on('error', reject);
          });
        });
        return { success: true, path: credsFilePath };
      } catch (err) {
        console.warn(`sessionDownload (MEGA) attempt ${attempt} failed: ${err.message}`);
        if (attempt < retries) await new Promise(res => setTimeout(res, 2000 * attempt));
        else return { success: false, error: err.message };
      }
    }
  }

  return { success: false, error: 'Unsupported sessionId type' };
}

function randomMegaId(length = 6, numberLength = 4) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += characters.charAt(Math.floor(Math.random() * characters.length));
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${result}${number}`;
}

async function uploadCredsToMega(credsPath) {
  if (!process.env.MEGA_EMAIL || !process.env.MEGA_PASS) {
    throw new Error('MEGA_EMAIL and MEGA_PASS environment variables must be set');
  }

  const storage = await new Storage({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASS
  }).ready;

  if (!fs.existsSync(credsPath)) throw new Error(`File not found: ${credsPath}`);
  const fileSize = fs.statSync(credsPath).size;

  const uploadResult = await storage.upload({
    name: `${randomMegaId()}.json`,
    size: fileSize
  }, fs.createReadStream(credsPath)).complete;

  const fileNode = storage.files[uploadResult.nodeId];
  const link = await fileNode.link();
  return link;
}

/* core function */
async function cyberkaviminibot(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

  try {
    await storageAPI.saveSettings(sanitizedNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: process.env.PRINT_QR === 'true',
      logger,
      browser: Browsers.macOS('Safari'),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60000
    });

    socket.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        const decoded = jidDecode(jid) || {};
        return (decoded.user && decoded.server) ? decoded.user + '@' + decoded.server : jid;
      } else return jid;
    };

    socketCreationTime.set(sanitizedNumber, Date.now());

    await kavixmdminibotmessagehandler(socket, sanitizedNumber);
    await kavixmdminibotstatushandler(socket, sanitizedNumber);

    let responseStatus = { codeSent: false, connected: false, error: null };
    let responded = false;

    socket.ev.on('creds.update', async () => {
      try { await saveCreds(); } catch (e) { console.error('creds.update save error', e); }
    });

    socket.ev.on('connection.update', async (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qr, { small: true });
            console.log(`[ ${sanitizedNumber} ] QR code printed in terminal for scanning.`);
            if (res && !res.headersSent) {
              res.status(200).send({ status: 'qr', message: 'Scan QR with WhatsApp (Linked Devices -> Link a Device)' });
            }
          } catch (e) {
            if (res && !res.headersSent) res.status(200).send({ status: 'qr_string', qr, message: 'QR string returned.' });
            console.log(`[ ${sanitizedNumber} ] QR available (qrcode-terminal missing).`);
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          switch (statusCode) {
            case DisconnectReason.badSession:
            case DisconnectReason.loggedOut:
              try { fs.removeSync(sessionPath); } catch (e) { console.error('error clearing session', e); }
              responseStatus.error = 'Session invalid or logged out. Please pair again.';
              break;
            case DisconnectReason.connectionClosed:
              responseStatus.error = 'Connection was closed by WhatsApp';
              break;
            case DisconnectReason.connectionLost:
              responseStatus.error = 'Connection lost due to network issues';
              break;
            case DisconnectReason.connectionReplaced:
              responseStatus.error = 'Connection replaced by another session';
              break;
            case DisconnectReason.restartRequired:
              responseStatus.error = 'WhatsApp requires restart';
              try { socket.ws?.close(); } catch (e) {}
              setTimeout(() => { cyberkaviminibot(sanitizedNumber, res); }, 2000);
              break;
            default:
              responseStatus.error = shouldReconnect ? 'Unexpected disconnection. Attempting to reconnect...' : 'Connection terminated. Please try pairing again.';
          }

          activeSockets.delete(sanitizedNumber);
          socketCreationTime.delete(sanitizedNumber);

          if (!responded && res && !res.headersSent) {
            responded = true;
            res.status(500).send({ status: 'error', message: `[ ${sanitizedNumber} ] ${responseStatus.error}` });
          }
        } else if (connection === 'connecting') {
          console.log(`[ ${sanitizedNumber} ] Connecting...`);
        } else if (connection === 'open') {
          console.log(`[ ${sanitizedNumber} ] Connected successfully!`);
          activeSockets.set(sanitizedNumber, socket);
          responseStatus.connected = true;

          try {
            const credsFilePath = path.join(sessionPath, 'creds.json');
            if (!fs.existsSync(credsFilePath)) {
              console.error("File not found:", credsFilePath);
              if (!responded && res && !res.headersSent) {
                responded = true;
                res.status(500).send({ status: 'error', message: "File not found" });
              }
              return;
            }

            // Try upload to MEGA
            let sid = null;
            try {
              const megaUrl = await uploadCredsToMega(credsFilePath);
              sid = megaUrl.includes("https://mega.nz/file/") ? 'SESSION-ID~' + megaUrl.split("https://mega.nz/file/")[1] : null;
            } catch (e) {
              console.warn(`[ ${sanitizedNumber} ] uploadCredsToMega failed:`, e?.message || e);
              // fallback to local
              sid = `LOCAL~${path.relative(process.cwd(), credsFilePath)}`;
            }

            const userId = await socket.decodeJid(socket.user.id);
            if (sid) await storageAPI.upsertSession(userId, sid);

            // send connected message
            const connectedMsg = `[ ${sanitizedNumber} ] Bot I connected`;
            try { await socket.sendMessage(userId, { text: connectedMsg }); } catch (e) {}
            for (const o of OWNER_NUMBERS) {
              try {
                const ownerJid = o.includes('@') ? o : (o + '@s.whatsapp.net');
                await socket.sendMessage(ownerJid, { text: connectedMsg });
              } catch (e) {}
            }
            if (ADMIN_NOTIFY_NUMBER) {
              try {
                const adminJid = ADMIN_NOTIFY_NUMBER.includes('@') ? ADMIN_NOTIFY_NUMBER : (ADMIN_NOTIFY_NUMBER + '@s.whatsapp.net');
                await socket.sendMessage(adminJid, { text: `New bot session connected:\nNumber: ${sanitizedNumber}\nUserId: ${userId}` });
              } catch (e) {}
            }

            // try auto join / follow
            await tryAutoJoin(socket);

          } catch (e) {
            console.error('Error during open connection handling:', e);
          }

          if (!responded && res && !res.headersSent) {
            responded = true;
            res.status(200).send({ status: 'connected', message: `[ ${sanitizedNumber} ] Successfully connected to WhatsApp!` });
          }
        }
      } catch (connErr) {
        console.error('connection.update handler error', connErr);
      }
    });

    if (!socket.authState.creds.registered) {
      let retries = 3;
      let code = null;

      while (retries > 0 && !code) {
        try {
          await delay(1500);
          code = await socket.requestPairingCode(sanitizedNumber);
          if (code) {
            console.log(`[ ${sanitizedNumber} ] Pairing code generated: ${code}`);
            responseStatus.codeSent = true;
            if (!responded && res && !res.headersSent) {
              responded = true;
              res.status(200).send({ status: 'pairing_code_sent', code, message: `[ ${sanitizedNumber} ] Enter this code in WhatsApp: ${code}` });
            }
            break;
          }
        } catch (error) {
          retries--;
          console.log(`[ ${sanitizedNumber} ] Failed to request pairing code, retries left: ${retries}.`);
          if (retries > 0) await delay(300 * (4 - retries));
        }
      }

      if (!code && !responded && res && !res.headersSent) {
        responded = true;
        res.status(500).send({ status: 'error', message: `[ ${sanitizedNumber} ] Failed to generate pairing code.` });
      }
    } else {
      console.log(`[ ${sanitizedNumber} ] Already registered, connecting...`);
    }

    setTimeout(() => {
      if (!responseStatus.connected && !responded && res && !res.headersSent) {
        responded = true;
        res.status(408).send({ status: 'timeout', message: `[ ${sanitizedNumber} ] Connection timeout. Please try again.` });
        if (activeSockets.has(sanitizedNumber)) {
          try { activeSockets.get(sanitizedNumber).ws?.close(); } catch (e) {}
          activeSockets.delete(sanitizedNumber);
        }
        socketCreationTime.delete(sanitizedNumber);
      }
    }, Number(process.env.CONNECT_TIMEOUT_MS || 60000));
  } catch (error) {
    console.error(`[ ${number} ] Setup error:`, error && error.stack ? error.stack : error);
    if (res && !res.headersSent) {
      try { res.status(500).send({ status: 'error', message: `[ ${number} ] Failed to initialize connection.` }); } catch (e) {}
    }
  }
}

/* startAllSessions */
async function startAllSessions() {
  try {
    const sessions = await storageAPI.findSessions();
    console.log(`🔄 Found ${sessions.length} sessions to reconnect.`);

    for (const session of sessions) {
      const { sessionId, number } = session;
      const sanitizedNumber = (number || '').replace(/[^0-9]/g, '');
      if (activeSockets.has(sanitizedNumber)) {
        console.log(`[ ${sanitizedNumber} ] Already connected. Skipping...`);
        continue;
      }
      try {
        const dl = await sessionDownload(sessionId, sanitizedNumber);
        if (!dl.success) {
          console.warn(`[ ${sanitizedNumber} ] sessionDownload failed: ${dl.error}`);
          continue;
        }
        await cyberkaviminibot(sanitizedNumber, { headersSent: true, status: () => ({ send: () => {} }) });
      } catch (err) {
        console.error('startAllSessions error', err);
      }
    }
    console.log('✅ Auto-reconnect process completed.');
  } catch (err) {
    console.error('startAllSessions error', err);
  }
}

/* router endpoint */
router.get('/', async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) return res.status(400).send({ status: 'error', message: 'Number parameter is required' });

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (!sanitizedNumber || sanitizedNumber.length < 10) return res.status(400).send({ status: 'error', message: 'Invalid phone number format' });

    if (activeSockets.has(sanitizedNumber)) return res.status(200).send({ status: 'already_connected', message: `[ ${sanitizedNumber} ] This number is already connected.` });

    await cyberkaviminibot(number, res);
  } catch (err) {
    console.error('router / error', err);
    try { res.status(500).send({ status: 'error', message: 'Internal Server Error' }); } catch (e) {}
  }
});

process.on('exit', async () => {
  for (const [number, socket] of activeSockets.entries()) {
    try { socket.ws?.close(); } catch (error) { console.error(`[ ${number} ] Failed to close connection.`); }
    activeSockets.delete(number);
    socketCreationTime.delete(number);
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { router, startAllSessions };
