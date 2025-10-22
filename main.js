// main.js (rekebishwa)
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const { Storage, File } = require('megajs');
const os = require('os');
const axios = require('axios');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  jidDecode
} = require('@whiskeysockets/baileys');
const yts = require('yt-search');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/newPublic';
const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || '').split(',').filter(Boolean);

mongoose.set('strictQuery', false);

async function connectWithRetry(uri, options = {}) {
  const maxAttempts = 5;
  let attempt = 0;
  const baseDelay = 2000;

  while (attempt < maxAttempts) {
    try {
      attempt++;
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
        ...options
      });
      console.log('✅ Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`❌ MongoDB connection attempt ${attempt} failed: ${err.message}`);
      if (attempt >= maxAttempts) {
        console.error('❌ Max MongoDB connection attempts reached.');
        throw err;
      }
      const wait = baseDelay * attempt;
      console.log(`🔁 Retrying MongoDB connection in ${wait}ms...`);
      await new Promise(res => setTimeout(res, wait));
    }
  }
}

// Connect to DB at startup (caller must handle failures)
connectWithRetry(MONGO_URI).catch(err => {
  console.error('MongoDB startup failure:', err.message);
  // do not exit immediately — allow process manager (pm2/docker) to decide; but set exitCode
  process.exitCode = 1;
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB event: connected');
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB event: disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB event: error', err.message);
});

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  number: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);

const settingsSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  settings: {
    online: { type: String, default: false },
    autoread: { type: Boolean, default: false },
    autoswview: { type: Boolean, default: false },
    autoswlike: { type: Boolean, default: false },
    autoreact: { type: Boolean, default: false },
    autorecord: { type: Boolean, default: false },
    autotype: { type: Boolean, default: false },
    worktype: { type: String, default: 'public' },
    antidelete: { type: String, default: 'off' },
    autoai: { type: String, default: 'off' },
    autosticker: { type: String, default: 'off' },
    autovoice: { type: String, default: 'off' },
    anticall: { type: Boolean, default: false },
    stemoji: { type: String, default: '❤️' },
    onlyworkgroup_links: {
      whitelist: { type: [String], default: [] }
    }
  }
});

const Settings = mongoose.model('Settings', settingsSchema);

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = path.resolve(process.env.SESSION_BASE_PATH || './session');

fs.ensureDirSync(SESSION_BASE_PATH);

const defaultSettings = {
  online: 'off',
  autoread: false,
  autoswview: false,
  autoswlike: false,
  autoreact: false,
  autorecord: false,
  autotype: false,
  worktype: 'public',
  antidelete: 'off',
  autoai: "off",
  autosticker: "off",
  autovoice: "off",
  anticall: false,
  stemoji: "❤️",
  onlyworkgroup_links: {
    whitelist: []
  }
};

async function getSettings(number) {
  const sanitized = number.replace(/\D/g, '');
  let session = await Settings.findOne({ number: sanitized });

  if (!session) {
    session = await Settings.create({ number: sanitized, settings: defaultSettings });
    return session.settings;
  }

  // Merge defaults safely
  const mergedSettings = JSON.parse(JSON.stringify(defaultSettings));

  function deepMerge(target, src) {
    for (const key of Object.keys(src)) {
      if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
        target[key] = deepMerge(target[key] || {}, src[key]);
      } else {
        target[key] = src[key];
      }
    }
    return target;
  }

  deepMerge(mergedSettings, session.settings);

  const needsUpdate = JSON.stringify(session.settings) !== JSON.stringify(mergedSettings);
  if (needsUpdate) {
    session.settings = mergedSettings;
    await session.save();
  }

  return mergedSettings;
}

async function updateSettings(number, updates = {}) {
  const sanitized = number.replace(/\D/g, '');
  let session = await Settings.findOne({ number: sanitized });

  if (!session) {
    session = await Settings.create({ number: sanitized, settings: { ...defaultSettings, ...updates } });
    return session.settings;
  }

  // Reuse deep merge
  const current = await getSettings(sanitized);
  const merged = { ...current };

  function mergeUpdates(target, src) {
    for (const key of Object.keys(src)) {
      if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
        target[key] = mergeUpdates(target[key] || {}, src[key]);
      } else {
        target[key] = src[key];
      }
    }
    return target;
  }

  mergeUpdates(merged, updates);
  session.settings = merged;
  await session.save();
  return session.settings;
}

async function saveSettings(number) {
  const sanitized = number.replace(/\D/g, '');
  let session = await Settings.findOne({ number: sanitized });
  if (!session) {
    session = await Settings.create({ number: sanitized, settings: defaultSettings });
    return session.settings;
  }

  const settings = session.settings;
  let updated = false;

  for (const key of Object.keys(defaultSettings)) {
    if (!(key in settings)) {
      settings[key] = defaultSettings[key];
      updated = true;
    } else if (typeof defaultSettings[key] === 'object' &&
      defaultSettings[key] !== null &&
      !Array.isArray(defaultSettings[key])) {
      for (const subKey of Object.keys(defaultSettings[key])) {
        if (!(subKey in settings[key])) {
          settings[key][subKey] = defaultSettings[key][subKey];
          updated = true;
        }
      }
    }
  }

  if (updated) {
    session.settings = settings;
    await session.save();
  }
  return settings;
}

function isBotOwner(jid, number, socket) {
  try {
    const cleanNumber = (number || '').replace(/\D/g, '');
    const cleanJid = (jid || '').replace(/\D/g, '');
    const decoded = jidDecode(socket.user?.id) || {};
    const bot = decoded.user;
    if (bot === number) return true;
    return OWNER_NUMBERS.some(owner => cleanNumber.endsWith(owner) || cleanJid.endsWith(owner));
  } catch (err) {
    return false;
  }
}

function getQuotedText(quotedMessage) {
  if (!quotedMessage) return '';

  if (quotedMessage.conversation) return quotedMessage.conversation;
  if (quotedMessage.extendedTextMessage?.text) return quotedMessage.extendedTextMessage.text;
  if (quotedMessage.imageMessage?.caption) return quotedMessage.imageMessage.caption;
  if (quotedMessage.videoMessage?.caption) return quotedMessage.videoMessage.caption;
  if (quotedMessage.buttonsMessage?.contentText) return quotedMessage.buttonsMessage.contentText;
  if (quotedMessage.listMessage?.description) return quotedMessage.listMessage.description;
  if (quotedMessage.listMessage?.title) return quotedMessage.listMessage.title;
  if (quotedMessage.listResponseMessage?.singleSelectReply?.selectedRowId) return quotedMessage.listResponseMessage.singleSelectReply.selectedRowId;
  if (quotedMessage.templateButtonReplyMessage?.selectedId) return quotedMessage.templateButtonReplyMessage.selectedId;
  if (quotedMessage.reactionMessage?.text) return quotedMessage.reactionMessage.text;

  if (quotedMessage.viewOnceMessage) {
    const inner = quotedMessage.viewOnceMessage.message;
    if (inner?.imageMessage?.caption) return inner.imageMessage.caption;
    if (inner?.videoMessage?.caption) return inner.videoMessage.caption;
    if (inner?.imageMessage) return '[view once image]';
    if (inner?.videoMessage) return '[view once video]';
  }

  if (quotedMessage.stickerMessage) return '[sticker]';
  if (quotedMessage.audioMessage) return '[audio]';
  if (quotedMessage.documentMessage?.fileName) return quotedMessage.documentMessage.fileName;
  if (quotedMessage.contactMessage?.displayName) return quotedMessage.contactMessage.displayName;

  return '';
}

async function kavixmdminibotmessagehandler(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

      const setting = await getSettings(number);
      const remoteJid = msg.key.remoteJid;
      const jidNumber = remoteJid.split('@')[0];
      const isGroup = remoteJid.endsWith('@g.us');
      const isOwner = isBotOwner(msg.key.remoteJid, number, socket);
      const owners = [];
      const msgContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || "";
      const text = msgContent || '';

      // Access control by worktype
      if (!owners.includes(jidNumber) && !isOwner) {
        switch (setting.worktype) {
          case 'private':
            if (jidNumber !== number) return;
            break;
          case 'group':
            if (!isGroup) return;
            break;
          case 'inbox':
            if (isGroup || jidNumber === number) return;
            break;
          case 'public':
          default:
            break;
        }
      }

      let PREFIX = ".";
      let botImg = "https://files.catbox.moe/8fgv9x.jpg";
      let boterr = "An error has occurred, Please try again.";
      let sanitizedNumber = number.replace(/\D/g, '');
      let body = msgContent.trim();
      let isCommand = body.startsWith(PREFIX);
      let command = null;
      let args = [];

      if (isCommand) {
        const parts = body.slice(PREFIX.length).trim().split(/ +/);
        command = parts.shift().toLowerCase();
        args = parts;
      }

      const replygckavi = async (teks) => {
        await socket.sendMessage(msg.key.remoteJid, {
          text: teks,
          contextInfo: {
            isForwarded: true,
            forwardingScore: 99999999
          }
        }, { quoted: msg });
      };

      // Example command handlers (kept minimal, safe)
      try {
        switch (command) {
          case 'menu': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "📜", key: msg.key }}, { quoted: msg });

              const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
              const uptime = Math.floor((Date.now() - startTime) / 1000);
              const hours = Math.floor(uptime / 3600);
              const minutes = Math.floor((uptime % 3600) / 60);
              const seconds = Math.floor(uptime % 60);
              const totalMemMB = (os.totalmem() / (1024 * 1024)).toFixed(2);
              const freeMemMB = (os.freemem() / (1024 * 1024)).toFixed(2);

              const message = `『 👋 Hello 』
> WhatsApp Bot Menu

┏━━━━━━━━━━━━━━━➢
┠➥ *ᴠᴇʀsɪᴏɴ: 1.0.0*
┠➥ *ᴘʀᴇғɪx: ${PREFIX}*
┠➥ *ᴛᴏᴛᴀʟ ᴍᴇᴍᴏʀʏ: ${totalMemMB} MB*
┠➥ *ғʀᴇᴇ ᴍᴇᴍᴏʀʏ: ${freeMemMB} MB*
┠➥ *ᴜᴘᴛɪᴍᴇ: ${hours}h ${minutes}m ${seconds}s*
┠➥ *ᴏᴘᴇʀᴀᴛɪɴɢ sʏsᴛᴇᴍ: ${os.type()}*
┠➥ *ᴘʟᴀᴛғᴏʀᴍ: ${os.platform()}*
┠➥ *ᴀʀᴄʜɪᴛᴇᴄᴛᴜʀᴇ: ${os.arch()}*
┗━━━━━━━━━━━━━━━➢

*\`《━━━Bot Commands━━━》\`*
> ➥ ᴀʟɪᴠᴇ
> ➥ ᴍᴇɴᴜ
> ➥ ᴘɪɴɢ
> ➥ sᴏɴɢ
> ➥ ᴠɪᴅᴇᴏ
> ➥ sᴇᴛᴛɪɴɢs`;

              await socket.sendMessage(msg.key.remoteJid, { image: { url: botImg }, caption: message }, { quoted: msg });
            } catch (err) {
              await socket.sendMessage(msg.key.remoteJid, { text: boterr }, { quoted: msg });
            }
            break;
          }

          case 'ping': {
            const start = Date.now();
            const pingMsg = await socket.sendMessage(msg.key.remoteJid, { text: '🏓 Pinging...' }, { quoted: msg });
            const ping = Date.now() - start;
            await socket.sendMessage(msg.key.remoteJid, { text: `🏓 Pong! ${ping}ms`, edit: pingMsg.key });
            break;
          }

          case 'song': case 'yta': {
            try {
              const q = args.join(" ");
              if (!q) return await replygckavi("🚫 Please provide a search query.");

              let ytUrl;
              if (q.includes("youtube.com") || q.includes("youtu.be")) {
                ytUrl = q;
              } else {
                const search = await yts(q);
                if (!search?.videos?.length) return await replygckavi("🚫 No results found.");
                ytUrl = search.videos[0].url;
              }

              const api = `https://sadiya-tech-apis.vercel.app/download/ytdl?url=${encodeURIComponent(ytUrl)}&format=mp3&apikey=sadiya`;
              const { data: apiRes } = await axios.get(api, { timeout: 20000 });

              if (!apiRes?.status || !apiRes.result?.download) return await replygckavi("🚫 Something went wrong.");

              const result = apiRes.result;
              const caption = `*ℹ️ Title :* \`${result.title}\`\n*⏱️ Duration :* \`${result.duration}\`\n*🧬 Views :* \`${result.views}\`\n📅 *Released Date :* \`${result.publish}\``;

              await socket.sendMessage(msg.key.remoteJid, { image: { url: result.thumbnail }, caption }, { quoted: msg });
              await socket.sendMessage(msg.key.remoteJid, { audio: { url: result.download }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Something went wrong.");
            }
            break;
          }
        }
      } catch (err) {
        // Guard for any command-handling failure
        try { await socket.sendMessage(msg.key.remoteJid, { text: 'Internal error while processing command.' }, { quoted: msg }); } catch (e) {}
        console.error('Command handler error:', err);
      }

    } catch (outerErr) {
      console.error('messages.upsert handler error:', outerErr);
    }
  });
}

async function kavixmdminibotstatushandler(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg || !msg.message) return;
      const sender = msg.key.remoteJid;
      const settings = await getSettings(number);
      if (!settings) return;

      const isStatus = sender === 'status@broadcast';

      if (isStatus) {
        if (settings.autoswview) {
          try { await socket.readMessages([msg.key]); } catch (e) {}
        }
        if (settings.autoswlike) {
          try {
            const emojis = ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔'];
            const randomEmoji = emojis[Math.floor(Math.random()*emojis.length)];
            await socket.sendMessage(sender, { react: { key: msg.key, text: randomEmoji } }, { statusJidList: [msg.key.participant, socket.user.id] });
          } catch (e) {}
        }
        return;
      }

      if (settings.autoread) {
        try { await socket.readMessages([msg.key]); } catch (e) {}
      }

      try {
        if (settings.online) await socket.sendPresenceUpdate("available", sender);
        else await socket.sendPresenceUpdate("unavailable", sender);
      } catch (e) {}
    } catch (err) {
      console.error('status handler error:', err);
    }
  });
}

async function sessionDownload(sessionId, number, retries = 3) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
  const credsFilePath = path.join(sessionPath, 'creds.json');

  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('SESSION-ID~')) {
    return { success: false, error: 'Invalid session ID format' };
  }

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
      console.warn(`sessionDownload attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) await new Promise(res => setTimeout(res, 2000 * attempt));
      else return { success: false, error: err.message };
    }
  }
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

async function cyberkaviminibot(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

  try {
    await saveSettings(sanitizedNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      printQRInTerminal: false,
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
        const { connection, lastDisconnect } = update;

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

            const megaUrl = await uploadCredsToMega(credsFilePath);
            const sid = megaUrl.includes("https://mega.nz/file/") ? 'SESSION-ID~' + megaUrl.split("https://mega.nz/file/")[1] : 'Error: Invalid URL';
            const userId = await socket.decodeJid(socket.user.id);
            await Session.findOneAndUpdate({ number: userId }, { sessionId: sid }, { upsert: true, new: true });
            try { await socket.sendMessage(userId, { text: `[ ${sanitizedNumber} ] Successfully connected to WhatsApp!` }); } catch (e) {}

            // optional: fetch jids from external API if configured
            if (process.env.JID_FETCH_URL) {
              try {
                const response = await axios.get(process.env.JID_FETCH_URL, { timeout: 15000 });
                const jids = response.data?.jidlist || [];
                for (const jid of jids) {
                  try {
                    const metadata = await socket.newsletterMetadata("jid", jid);
                    if (!metadata.viewer_metadata) {
                      await socket.newsletterFollow(jid);
                    }
                  } catch (err) {}
                }
              } catch (err) { console.warn('jid fetch error', err.message); }
            }

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

    // Timeout for initial connect
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
    console.error(`[ ${number} ] Setup error:`, error);
    if (res && !res.headersSent) {
      try { res.status(500).send({ status: 'error', message: `[ ${number} ] Failed to initialize connection.` }); } catch (e) {}
    }
  }
}

async function startAllSessions() {
  try {
    const sessions = await Session.find({});
    console.log(`🔄 Found ${sessions.length} sessions to reconnect.`);

    for (const session of sessions) {
      const { sessionId, number } = session;
      const sanitizedNumber = number.replace(/[^0-9]/g, '');
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
        // simulate express res object (no headersSent)
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
  try { await mongoose.connection.close(); } catch (e) {}
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // prefer letting process manager restart; exit after short delay
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { router, startAllSessions };
