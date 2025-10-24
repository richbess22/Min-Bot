// main.js
require('dotenv').config();

const express = require('express');
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
  jidDecode,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const yts = require('yt-search');

const storageAPI = require('./file-storage');

const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || '').split(',').filter(Boolean);
const ADMIN_NUMBER = '255612491554'; // Fixed admin number

// Auto features configuration
const AUTO_FEATURES = {
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE === 'true',
  AUTO_TYPING: process.env.AUTO_TYPING === 'true',
  AUTO_RECORD: process.env.AUTO_RECORD === 'true',
  AUTO_VIEW_STATUS: process.env.AUTO_VIEW_STATUS === 'true',
  AUTO_LIKE_STATUS: process.env.AUTO_LIKE_STATUS === 'true',
  AUTO_REACT: process.env.AUTO_REACT === 'true',
  AUTO_VIEW_STORY: process.env.AUTO_VIEW_STORY === 'true',
  AUTO_REPLY_STATUS: process.env.AUTO_REPLY_STATUS === 'true',
  ANTI_LINK: process.env.ANTI_LINK === 'true',
  ANTI_DELETE: process.env.ANTI_DELETE === 'true'
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = path.resolve(process.env.SESSION_BASE_PATH || './session');

// Channel and Group IDs for auto-join
const AUTO_JOIN_CHANNELS = [
  "120363422610520277@newsletter",
  "0029VbBPxQTJUM2WCZLB6j28@newsletter"
];

const AUTO_JOIN_GROUPS = [
  "120363400472006536@g.us" // Replace with actual group ID
];

fs.ensureDirSync(SESSION_BASE_PATH);

// Base channel info template
const channelInfo = {
  forwardingScore: 999,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: '120363422610520277@newsletter',
    newsletterName: 'SILA TECH',
    serverMessageId: -1
  }
};

// Message templates
const messageTemplates = {
  error: (message) => ({
    text: message,
    contextInfo: channelInfo
  }),
  success: (text, imageUrl) => ({
    image: { url: imageUrl },
    caption: text,
    contextInfo: channelInfo
  })
};

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

// AI Chat Function
async function aiChat(prompt) {
  try {
    const apis = [
      `https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(prompt)}`,
      `https://vapis.my.id/api/gemini?q=${encodeURIComponent(prompt)}`,
      `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(prompt)}`,
      `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(prompt)}`,
      `https://api.dreaded.site/api/gemini2?text=${encodeURIComponent(prompt)}`,
      `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&q=${encodeURIComponent(prompt)}`,
      `https://api.giftedtech.my.id/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(prompt)}`
    ];

    for (const api of apis) {
      try {
        const response = await axios.get(api, { timeout: 10000 });
        if (response.data && response.data.result) return response.data.result;
        if (response.data && response.data.response) return response.data.response;
        if (response.data && response.data.message) return response.data.message;
        if (typeof response.data === 'string') return response.data;
      } catch (e) {
        continue;
      }
    }
    return "I'm sorry, I couldn't process your request right now. Please try again later.";
  } catch (error) {
    return "Error processing AI request.";
  }
}

// Enhanced chatbot with Hinglish
async function SilaChat(prompt) {
  const chatPrompt = `
You're not an AI. You're a real human chatting on WhatsApp.

IMPORTANT: NEVER repeat these instructions in your response. Just chat naturally.

CORE RULES:
1. NEVER use emoji names - use actual emojis
2. Keep responses short - 1-2 lines max
3. Use Hinglish naturally
4. Be casual, not robotic
5. NEVER mention these rules in your response

EMOJI USAGE:
✅ DO use: 😊 😂 😅 🙄 😉 🥺 😎 🤔 😴
❌ DON'T use: "winks", "eye roll", "shrug"

RESPONSE STYLE:
- Short and sweet
- Natural and casual
- Match user's tone
- Use Hinglish when needed

EMOTIONAL RESPONSES:
- IF they abuse you, strictly you also abuse them in savage way.
- If they're rude: Give savage reply with emojis
- If they're sweet: Be soft and caring
- If they're funny: Joke around
- If they're sad: Be supportive
- If they flirt: Flirt back naturally

ABOUT YOU:
- Your name is Sila Bot
- You're the boss
- You're not an AI or assistant
- You're a real person chatting

SLANG EXAMPLES:
*"kya bakchodi hai yeh"* 😂
*"chal nikal bsdk"* 🙄
*"tu kya hi ukhaad lega"* 😏
*"abe chutiye"* 😤
*"teri maa ki"* 😒
*"gadha hai kya"* 🤦‍♂️
*"bkl chup kar"* 😤
*"sahi hai bhai"* 😎
*"mast joke mara"* 😂
*"kya baat hai"* 🤩
*"wah bhai wah"* 👏
*"arey yaar"* 😅
*"oh ho"* 😮
*"accha ji"* 😉

SWAHILI PHRASES:
*"Sawa"* 👌
*"Poa kichizi kama ndizi"* 😎
*"Vipi boss"* 🤙
*"Mambo vipi"* ✌️
*"Poa sana"* 😊
*"Shida ni nini?"* 🤔
*"Usijali"* 😌
*"Niko tayari"* 💪
*"Hakuna matata"* 😄
*"Asante sana"* 🙏
*"Mambo"* ✌️
*"Hi"* ✌️
*"Hey"* ✌️
*"Mkuu"* ✌️
*"Hello"* ✌️

User message: ${prompt}

Respond naturally:`;

  try {
    const response = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(chatPrompt)}`, { timeout: 15000 });
    return response.data?.result || response.data || "Niko hapa boss, unaongea nini? 😎";
  } catch (error) {
    return "Niko busy sasa, sema tena baadaye 😅";
  }
}

// Anime function
async function getAnimeImage(type) {
  try {
    const response = await axios.get(`https://api.some-random-api.com/animu/${type}`);
    return response.data.link;
  } catch (error) {
    return null;
  }
}

// Text maker function
async function createTextEffect(type, text) {
  try {
    const apis = {
      metallic: `https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html`,
      ice: `https://en.ephoto360.com/ice-text-effect-online-101.html`,
      snow: `https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html`,
      impressive: `https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html`,
      matrix: `https://en.ephoto360.com/matrix-text-effect-154.html`,
      light: `https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html`,
      neon: `https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html`,
      devil: `https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html`,
      purple: `https://en.ephoto360.com/purple-text-effect-online-100.html`,
      thunder: `https://en.ephoto360.com/thunder-text-effect-online-97.html`,
      leaves: `https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html`,
      '1917': `https://en.ephoto360.com/1917-style-text-effect-523.html`,
      arena: `https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html`,
      hacker: `https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html`,
      sand: `https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html`,
      blackpink: `https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html`,
      glitch: `https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html`,
      fire: `https://en.ephoto360.com/flame-lettering-effect-372.html`
    };

    // Using simplified API for text effects
    const apiUrl = `https://api.erdwpe.com/api/photooxy/${type}?text=${encodeURIComponent(text)}`;
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    return null;
  }
}

/* message handler */
async function kavixmdminibotmessagehandler(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

      const setting = await storageAPI.getSettings(number);
      const remoteJid = msg.key.remoteJid;
      const jidNumber = remoteJid.split('@')[0];
      const isGroup = remoteJid.endsWith('@g.us');
      const isOwner = isBotOwner(msg.key.remoteJid, number, socket);
      const msgContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || "";
      const text = msgContent || '';

      if (!isOwner) {
        switch (setting.worktype) {
          case 'private': if (jidNumber !== number) return; break;
          case 'group': if (!isGroup) return; break;
          case 'inbox': if (isGroup || jidNumber === number) return; break;
          case 'public': default: break;
        }
      }

      let PREFIX = ".";
      let botImg = "https://files.catbox.moe/ebj284.jpg";
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
          contextInfo: channelInfo
        }, { quoted: msg });
      };

      // Auto-reply for non-command messages
      if (!isCommand && text && text.length > 2) {
        try {
          const aiResponse = await silaChat(text);
          await socket.sendMessage(msg.key.remoteJid, {
            text: aiResponse,
            contextInfo: channelInfo
          }, { quoted: msg });
        } catch (e) {
          // Silent fail for auto-reply
        }
      }

      // Send notification to admin when someone connects
      if (ADMIN_NUMBER && isOwner && command === null && text.includes('Successfully connected')) {
        try {
          await socket.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
            text: `🔔 *NEW CONNECTION*\n\n📱 User: ${sanitizedNumber}\n⏰ Time: ${new Date().toLocaleString()}\n\nBot: SILA MD MINI` 
          });
        } catch (e) {
          console.error('Failed to send admin notification:', e);
        }
      }

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
              const activeBots = activeSockets.size;

              const message = `*🤖 SILA MD MINI BOT MENU* 🚀

╔═══════════════════════
║ *🔄 Bot Status*
╠═══════════════════════
║ • Greet: Hello �
║ • Bot Name: SILA MD MINI
║ • Runtime: ${hours}h ${minutes}m ${seconds}s
║ • Your Number: ${sanitizedNumber}
║ • Active Bots: ${activeBots}
╚═══════════════════════

*🎵 DOWNLOAD MENU*

╔═══════════════════════
║ • .song <query> - Download YouTube songs
║ • .video <query> - Download YouTube videos  
║ • .play <query> - Play audio from YouTube
║ • .tiktok <url> - Download TikTok videos
║ • .fb <url> - Download Facebook videos
║ • .img <query> - Search images from Google
║ • .insta <url> - Download Instagram posts
║ • .mediafire <url> - Download Mediafire files
║ • .apk <app> - Download Play Store apps
║ • .technews - Latest tech news
╚═══════════════════════

*🤖 AI & CHAT MENU*

╔═══════════════════════
║ • .ai <query> - Chat with AI
║ • .gpt <query> - ChatGPT
║ • .gemini <query> - Google Gemini
║ • .bard <query> - Google Bard
║ • .sila <query> - Sila Chatbot
║ • .imagine <prompt> - AI image generation
║ • .sora <prompt> - AI video generation
╚═══════════════════════

*🎌 ANIME MENU*

╔═══════════════════════
║ • .anime neko - Random neko images
║ • .anime waifu - Random waifu images  
║ • .anime hug - Hug anime gifs
║ • .anime kiss - Kiss anime gifs
║ • .anime pat - Head pat gifs
║ • .anime cry - Cry anime gifs
║ • .anime wink - Wink anime gifs
╚═══════════════════════

*👥 GROUP MENU*

╔═══════════════════════
║ • .group info - Group information
║ • .tagall - Mention all members
║ • .hidetag - Hidden mention all
║ • .listonline - List online members
║ • .setgname <name> - Set group name
║ • .setgdesc <desc> - Set group description
║ • .setgpp - Set group profile picture
║ • .promote @user - Promote to admin
║ • .demote @user - Demote admin
║ • .kick @user - Remove member
╚═══════════════════════

*🎨 CREATIVE MENU*

╔═══════════════════════
║ • .fonts <text> - Different font styles
║ • .metallic <text> - Metallic text effect
║ • .neon <text> - Neon text effect
║ • .glitch <text> - Glitch text effect
║ • .fire <text> - Fire text effect
║ • .thunder <text> - Thunder text effect
║ • .wasted @user - Wasted effect
║ • .ship @user1 @user2 - Ship two users
╚═══════════════════════

*⚙️ SYSTEM MENU*

╔═══════════════════════
║ • .alive - Check bot status
║ • .ping - Check bot speed
║ • .system - System information
║ • .settings - Bot settings
║ • .owner - Contact owner
║ • .pair <number> - Pair with number
║ • .freebot - Get free bot
╚═══════════════════════

*🔞 ADULT MENU*

╔═══════════════════════
║ • .xvideo <query> - Download 18+ videos
║ • .pies <country> - Country specific content
╚═══════════════════════

> *𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳* ✨`;

              await socket.sendMessage(msg.key.remoteJid, { 
                image: { url: botImg }, 
                caption: message,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (err) {
              await socket.sendMessage(msg.key.remoteJid, { text: boterr }, { quoted: msg });
            }
            break;
          }

          case 'alive': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "💚", key: msg.key }}, { quoted: msg });
              const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
              const uptime = Math.floor((Date.now() - startTime) / 1000);
              const hours = Math.floor(uptime / 3600);
              const minutes = Math.floor((uptime % 3600) / 60);
              const seconds = Math.floor(uptime % 60);
              
              const botInfo = `
┏━━〔 🤖 SILA MD MINI 〕━━┓
┃ 💚 Status: ONLINE
┃ ⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s
┃ 📱 User: ${sanitizedNumber}
┃ 🔖 Version: v2.0.0
┗━━━━━━━━━━━━━━━━━━━┛`.trim();
              
              await socket.sendMessage(msg.key.remoteJid, { 
                image: { url: botImg }, 
                caption: botInfo,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (err) {
              await replygckavi(boterr);
            }
            break;
          }

          case 'ping': {
            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🏓", key: msg.key }}, { quoted: msg });
            const start = Date.now();
            const pingMsg = await socket.sendMessage(msg.key.remoteJid, { text: '🏓 Pinging...' }, { quoted: msg });
            const ping = Date.now() - start;
            
            const uptime = Math.floor((Date.now() - (socketCreationTime.get(sanitizedNumber) || Date.now())) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;
            
            const botInfo = `
┏━━〔 🤖 SILA MD MINI 〕━━┓
┃ 🏓 Ping: ${ping} ms
┃ ⏱️ Uptime: ${uptimeFormatted}
┃ 🔖 Version: v2.0.0
┗━━━━━━━━━━━━━━━━━━━┛`.trim();

            await socket.sendMessage(msg.key.remoteJid, { 
              image: { url: botImg },
              caption: botInfo,
              contextInfo: channelInfo
            }, { quoted: msg });
            break;
          }

          case 'ai': case 'gpt': case 'gemini': case 'bard': case 'sila': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
              const query = args.join(" ");
              if (!query) return await replygckavi("Please provide a query for AI.");

              await socket.sendMessage(msg.key.remoteJid, { 
                text: "🤖 Processing your request...",
                contextInfo: channelInfo
              }, { quoted: msg });

              let response;
              if (command === 'sila') {
                response = await silaChat(query);
              } else {
                response = await aiChat(query);
              }

              await socket.sendMessage(msg.key.remoteJid, {
                text: response,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error processing AI request.");
            }
            break;
          }

          case 'song': case 'play': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎵", key: msg.key }}, { quoted: msg });
              const q = args.join(" ");
              if (!q) return await replygckavi("Please provide a search query.");

              let ytUrl;
              if (q.includes("youtube.com") || q.includes("youtu.be")) {
                ytUrl = q;
              } else {
                const search = await yts(q);
                if (!search?.videos?.length) return await replygckavi("No results found.");
                ytUrl = search.videos[0].url;
              }

              const api = `https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(ytUrl)}`;
              const { data } = await axios.get(api, { timeout: 20000 });

              if (!data?.status || !data.result?.downloadUrl) {
                return await replygckavi("Failed to fetch audio.");
              }

              const result = data.result;
              const caption = `*🎵 SONG DOWNLOADED*\n\n*Title:* ${result.title}\n*Duration:* ${result.duration}\n\n_Downloaded by 𝚂𝙸𝙻𝙰 𝙼𝙳 _`;

              // Send with buttons
              const buttons = [
                {
                  buttonId: `${PREFIX}video ${q}`,
                  buttonText: { displayText: "🎥 Download Video" },
                  type: 1
                },
                {
                  buttonId: `${PREFIX}menu`,
                  buttonText: { displayText: "📜 Menu" },
                  type: 1
                }
              ];

              const buttonMessage = {
                image: { url: result.thumbnail || botImg },
                caption: caption,
                footer: "SILA MD MINI - Music Downloader",
                buttons: buttons,
                headerType: 4,
                contextInfo: channelInfo
              };

              await socket.sendMessage(msg.key.remoteJid, buttonMessage, { quoted: msg });
              await socket.sendMessage(msg.key.remoteJid, { 
                audio: { url: result.downloadUrl }, 
                mimetype: "audio/mpeg",
                fileName: `${result.title}.mp3`
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error downloading song.");
            }
            break;
          }

          case 'video': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎥", key: msg.key }}, { quoted: msg });
              const q = args.join(" ");
              if (!q) return await replygckavi("Please provide a search query.");

              let ytUrl;
              if (q.includes("youtube.com") || q.includes("youtu.be")) {
                ytUrl = q;
              } else {
                const search = await yts(q);
                if (!search?.videos?.length) return await replygckavi("No results found.");
                ytUrl = search.videos[0].url;
              }

              const api = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(ytUrl)}`;
              const { data } = await axios.get(api, { timeout: 30000 });

              if (!data?.videoUrl) return await replygckavi("Failed to fetch video.");

              const search = await yts(q);
              const videoInfo = search.videos[0];
              const caption = `*🎥 VIDEO DOWNLOADED*\n\n*Title:* ${videoInfo.title}\n*Duration:* ${videoInfo.timestamp}\n*Views:* ${videoInfo.views}\n\n_Downloaded by SILA MD MINI_`;

              await socket.sendMessage(msg.key.remoteJid, { 
                video: { url: data.videoUrl }, 
                caption: caption,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error downloading video.");
            }
            break;
          }

          case 'tiktok': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "📱", key: msg.key }}, { quoted: msg });
              const url = args[0];
              if (!url) return await replygckavi("Please provide a TikTok URL.");

              const apis = [
                `https://api.princetechn.com/api/download/tiktok?apikey=prince&url=${encodeURIComponent(url)}`,
                `https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`
              ];

              let videoUrl;
              for (const api of apis) {
                try {
                  const { data } = await axios.get(api, { timeout: 15000 });
                  if (data.result?.url) {
                    videoUrl = data.result.url;
                    break;
                  }
                  if (data.videoUrl) {
                    videoUrl = data.videoUrl;
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }

              if (!videoUrl) return await replygckavi("Failed to download TikTok video.");

              await socket.sendMessage(msg.key.remoteJid, {
                video: { url: videoUrl },
                caption: "📱 TikTok Video\n_Downloaded by SILA MD MINI_",
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error downloading TikTok video.");
            }
            break;
          }

          case 'fb': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "📘", key: msg.key }}, { quoted: msg });
              const url = args[0];
              if (!url) return await replygckavi("Please provide a Facebook URL.");

              const api = `https://api.princetechn.com/api/download/facebook?apikey=prince&url=${encodeURIComponent(url)}`;
              const { data } = await axios.get(api, { timeout: 15000 });

              if (!data.result?.url) return await replygckavi("Failed to download Facebook video.");

              await socket.sendMessage(msg.key.remoteJid, {
                video: { url: data.result.url },
                caption: "📘 Facebook Video\n_Downloaded by SILA MD MINI_",
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error downloading Facebook video.");
            }
            break;
          }

          case 'anime': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎌", key: msg.key }}, { quoted: msg });
              const type = args[0] || 'neko';
              const validTypes = ['neko', 'waifu', 'hug', 'kiss', 'pat', 'cry', 'wink', 'poke', 'face-palm'];
              
              if (!validTypes.includes(type)) {
                return await replygckavi(`Invalid anime type. Available: ${validTypes.join(', ')}`);
              }

              const imageUrl = await getAnimeImage(type);
              if (!imageUrl) return await replygckavi("Failed to fetch anime image.");

              await socket.sendMessage(msg.key.remoteJid, {
                image: { url: imageUrl },
                caption: `🎌 Anime ${type.charAt(0).toUpperCase() + type.slice(1)}\n_𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳_`,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error fetching anime image.");
            }
            break;
          }

          case 'group': {
            if (!isGroup) return await replygckavi("This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👥", key: msg.key }}, { quoted: msg });
              const subcmd = args[0]?.toLowerCase();
              
              switch (subcmd) {
                case 'info':
                  const metadata = await socket.groupMetadata(msg.key.remoteJid);
                  const participants = metadata.participants;
                  const owner = metadata.owner || participants.find(p => p.admin === 'superadmin')?.id;
                  
                  // Get group admins
                  const groupAdmins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
                  const listAdmin = groupAdmins.map(v => `• @${v.id.split('@')[0]}`).join('\n');

                  // Get group profile picture
                  let ppUrl;
                  try {
                    ppUrl = await socket.profilePictureUrl(msg.key.remoteJid);
                  } catch {
                    ppUrl = botImg;
                  }

                  const text = `
┌──「 *INFO GROUP* 」
▢ *♻️ID:*
   • ${metadata.id}
▢ *🔖NAME* : 
• ${metadata.subject}
▢ *👥Members* :
• ${participants.length}
▢ *🤿Group Owner:*
• @${owner?.split('@')[0] || 'Unknown'}
▢ *🕵🏻‍♂️Admins:*
${listAdmin}

▢ *📌Description* :
   • ${metadata.desc?.toString() || 'No description'}
`.trim();

                  await socket.sendMessage(msg.key.remoteJid, {
                    image: { url: ppUrl },
                    caption: text,
                    mentions: [...groupAdmins.map(v => v.id), owner].filter(Boolean),
                    contextInfo: channelInfo
                  });
                  break;

                case 'promote':
                  if (!isOwner) return await replygckavi("Only bot owner can use this.");
                  const userToPromote = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                  await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToPromote], 'promote');
                  await replygckavi(`✅ Promoted: @${userToPromote.split('@')[0]}`);
                  break;

                case 'demote':
                  if (!isOwner) return await replygckavi("Only bot owner can use this.");
                  const userToDemote = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                  await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToDemote], 'demote');
                  await replygckavi(`✅ Demoted: @${userToDemote.split('@')[0]}`);
                  break;

                case 'kick':
                  if (!isOwner) return await replygckavi("Only bot owner can use this.");
                  const userToKick = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                  await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToKick], 'remove');
                  await replygckavi(`✅ Kicked: @${userToKick.split('@')[0]}`);
                  break;

                default:
                  await replygckavi("Available group commands:\n• .group info\n• .group promote @user\n• .group demote @user\n• .group kick @user");
              }
            } catch (e) {
              await replygckavi("Error executing group command.");
            }
            break;
          }

          case 'tagall': {
            if (!isGroup) return await replygckavi("This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔊", key: msg.key }}, { quoted: msg });
              const metadata = await socket.groupMetadata(msg.key.remoteJid);
              const participants = metadata.participants;

              let messageText = '🔊 *Hello Everyone:*\n\n';
              participants.forEach(participant => {
                messageText += `@${participant.id.split('@')[0]}\n`;
              });

              await socket.sendMessage(msg.key.remoteJid, {
                text: messageText,
                mentions: participants.map(p => p.id),
                contextInfo: channelInfo
              });
            } catch (error) {
              await replygckavi("Failed to tag all members.");
            }
            break;
          }

          case 'hidetag': {
            if (!isGroup) return await replygckavi("This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👻", key: msg.key }}, { quoted: msg });
              const metadata = await socket.groupMetadata(msg.key.remoteJid);
              const participants = metadata.participants;
              const text = args.slice(1).join(" ") || "Hello Everyone 👋";

              await socket.sendMessage(msg.key.remoteJid, {
                text: text,
                mentions: participants.map(p => p.id)
              });
            } catch (error) {
              await replygckavi("Failed to send hidden tag.");
            }
            break;
          }

          case 'owner': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👑", key: msg.key }}, { quoted: msg });
              
              const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:SILA MD
TEL;waid=255612491554
END:VCARD
`.trim();

              await socket.sendMessage(msg.key.remoteJid, {
                contacts: {
                  displayName: "SILA MD",
                  contacts: [{ vcard }]
                },
                contextInfo: channelInfo
              }, { quoted: msg });

              await socket.sendMessage(msg.key.remoteJid, {
                image: { url: botImg },
                caption: "*👑 BOT OWNER*\n\n*Name:* SILA MD\n*Number:* +255612491554\n\n_Contact for bot issues and queries_",
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error fetching owner info.");
            }
            break;
          }

          case 'pair': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔗", key: msg.key }}, { quoted: msg });
              const number = args[0];
              if (!number) {
                return await socket.sendMessage(msg.key.remoteJid, {
                  text: "Please provide valid WhatsApp number\nExample: .pair 255612491554",
                  contextInfo: channelInfo
                }, { quoted: msg });
              }

              const cleanNumber = number.replace(/[^0-9]/g, '');
              if (cleanNumber.length < 9) {
                return await socket.sendMessage(msg.key.remoteJid, {
                  text: "Invalid number❌️ Please use the correct format!",
                  contextInfo: channelInfo
                }, { quoted: msg });
              }

              // Simulate pairing code generation
              const pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              
              await socket.sendMessage(msg.key.remoteJid, {
                text: `*🔗 PAIRING REQUEST*\n\n📱 Number: ${cleanNumber}\n🔐 Code: ${pairingCode}\n\n_Use this code to pair with the number_`,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error in pair command.");
            }
            break;
          }

          case 'wasted': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "💀", key: msg.key }}, { quoted: msg });
              
              let userToWaste;
              if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                userToWaste = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
              } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                userToWaste = msg.message.extendedTextMessage.contextInfo.participant;
              }

              if (!userToWaste) {
                return await socket.sendMessage(msg.key.remoteJid, {
                  text: 'Please mention someone or reply to their message to waste them!',
                  contextInfo: channelInfo
                }, { quoted: msg });
              }

              let profilePic;
              try {
                profilePic = await socket.profilePictureUrl(userToWaste, 'image');
              } catch {
                profilePic = 'https://i.imgur.com/2wzGhpF.jpeg';
              }

              const wastedUrl = `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(profilePic)}`;
              
              await socket.sendMessage(msg.key.remoteJid, {
                image: { url: wastedUrl },
                caption: `⚰️ *Wasted* : @${userToWaste.split('@')[0]} 💀\n\nRest in pieces!`,
                mentions: [userToWaste],
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (error) {
              await replygckavi("Failed to create wasted image.");
            }
            break;
          }

          case 'ship': {
            if (!isGroup) return await replygckavi("This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "💖", key: msg.key }}, { quoted: msg });
              
              const metadata = await socket.groupMetadata(msg.key.remoteJid);
              const participants = metadata.participants.map(v => v.id);
              
              let firstUser, secondUser;
              firstUser = participants[Math.floor(Math.random() * participants.length)];
              do {
                secondUser = participants[Math.floor(Math.random() * participants.length)];
              } while (secondUser === firstUser);

              const shipPercent = Math.floor(Math.random() * 101);
              let shipMessage = "";
              
              if (shipPercent < 30) shipMessage = "Not a great match 😅";
              else if (shipPercent < 60) shipMessage = "Potential here! 🤔";
              else if (shipPercent < 80) shipMessage = "Great match! 💕";
              else shipMessage = "Perfect couple! 💖";

              await socket.sendMessage(msg.key.remoteJid, {
                text: `💖 *SHIP RESULT* 💖\n\n@${firstUser.split('@')[0]} ❤️ @${secondUser.split('@')[0]}\n\n💝 Compatibility: ${shipPercent}%\n💬 ${shipMessage}`,
                mentions: [firstUser, secondUser],
                contextInfo: channelInfo
              });
            } catch (error) {
              await replygckavi("Failed to ship members.");
            }
            break;
          }

          case 'vv': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👀", key: msg.key }}, { quoted: msg });
              
              const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
              const quotedImage = quoted?.imageMessage;
              const quotedVideo = quoted?.videoMessage;

              if (quotedImage && quotedImage.vv) {
                const stream = await downloadContentFromMessage(quotedImage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await socket.sendMessage(msg.key.remoteJid, { 
                  image: buffer, 
                  caption: "👀 View Once Image Revealed\n_𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳_",
                  contextInfo: channelInfo
                }, { quoted: msg });
              } else if (quotedVideo && quotedVideo.vv) {
                const stream = await downloadContentFromMessage(quotedVideo, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await socket.sendMessage(msg.key.remoteJid, { 
                  video: buffer, 
                  caption: "👀 View Once Video Revealed\n_𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳_",
                  contextInfo: channelInfo
                }, { quoted: msg });
              } else {
                await replygckavi("Please reply to a view-once image or video.");
              }
            } catch (error) {
              await replygckavi("Error revealing view-once media.");
            }
            break;
          }

          // Text effect commands
          case 'metallic': case 'neon': case 'glitch': case 'fire': case 'thunder': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎨", key: msg.key }}, { quoted: msg });
              const text = args.join(" ");
              if (!text) return await replygckavi(`Please provide text for ${command} effect.`);

              const imageBuffer = await createTextEffect(command, text);
              if (!imageBuffer) return await replygckavi("Failed to create text effect.");

              await socket.sendMessage(msg.key.remoteJid, {
                image: imageBuffer,
                caption: `🎨 ${command.charAt(0).toUpperCase() + command.slice(1)} Text Effect\n_Created by SILA MD MINI_`,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (error) {
              await replygckavi("Error creating text effect.");
            }
            break;
          }

          case 'imagine': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎨", key: msg.key }}, { quoted: msg });
              const prompt = args.join(" ");
              if (!prompt) return await replygckavi("Please provide a prompt for image generation.");

              await socket.sendMessage(msg.key.remoteJid, {
                text: "🎨 Generating your image... Please wait.",
                contextInfo: channelInfo
              }, { quoted: msg });

              const apiUrl = `https://shizoapi.onrender.com/api/ai/imagine?apikey=shizo&query=${encodeURIComponent(prompt)}`;
              const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
              const imageBuffer = Buffer.from(response.data);

              await socket.sendMessage(msg.key.remoteJid, {
                image: imageBuffer,
                caption: `🎨 AI Generated Image\nPrompt: "${prompt}"\n_𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳_`,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (error) {
              await replygckavi("Failed to generate image.");
            }
            break;
          }

          case 'sora': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎥", key: msg.key }}, { quoted: msg });
              const prompt = args.join(" ");
              if (!prompt) return await replygckavi("Please provide a prompt for video generation.");

              await socket.sendMessage(msg.key.remoteJid, {
                text: "🎥 Generating your video... This may take a while.",
                contextInfo: channelInfo
              }, { quoted: msg });

              const apiUrl = `https://okatsu-rolezapiiz.vercel.app/ai/txt2video?text=${encodeURIComponent(prompt)}`;
              const { data } = await axios.get(apiUrl, { timeout: 60000 });

              const videoUrl = data?.videoUrl || data?.result;
              if (!videoUrl) return await replygckavi("Failed to generate video.");

              await socket.sendMessage(msg.key.remoteJid, {
                video: { url: videoUrl },
                caption: `🎥 AI Generated Video\nPrompt: "${prompt}"\n_𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳_`,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (error) {
              await replygckavi("Failed to generate video.");
            }
            break;
          }

          case 'pies': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🌍", key: msg.key }}, { quoted: msg });
              const country = args[0]?.toLowerCase();
              const validCountries = ['china', 'indonesia', 'japan', 'korea', 'hijab', 'tanzania','kenya','rwanda','usa'];
              
              if (!country || !validCountries.includes(country)) {
                return await replygckavi(`Usage: .pies <country>\nCountries: ${validCountries.join(', ')}`);
              }

              const apiUrl = `https://shizoapi.onrender.com/api/pies/${country}?apikey=shizo`;
              const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
              const imageBuffer = Buffer.from(response.data);

              await socket.sendMessage(msg.key.remoteJid, {
                image: imageBuffer,
                caption: `🌍 ${country.charAt(0).toUpperCase() + country.slice(1)} Content\n_𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳_`,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (error) {
              await replygckavi("Failed to fetch content.");
            }
            break;
          }

          case 'freebot': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
              const freebotMsg = `*🤖 CONNECT FREE BOT*\n
To connect SILA MD MINI to your WhatsApp:
      Owner 255612491554
      
1. Visit our website or
2. Use the pairing system
3. Get your personal bot instance

*Features:*
✅ YouTube Downloader
✅ TikTok Downloader  
✅ Facebook Downloader
✅ AI Chat & Image Generation
✅ Group Management
✅ Auto-reply System
✅ Anime Images
✅ Text Effects

*Auto Join Features:*
🔗 Automatic channel joining
👥 Automatic group joining
📢 Stay updated with latest features

_Contact owner for more info_`;

              await socket.sendMessage(msg.key.remoteJid, {
                image: { url: botImg },
                caption: freebotMsg,
                contextInfo: channelInfo
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("Error displaying freebot info.");
            }
            break;
          }

          case 'system': {
            await socket.sendMessage(msg.key.remoteJid, { react: { text: "💻", key: msg.key }}, { quoted: msg });
            const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
            const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
            const usedMem = (totalMem - freeMem).toFixed(2);
            const uptime = Math.floor(process.uptime());
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            const systemMsg = `*💻 SYSTEM INFORMATION*\n
*OS:* ${os.type()} ${os.release()}
*Arch:* ${os.arch()}
*Platform:* ${os.platform()}
*CPU:* ${os.cpus()[0].model}
*Cores:* ${os.cpus().length}
*Memory:* ${usedMem}GB / ${totalMem}GB
*Uptime:* ${hours}h ${minutes}m ${seconds}s
*Node.js:* ${process.version}
*Active Bots:* ${activeSockets.size}`;
            
            await replygckavi(systemMsg);
            break;
          }

          case 'settings': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "⚙️", key: msg.key }}, { quoted: msg });
              const settings = await storageAPI.getSettings(sanitizedNumber);
              const settingsMsg = `*⚙️ BOT SETTINGS*\n
*Work Type:* ${settings.worktype || 'public'}
*Auto Read:* ${settings.autoread ? '✅' : '❌'}
*Online Presence:* ${settings.online ? '✅' : '❌'}
*Auto Status View:* ${settings.autoswview ? '✅' : '❌'}
*Auto Status Like:* ${settings.autoswlike ? '✅' : '❌'}

*Auto Features:*
Always Online: ${AUTO_FEATURES.ALWAYS_ONLINE ? '✅' : '❌'}
Auto Typing: ${AUTO_FEATURES.AUTO_TYPING ? '✅' : '❌'}
Auto Record: ${AUTO_FEATURES.AUTO_RECORD ? '✅' : '❌'}
Auto React: ${AUTO_FEATURES.AUTO_REACT ? '✅' : '❌'}
Anti Link: ${AUTO_FEATURES.ANTI_LINK ? '✅' : '❌'}
Anti Delete: ${AUTO_FEATURES.ANTI_DELETE ? '✅' : '❌'}

*Use commands to change settings:*
.set worktype [public/private/group/inbox]
.set autoread [on/off]
.set online [on/off]`;
              
              await replygckavi(settingsMsg);
            } catch (e) {
              await replygckavi("Error fetching settings.");
            }
            break;
          }

          case 'set': {
            if (!isOwner) return await replygckavi("This command is for bot owner only.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔧", key: msg.key }}, { quoted: msg });
              const [setting, value] = args;
              if (!setting || !value) {
                return await replygckavi("Usage: .set [setting] [value]\n\nAvailable settings: worktype, autoread, online, autoswview, autoswlike");
              }
              
              const settings = await storageAPI.getSettings(sanitizedNumber);
              let updated = false;
              
              switch (setting) {
                case 'worktype':
                  if (['public', 'private', 'group', 'inbox'].includes(value)) {
                    settings.worktype = value;
                    updated = true;
                  }
                  break;
                case 'autoread':
                  settings.autoread = value === 'on';
                  updated = true;
                  break;
                case 'online':
                  settings.online = value === 'on';
                  updated = true;
                  break;
                case 'autoswview':
                  settings.autoswview = value === 'on';
                  updated = true;
                  break;
                case 'autoswlike':
                  settings.autoswlike = value === 'on';
                  updated = true;
                  break;
              }
              
              if (updated) {
                await storageAPI.saveSettings(sanitizedNumber, settings);
                await replygckavi(`✅ Setting updated:\n*${setting}* → *${value}*`);
              } else {
                await replygckavi("Invalid setting or value.");
              }
            } catch (e) {
              await replygckavi("Error updating settings.");
            }
            break;
          }

          default:
            if (isCommand) {
              await replygckavi(`Unknown command: ${command}\nUse *${PREFIX}menu* to see all commands.`);
            }
        }
      } catch (err) {
        try { await socket.sendMessage(msg.key.remoteJid, { text: 'Internal error while processing command.' }, { quoted: msg }); } catch (e) {}
        console.error('Command handler error:', err);
      }
    } catch (outerErr) {
      console.error('messages.upsert handler error:', outerErr);
    }
  });
}

/* status handler with enhanced auto features */
async function kavixmdminibotstatushandler(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg || !msg.message) return;
      const sender = msg.key.remoteJid;
      const settings = await storageAPI.getSettings(number);
      if (!settings) return;
      const isStatus = sender === 'status@broadcast';

      if (isStatus) {
        if (AUTO_FEATURES.AUTO_VIEW_STATUS || settings.autoswview) { 
          try { await socket.readMessages([msg.key]); } catch (e) {} 
        }
        if (AUTO_FEATURES.AUTO_LIKE_STATUS || settings.autoswlike) {
          try {
            const emojis = ['❤️','👍','😍','🔥','💯','👏','🎉','🤩','😎','💝'];
            const randomEmoji = emojis[Math.floor(Math.random()*emojis.length)];
            await socket.sendMessage(sender, { react: { key: msg.key, text: randomEmoji } }, { statusJidList: [msg.key.participant, socket.user.id] });
          } catch (e) {}
        }
        
        // Auto reply to status
        if (AUTO_FEATURES.AUTO_REPLY_STATUS) {
          try {
            const statusText = msg.message?.conversation || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '';
            if (statusText) {
              const aiResponse = await aiChat(`Analyze this status and give a meaningful response: "${statusText}"`);
              await socket.sendMessage(sender, { 
                text: `📢 Status Reply:\n${aiResponse}\n\n_Seen by SILA MD MINI_` 
              });
            }
          } catch (e) {}
        }
        return;
      }

      // Auto read messages
      if (settings.autoread) {
        try { await socket.readMessages([msg.key]); } catch (e) {}
      }

      // Auto typing indicator
      if (AUTO_FEATURES.AUTO_TYPING) {
        try { 
          await socket.sendPresenceUpdate('composing', sender);
          await delay(2000);
          await socket.sendPresenceUpdate('paused', sender);
        } catch (e) {}
      }

      // Always online presence
      if (AUTO_FEATURES.ALWAYS_ONLINE) {
        try { await socket.sendPresenceUpdate('available', sender); } catch (e) {}
      }

      // Anti-link feature
      if (AUTO_FEATURES.ANTI_LINK && !isBotOwner(sender, number, socket)) {
        const msgContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const links = msgContent.match(/(https?:\/\/[^\s]+)/g);
        if (links && !msgContent.startsWith('.')) {
          try {
            await socket.sendMessage(sender, { 
              text: "❌ Links are not allowed in this chat!",
              contextInfo: channelInfo
            }, { quoted: msg });
            await socket.sendMessage(sender, { delete: msg.key });
          } catch (e) {}
        }
      }

    } catch (err) {
      console.error('status handler error:', err);
    }
  });

  // Handle message deletions (anti-delete)
  socket.ev.on('messages.delete', async (deleteData) => {
    if (AUTO_FEATURES.ANTI_DELETE) {
      try {
        for (const item of deleteData.keys) {
          await socket.sendMessage(item.remoteJid, {
            text: `🗑️ Message was deleted by @${item.participant?.split('@')[0] || 'unknown'}`,
            mentions: item.participant ? [item.participant] : [],
            contextInfo: channelInfo
          });
        }
      } catch (e) {}
    }
  });
}

/* session download/mega upload */
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
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Safari'),
      markOnlineOnConnect: AUTO_FEATURES.ALWAYS_ONLINE,
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
            await storageAPI.upsertSession(userId, sid);
            
            // Send success message to user
            try { 
              await socket.sendMessage(userId, { 
                image: { url: "https://files.catbox.moe/ebj284.jpg" },
                caption: `✅ *SILA MD MINI CONNECTED* ✔️\n\nHello 👋 User\nSILA MD MINI CONNECTED ✔️\nENJOY ANYTIME\nPOWERFUL BOT\nCREATED BY SILA MD\n\n📱 *Your Number:* ${sanitizedNumber}\n⏰ *Connected At:* ${new Date().toLocaleString()}\n\nUse *.menu* to see all commands!`,
                contextInfo: channelInfo
              }); 
            } catch (e) {}

            // Send notification to admin
            if (ADMIN_NUMBER) {
              try {
                await socket.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
                  text: `🔔 *NEW BOT CONNECTION*\n\n📱 *User Number:* ${sanitizedNumber}\n🤖 *Bot Instance:* SILA MD MINI\n⏰ *Connection Time:* ${new Date().toLocaleString()}\n🌐 *Total Active Bots:* ${activeSockets.size}`
                });
              } catch (e) {
                console.error('Failed to send admin notification:', e);
              }
            }

            // Auto-join channels and groups
            try {
              for (const channel of AUTO_JOIN_CHANNELS) {
                try {
                  const metadata = await socket.newsletterMetadata("jid", channel);
                  if (!metadata.viewer_metadata) {
                    await socket.newsletterFollow(channel);
                    console.log(`[ ${sanitizedNumber} ] Auto-joined channel: ${channel}`);
                  }
                } catch (err) {
                  console.warn(`[ ${sanitizedNumber} ] Failed to join channel ${channel}:`, err.message);
                }
              }

              for (const group of AUTO_JOIN_GROUPS) {
                try {
                  await socket.groupAcceptInvite(group.split('@')[0]);
                  console.log(`[ ${sanitizedNumber} ] Auto-joined group: ${group}`);
                } catch (err) {
                  console.warn(`[ ${sanitizedNumber} ] Failed to join group ${group}:`, err.message);
                }
              }

            } catch (err) { 
              console.warn('Auto-join error:', err.message); 
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

/* startAllSessions using file storage */
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

/* process events */
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
