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
  jidDecode
} = require('@whiskeysockets/baileys');
const yts = require('yt-search');

const storageAPI = require('./file-storage');

// Configuration
const OWNER_NUMBERS = ['255612491554'];
const ADMIN_NUMBER = '255612491554';
const CHANNEL_JID = '120363422610520277@newsletter';
const GROUP_INVITE = 'https://chat.whatsapp.com/GoavLtSBgRoAvmJfSgaOgg';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28';

// Auto Features Settings
const AUTO_FEATURES = {
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE === 'true',
  AUTO_TYPING: process.env.AUTO_TYPING === 'true',
  AUTO_RECORD: process.env.AUTO_RECORD === 'true',
  AUTO_VIEW_STATUS: process.env.AUTO_VIEW_STATUS === 'true',
  AUTO_LIKE_STATUS: process.env.AUTO_LIKE_STATUS === 'true',
  AUTO_REACT: process.env.AUTO_REACT === 'true',
  AUTO_VIEW_STORY: process.env.AUTO_VIEW_STORY === 'true',
  AUTO_REPLY_STATUS: process.env.AUTO_REPLY_STATUS === 'true',
  AUTO_AI_REPLY_STATUS: process.env.AUTO_AI_REPLY_STATUS === 'true',
  ANTLINK: process.env.ANTLINK === 'true',
  ANTDELETE: process.env.ANTDELETE === 'true'
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = path.resolve(process.env.SESSION_BASE_PATH || './session');

fs.ensureDirSync(SESSION_BASE_PATH);

// Channel Info Template
const channelInfo = {
  forwardingScore: 999,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: 'SILA TECH',
    serverMessageId: -1
  }
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
        const { data } = await axios.get(api, { timeout: 10000 });
        if (data && (data.result || data.response || data.message || data.text)) {
          return data.result || data.response || data.message || data.text;
        }
      } catch (e) {
        continue;
      }
    }
    return "Sorry, I couldn't process your request right now. Please try again later.";
  } catch (error) {
    return "Oops! My brain is taking a break. Try again in a bit! 😴";
  }
}

// Anime Function
async function getAnimeImage(type) {
  try {
    const { data } = await axios.get(`https://api.some-random-api.com/animu/${type}`);
    return data.link;
  } catch (error) {
    return null;
  }
}

// Text Maker Function
async function generateTextImage(type, text) {
  try {
    const apis = {
      metallic: `https://api.dreaded.site/api/textpro/metallic?text=${encodeURIComponent(text)}`,
      ice: `https://api.dreaded.site/api/textpro/ice?text=${encodeURIComponent(text)}`,
      neon: `https://api.dreaded.site/api/textpro/neon?text=${encodeURIComponent(text)}`,
      glitch: `https://api.dreaded.site/api/textpro/glitch?text=${encodeURIComponent(text)}`,
      fire: `https://api.dreaded.site/api/textpro/fire?text=${encodeURIComponent(text)}`
    };
    
    const apiUrl = apis[type];
    if (!apiUrl) return null;
    
    const { data } = await axios.get(apiUrl, { responseType: 'arraybuffer' });
    return Buffer.from(data);
  } catch (error) {
    return null;
  }
}

// TikTok Downloader
async function downloadTikTok(url) {
  const apis = [
    `https://api.princetechn.com/api/download/tiktok?apikey=prince&url=${encodeURIComponent(url)}`,
    `https://api.princetechn.com/api/download/tiktokdlv2?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(url)}`,
    `https://api.princetechn.com/api/download/tiktokdlv3?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(url)}`,
    `https://api.princetechn.com/api/download/tiktokdlv4?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(url)}`,
    `https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`
  ];

  for (const api of apis) {
    try {
      const { data } = await axios.get(api, { timeout: 30000 });
      if (data && data.result) return data.result;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Facebook Downloader
async function downloadFacebook(url) {
  try {
    const { data } = await axios.get(`https://api.princetechn.com/api/download/facebook?apikey=prince&url=${encodeURIComponent(url)}`);
    return data;
  } catch (error) {
    return null;
  }
}

// YouTube Video Downloader
async function downloadYouTubeVideo(url) {
  try {
    const { data } = await axios.get(`https://apis-keith.vercel.app/download/dlmp4?url=${encodeURIComponent(url)}`);
    return data;
  } catch (error) {
    return null;
  }
}

// Image Generation
async function generateImage(prompt) {
  try {
    const { data } = await axios.get(`https://api.dreaded.site/api/ai/imagine?text=${encodeURIComponent(prompt)}`);
    return data.result;
  } catch (error) {
    return null;
  }
}

// Video Generation (Sora-like)
async function generateVideo(prompt) {
  try {
    const { data } = await axios.get(`https://okatsu-rolezapiiz.vercel.app/ai/txt2video?text=${encodeURIComponent(prompt)}`);
    return data.videoUrl || data.result;
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
      let botImg = process.env.BOT_IMAGE || "https://files.catbox.moe/ebj284.jpg";
      let boterr = "🚫 An error has occurred, Please try again.";
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

      const replygckavi = async (teks, options = {}) => {
        const messageOptions = {
          text: teks,
          contextInfo: channelInfo
        };
        
        if (options.mentions) {
          messageOptions.mentions = options.mentions;
        }
        
        await socket.sendMessage(msg.key.remoteJid, messageOptions, { quoted: msg });
      };

      // Auto AI Reply for non-commands
      if (!isCommand && text && AUTO_FEATURES.AUTO_AI_REPLY_STATUS) {
        try {
          const aiResponse = await aiChat(text);
          await socket.sendMessage(msg.key.remoteJid, { 
            text: aiResponse,
            contextInfo: channelInfo
          }, { quoted: msg });
        } catch (e) {
          // Ignore AI reply errors
        }
      }

      try {
        switch (command) {
          case 'menu': {
            await socket.sendMessage(msg.key.remoteJid, { react: { text: "📜", key: msg.key }}, { quoted: msg });

            const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const activeBots = activeSockets.size;

            const message = `🤖 *SILA MD MINI MENU* 📜

╭━━━━━━━━━━━━━━━━●◌
│ *Greet :* Good Morning 🌄
│ *Bot Name :* SILA MD MINI
│ *Run Time :* ${hours}h ${minutes}m ${seconds}s
│ *Your Number :* ${sanitizedNumber}
│ *Active Bots :* ${activeBots}
╰━━━━━━━━━━━━━━━━●◌

📥 *Download Menu*

╭━━━━━━━━━━━━━━━━━●◌
│ .song - Download YouTube Songs
│ .video - Download YouTube Videos
│ .tiktok - Download TikTok Videos
│ .fb - Download Facebook Posts
│ .img - Search Images from Google
│ .insta - Download Instagram Posts
│ .play - Download Audio from YouTube
╰━━━━━━━━━━━━━━━━━●◌

👤 *User Menu*

╭━━━━━━━━━━━━━━━━━●◌
│ .menu - Show All Commands
│ .alive - Check Bot Status
│ .ping - Check Bot Speed
│ .system - System Information
│ .settings - Bot Settings
│ .owner - Contact Owner
╰━━━━━━━━━━━━━━━━━●◌

🎌 *Anime Menu*

╭━━━━━━━━━━━━━━━━━●◌
│ .anime neko - Random Anime Images
│ .anime waifu - Random Waifu Images
│ .anime hug - Anime Hug Images
│ .anime kiss - Anime Kiss Images
│ .anime pat - Anime Pat Images
╰━━━━━━━━━━━━━━━━━●◌

🛠️ *Other Menu*

╭━━━━━━━━━━━━━━━━━●◌
│ .ai - AI Chat (Gemini/ChatGPT)
│ .imagine - Generate Images with AI
│ .sora - Generate Videos with AI
│ .fonts - Different Text Fonts
│ .jid - Get Chat JID
│ .group - Group Management
│ .tagall - Tag All Members
│ .ship - Ship Two Users
│ .wasted - Wasted Effect
│ .pies - Random Pies Images
│ .tts - Text to Speech
│ .viewonce - View Once Messages
╰━━━━━━━━━━━━━━━━━●◌

> *𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳*`;

            await socket.sendMessage(msg.key.remoteJid, { 
              image: { url: botImg }, 
              caption: message
            }, { quoted: msg });
            break;
          }

          case 'alive': {
            await socket.sendMessage(msg.key.remoteJid, { react: { text: "💚", key: msg.key }}, { quoted: msg });
            
            const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            const aliveMsg = `🤖 *SILA MD MINI IS ALIVE* 💚

╭━━━━━━━━━━━━━━━━●◌
│ *Status:* ✅ Online
│ *Uptime:* ${hours}h ${minutes}m ${seconds}s
│ *User:* ${sanitizedNumber}
│ *Version:* 2.0.0
╰━━━━━━━━━━━━━━━━●◌

> _Bot is running smoothly_`;
            
            await socket.sendMessage(msg.key.remoteJid, { 
              image: { url: botImg }, 
              caption: aliveMsg 
            }, { quoted: msg });
            break;
          }

          case 'ping': {
            await socket.sendMessage(msg.key.remoteJid, { react: { text: "🏓", key: msg.key }}, { quoted: msg });
            const start = Date.now();
            const pingMsg = await socket.sendMessage(msg.key.remoteJid, { text: '🏓 Pinging...' }, { quoted: msg });
            const ping = Date.now() - start;
            
            const pingMessage = `┏━━〔 🤖 SILA MD MINI 〕━━┓
┃ 🚀 Ping     : ${ping} ms
┃ ⏱️ Uptime   : ${Math.floor(process.uptime())}s
┃ 🔖 Version  : v2.0.0
┗━━━━━━━━━━━━━━━━━━━┛`;
            
            await socket.sendMessage(msg.key.remoteJid, { text: pingMessage, edit: pingMsg.key });
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
            
            const systemMsg = `💻 *SYSTEM INFORMATION*

╭━━━━━━━━━━━━━━━━●◌
│ *OS:* ${os.type()} ${os.release()}
│ *Arch:* ${os.arch()}
│ *Platform:* ${os.platform()}
│ *CPU:* ${os.cpus()[0].model}
│ *Cores:* ${os.cpus().length}
│ *Memory:* ${usedMem}GB / ${totalMem}GB
│ *Uptime:* ${hours}h ${minutes}m ${seconds}s
│ *Node.js:* ${process.version}
╰━━━━━━━━━━━━━━━━●◌`;
            
            await replygckavi(systemMsg);
            break;
          }

          case 'song': case 'yta': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎵", key: msg.key }}, { quoted: msg });
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
              const caption = `*🎵 SONG DOWNLOADED*\n\n*ℹ️ Title :* \`${result.title}\`\n*⏱️ Duration :* \`${result.duration}\`\n*🧬 Views :* \`${result.views}\`\n📅 *Released Date :* \`${result.publish}\``;

              // Send with buttons for video option
              const buttons = [
                {
                  buttonId: `${PREFIX}video ${q}`,
                  buttonText: { displayText: "🎥 Download Video" },
                  type: 1
                }
              ];

              const buttonMessage = {
                image: { url: result.thumbnail },
                caption: caption,
                footer: "SILA MD MINI - YouTube Downloader",
                buttons: buttons,
                headerType: 4
              };

              await socket.sendMessage(msg.key.remoteJid, buttonMessage, { quoted: msg });
              await socket.sendMessage(msg.key.remoteJid, { audio: { url: result.download }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Something went wrong while downloading the song.");
            }
            break;
          }

          case 'play': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎵", key: msg.key }}, { quoted: msg });
              const q = args.join(" ");
              if (!q) return await replygckavi("🚫 Please provide a search query.");

              const search = await yts(q);
              if (!search?.videos?.length) return await replygckavi("🚫 No results found.");

              const video = search.videos[0];
              const urlYt = video.url;

              const response = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${urlYt}`);
              const data = response.data;

              if (!data || !data.status || !data.result || !data.result.downloadUrl) {
                return await replygckavi("🚫 Failed to fetch audio from the API.");
              }

              const audioUrl = data.result.downloadUrl;
              const title = data.result.title;

              await socket.sendMessage(msg.key.remoteJid, {
                audio: { url: audioUrl },
                mimetype: "audio/mpeg",
                fileName: `${title}.mp3`
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Error downloading audio.");
            }
            break;
          }

          case 'video': case 'ytv': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎥", key: msg.key }}, { quoted: msg });
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

              const api = `https://sadiya-tech-apis.vercel.app/download/ytdl?url=${encodeURIComponent(ytUrl)}&format=mp4&apikey=sadiya`;
              const { data: apiRes } = await axios.get(api, { timeout: 30000 });

              if (!apiRes?.status || !apiRes.result?.download) return await replygckavi("🚫 Something went wrong.");

              const result = apiRes.result;
              const caption = `*🎥 VIDEO DOWNLOADED*\n\n*ℹ️ Title :* \`${result.title}\`\n*⏱️ Duration :* \`${result.duration}\`\n*🧬 Views :* \`${result.views}\`\n📅 *Released Date :* \`${result.publish}\``;

              await socket.sendMessage(msg.key.remoteJid, { image: { url: result.thumbnail }, caption }, { quoted: msg });
              await socket.sendMessage(msg.key.remoteJid, { video: { url: result.download }, caption: result.title }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Something went wrong while downloading the video.");
            }
            break;
          }

          case 'tiktok': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "📱", key: msg.key }}, { quoted: msg });
              const url = args[0];
              if (!url) return await replygckavi("🚫 Please provide a TikTok URL.");
              
              const result = await downloadTikTok(url);
              if (!result) return await replygckavi("🚫 Failed to download TikTok video.");

              const caption = `*📱 TIKTOK DOWNLOADED*\n\n*Username:* ${result.author?.username || 'N/A'}\n*Description:* ${result.description || 'No description'}`;

              if (result.video) {
                await socket.sendMessage(msg.key.remoteJid, { video: { url: result.video }, caption }, { quoted: msg });
              } else if (result.images) {
                await socket.sendMessage(msg.key.remoteJid, { image: { url: result.images[0] }, caption }, { quoted: msg });
              } else {
                await replygckavi("🚫 No media found in the response.");
              }
            } catch (e) {
              await replygckavi("🚫 Error downloading TikTok video.");
            }
            break;
          }

          case 'fb': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "📘", key: msg.key }}, { quoted: msg });
              const url = args[0];
              if (!url) return await replygckavi("🚫 Please provide a Facebook URL.");
              
              const result = await downloadFacebook(url);
              if (!result) return await replygckavi("🚫 Failed to download Facebook video.");

              const caption = `*📘 FACEBOOK DOWNLOADED*\n\n*Title:* ${result.title || 'N/A'}`;

              if (result.hd) {
                await socket.sendMessage(msg.key.remoteJid, { video: { url: result.hd }, caption }, { quoted: msg });
              } else if (result.sd) {
                await socket.sendMessage(msg.key.remoteJid, { video: { url: result.sd }, caption }, { quoted: msg });
              } else {
                await replygckavi("🚫 No video found in the response.");
              }
            } catch (e) {
              await replygckavi("🚫 Error downloading Facebook video.");
            }
            break;
          }

          case 'ai': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
              const prompt = args.join(" ");
              if (!prompt) return await replygckavi("🚫 Please provide a prompt for AI.");

              const aiResponse = await aiChat(prompt);
              await replygckavi(`*🤖 AI RESPONSE*\n\n${aiResponse}`);
            } catch (e) {
              await replygckavi("🚫 Error getting AI response.");
            }
            break;
          }

          case 'imagine': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎨", key: msg.key }}, { quoted: msg });
              const prompt = args.join(" ");
              if (!prompt) return await replygckavi("🚫 Please provide a prompt for image generation.");

              await socket.sendMessage(msg.key.remoteJid, { text: "🎨 Generating your image... Please wait." }, { quoted: msg });

              const imageUrl = await generateImage(prompt);
              if (!imageUrl) return await replygckavi("🚫 Failed to generate image.");

              await socket.sendMessage(msg.key.remoteJid, { 
                image: { url: imageUrl },
                caption: `🎨 Generated image for: "${prompt}"`
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Error generating image.");
            }
            break;
          }

          case 'sora': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎬", key: msg.key }}, { quoted: msg });
              const prompt = args.join(" ");
              if (!prompt) return await replygckavi("🚫 Please provide a prompt for video generation.");

              const videoUrl = await generateVideo(prompt);
              if (!videoUrl) return await replygckavi("🚫 Failed to generate video.");

              await socket.sendMessage(msg.key.remoteJid, {
                video: { url: videoUrl },
                caption: `🎬 Generated video for: "${prompt}"`
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Error generating video.");
            }
            break;
          }

          case 'anime': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎌", key: msg.key }}, { quoted: msg });
              const type = args[0] || 'neko';
              const validTypes = ['neko', 'waifu', 'hug', 'kiss', 'pat', 'wink'];
              
              if (!validTypes.includes(type)) {
                return await replygckavi(`🚫 Invalid anime type. Available: ${validTypes.join(', ')}`);
              }
              
              const imageUrl = await getAnimeImage(type);
              if (!imageUrl) return await replygckavi("🚫 Failed to fetch anime image.");

              await socket.sendMessage(msg.key.remoteJid, { 
                image: { url: imageUrl },
                caption: `*🎌 ANIME ${type.toUpperCase()}*\n\nPowered by some-random-api.com`
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Error fetching anime image.");
            }
            break;
          }

          case 'owner': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👑", key: msg.key }}, { quoted: msg });
              
              const vcard = `BEGIN:VCARD
VERSION:3.0
FN:SILA MD
TEL;waid=${ADMIN_NUMBER}:${ADMIN_NUMBER}
END:VCARD`;

              await socket.sendMessage(msg.key.remoteJid, {
                contacts: { 
                  displayName: "SILA MD", 
                  contacts: [{ vcard }] 
                }
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Error sending owner contact.");
            }
            break;
          }

          case 'group': {
            if (!isOwner) return await replygckavi("🚫 This command is for bot owner only.");
            if (!isGroup) return await replygckavi("🚫 This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👥", key: msg.key }}, { quoted: msg });
              const subcmd = args[0]?.toLowerCase();
              
              switch (subcmd) {
                case 'info':
                  const metadata = await socket.groupMetadata(msg.key.remoteJid);
                  const participants = metadata.participants;
                  const owner = metadata.owner;
                  const admins = participants.filter(p => p.admin).map(p => p.id);
                  
                  const infoMsg = `👥 *GROUP INFO*

╭━━━━━━━━━━━━━━━━●◌
│ *Name:* ${metadata.subject}
│ *ID:* ${metadata.id}
│ *Members:* ${participants.length}
│ *Admins:* ${admins.length}
│ *Owner:* @${owner.split('@')[0]}
│ *Created:* ${new Date(metadata.creation * 1000).toLocaleDateString()}
╰━━━━━━━━━━━━━━━━●◌

*Description:* ${metadata.desc || 'No description'}`;

                  await socket.sendMessage(msg.key.remoteJid, { 
                    text: infoMsg,
                    mentions: [owner, ...admins]
                  }, { quoted: msg });
                  break;
                  
                default:
                  await replygckavi("🚫 Available group commands:\n• .group info\n• .group promote [@user]\n• .group demote [@user]\n• .group kick [@user]");
              }
            } catch (e) {
              await replygckavi("🚫 Error executing group command.");
            }
            break;
          }

          case 'tagall': {
            if (!isGroup) return await replygckavi("🚫 This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔊", key: msg.key }}, { quoted: msg });
              
              const metadata = await socket.groupMetadata(msg.key.remoteJid);
              const participants = metadata.participants;

              if (!participants || participants.length === 0) {
                return await replygckavi("🚫 No participants found in the group.");
              }

              let messageText = '🔊 *Hello Everyone:*\n\n';
              participants.forEach(participant => {
                messageText += `@${participant.id.split('@')[0]}\n`;
              });

              await socket.sendMessage(msg.key.remoteJid, {
                text: messageText,
                mentions: participants.map(p => p.id)
              });
            } catch (e) {
              await replygckavi("🚫 Error tagging all members.");
            }
            break;
          }

          case 'ship': {
            if (!isGroup) return await replygckavi("🚫 This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "💖", key: msg.key }}, { quoted: msg });
              
              const metadata = await socket.groupMetadata(msg.key.remoteJid);
              const participants = metadata.participants.map(v => v.id);
              
              let firstUser, secondUser;
              firstUser = participants[Math.floor(Math.random() * participants.length)];
              
              do {
                secondUser = participants[Math.floor(Math.random() * participants.length)];
              } while (secondUser === firstUser);

              const formatMention = id => '@' + id.split('@')[0];

              await socket.sendMessage(msg.key.remoteJid, {
                text: `${formatMention(firstUser)} ❤️ ${formatMention(secondUser)}\nCongratulations 💖🍻`,
                mentions: [firstUser, secondUser]
              });
            } catch (e) {
              await replygckavi("🚫 Failed to ship! Make sure this is a group.");
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
                return await replygckavi("🚫 Please mention someone or reply to their message!");
              }

              let profilePic;
              try {
                profilePic = await socket.profilePictureUrl(userToWaste, 'image');
              } catch {
                profilePic = 'https://i.imgur.com/2wzGhpF.jpeg';
              }

              const wastedResponse = await axios.get(
                `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(profilePic)}`,
                { responseType: 'arraybuffer' }
              );

              await socket.sendMessage(msg.key.remoteJid, {
                image: Buffer.from(wastedResponse.data),
                caption: `⚰️ *Wasted* : ${userToWaste.split('@')[0]} 💀\n\nRest in pieces!`,
                mentions: [userToWaste]
              });
            } catch (e) {
              await replygckavi("🚫 Failed to create wasted image!");
            }
            break;
          }

          case 'pies': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🥧", key: msg.key }}, { quoted: msg });
              const country = args[0]?.toLowerCase() || 'china';
              const validCountries = ['china', 'indonesia', 'japan', 'korea', 'hijab', 'tanzania'];
              
              if (!validCountries.includes(country)) {
                return await replygckavi(`🚫 Invalid country. Available: ${validCountries.join(', ')}`);
              }

              const apiUrl = `https://shizoapi.onrender.com/api/pies/${country}?apikey=shizo`;
              const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

              await socket.sendMessage(msg.key.remoteJid, {
                image: Buffer.from(response.data),
                caption: `🥧 Pies: ${country}`
              }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Failed to fetch pies image.");
            }
            break;
          }

          case 'fonts': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔤", key: msg.key }}, { quoted: msg });
              const text = args.join(" ");
              if (!text) return await replygckavi("🚫 Please provide text.");
              
              const fonts = {
                bold: `*${text}*`,
                italic: `_${text}_`,
                mono: `\`\`\`${text}\`\`\``,
                strike: `~${text}~`,
                small: `〔 ${text} 〕`,
                fancy: `「 ${text} 」`
              };
              
              const fontMessage = `🔤 *FONT STYLES*\n\n` +
                `*Bold:* ${fonts.bold}\n` +
                `*Italic:* ${fonts.italic}\n` +
                `*Mono:* ${fonts.mono}\n` +
                `*Strike:* ${fonts.strike}\n` +
                `*Small:* ${fonts.small}\n` +
                `*Fancy:* ${fonts.fancy}`;
              
              await replygckavi(fontMessage);
            } catch (e) {
              await replygckavi("🚫 Error generating fonts.");
            }
            break;
          }

          case 'jid': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🆔", key: msg.key }}, { quoted: msg });
              await replygckavi(`🆔 *CHAT JID*\n\n\`${msg.key.remoteJid}\``);
            } catch (e) {
              await replygckavi("🚫 Error getting JID.");
            }
            break;
          }

          case 'settings': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "⚙️", key: msg.key }}, { quoted: msg });
              const settings = await storageAPI.getSettings(sanitizedNumber);
              const settingsMsg = `⚙️ *BOT SETTINGS*\n\n` +
                `*Work Type:* ${settings.worktype || 'public'}\n` +
                `*Auto Read:* ${settings.autoread ? '✅' : '❌'}\n` +
                `*Online Presence:* ${settings.online ? '✅' : '❌'}\n` +
                `*Auto Status View:* ${settings.autoswview ? '✅' : '❌'}\n` +
                `*Auto Status Like:* ${settings.autoswlike ? '✅' : '❌'}\n\n` +
                `*Use commands to change settings:*\n` +
                `.set worktype [public/private/group/inbox]\n` +
                `.set autoread [on/off]\n` +
                `.set online [on/off]`;
              
              await replygckavi(settingsMsg);
            } catch (e) {
              await replygckavi("🚫 Error fetching settings.");
            }
            break;
          }

          case 'set': {
            if (!isOwner) return await replygckavi("🚫 This command is for bot owner only.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🔧", key: msg.key }}, { quoted: msg });
              const [setting, value] = args;
              if (!setting || !value) {
                return await replygckavi("🚫 Usage: .set [setting] [value]\n\nAvailable settings: worktype, autoread, online, autoswview, autoswlike");
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
                await replygckavi("🚫 Invalid setting or value.");
              }
            } catch (e) {
              await replygckavi("🚫 Error updating settings.");
            }
            break;
          }

          case 'viewonce': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👁️", key: msg.key }}, { quoted: msg });
              
              const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
              const quotedImage = quoted?.imageMessage;
              const quotedVideo = quoted?.videoMessage;

              if (quotedImage && quotedImage.viewOnce) {
                const stream = await socket.downloadContentFromMessage(quotedImage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await socket.sendMessage(msg.key.remoteJid, { image: buffer, caption: quotedImage.caption || '' }, { quoted: msg });
              } else if (quotedVideo && quotedVideo.viewOnce) {
                const stream = await socket.downloadContentFromMessage(quotedVideo, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await socket.sendMessage(msg.key.remoteJid, { video: buffer, caption: quotedVideo.caption || '' }, { quoted: msg });
              } else {
                await replygckavi("🚫 Please reply to a view-once image or video.");
              }
            } catch (e) {
              await replygckavi("🚫 Error processing view-once message.");
            }
            break;
          }

          default:
            if (isCommand) {
              await replygckavi(`🚫 Unknown command: ${command}\nUse *${PREFIX}menu* to see all commands.`);
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

/* status handler */
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

      // Auto-reply logic
      const msgContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      if (msgContent && !msgContent.startsWith('.') && AUTO_FEATURES.AUTO_REPLY_STATUS) {
        const autoReplies = {
          'hi': 'Hello! 👋 How can I help you?',
          'hello': 'Hi there! 😊 Use .menu to see all commands.',
          'bot': 'Yes, I\'m SILA MD MINI! 🤖 How can I assist you?'
        };
        
        const reply = autoReplies[msgContent.toLowerCase()];
        if (reply) {
          await socket.sendMessage(sender, { 
            text: reply,
            contextInfo: channelInfo
          }, { quoted: msg });
        }
      }

    } catch (err) {
      console.error('status handler error:', err);
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
            await storageAPI.upsertSession(userId, sid);
            
            // Send success message to user
            try { 
              await socket.sendMessage(userId, { 
                text: `✅ *SILA MD MINI CONNECTED*\n\n` +
                      `🤖 *Bot Name:* SILA MD MINI\n` +
                      `📱 *Your Number:* ${sanitizedNumber}\n` +
                      `⏰ *Connected At:* ${new Date().toLocaleString()}\n\n` +
                      `Use *${PREFIX}menu* to see all commands!\n\n` +
                      `_Join our community:_\n` +
                      `Group: ${GROUP_INVITE}\n` +
                      `Channel: ${CHANNEL_LINK}`,
                contextInfo: channelInfo
              }); 
            } catch (e) {}

            // Send notification to admin
            try {
              await socket.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
                text: `🔔 *NEW BOT CONNECTION*\n\n` +
                      `📱 *User Number:* ${sanitizedNumber}\n` +
                      `🤖 *Bot Instance:* SILA MD MINI\n` +
                      `⏰ *Connection Time:* ${new Date().toLocaleString()}\n` +
                      `🌐 *Total Active Bots:* ${activeSockets.size}`
              });
            } catch (e) {
              console.error('Failed to send admin notification:', e);
            }

            // Auto-join channels and groups
            try {
              const channels = [CHANNEL_JID];
              for (const channel of channels) {
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
