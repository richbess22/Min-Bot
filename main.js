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

const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || '255612491554').split(',').filter(Boolean);
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '255612491554';

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = path.resolve(process.env.SESSION_BASE_PATH || './session');

fs.ensureDirSync(SESSION_BASE_PATH);

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
          contextInfo: { 
            isForwarded: true, 
            forwardingScore: 99999999,
            externalAdReply: {
              title: "SILA MD MINI",
              body: "𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳",
              thumbnailUrl: botImg,
              sourceUrl: "https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28",
              mediaType: 1,
              renderLargerThumbnail: true
            }
          }
        }, { quoted: msg });
      };

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

              const message = `*SILA MINI BOT  MENU 🤍*

*╭━━━━━━━━━━━━━━━━●◌*
*│ \`● Greet :\`* *Hello 👋*
*│ \`● Bot Name :\`* SILA MD MINI
*│ \`● Run Time :\`* ${hours}h ${minutes}m ${seconds}s
*│ \`● Your Number :\`* ${sanitizedNumber}
*│ \`● Active Bots :\`* ${activeBots}
*╰━━━━━━━━━━━━━━━━●◌*

\`● Download Menu\`

╭━━━━━━━━━━━━━━━━━●◌
│    \`■ Command :\` .song
│  *🍃 Download Youtube Songs*
│
│    \`■ Command :\` .video
│  *🍃 Download Youtube Videos*
│
│    \`■ Command :\` .csend
│  *🍃 Send Songs To Channels*
│
│    \`■ Command :\` .yts
│  *🍃 Generate Youtube Serach Links*
│
│    \`■ Command :\` .tiktok
│  *🍃 Download Tiktok Videos*
│
│    \`■ Command :\` .fb
│  *🍃 Download Facebook Posts*
│
│    \`■ Command :\` .img
│  *🍃 Download Images From Google*
│
│    \`■ Command :\` .insta
│  *🍃 Download Intergram Posts*
│
│    \`■ Command :\` .mediafire
│  *🍃 Download Mediafire Documents*
│
│    \`■ Command :\` .apk
│  *🍃 Download Apps From Playstore*
│
│    \`■ Command :\` .technews
│  *🍃 Download Latest World Technews*
│
│    \`■ Command :\` .xvideo
│  *🍃 Download 18+ videos*
╰━━━━━━━━━━━━━━━━━●◌

\`● User Menu\`

╭━━━━━━━━━━━━━━━━━●◌
│    \`■ Command :\` .menu
│  *🍃 Show All Bot Commands*
│
│    \`■ Command :\` .alive
│  *🍃 Check Bot Online / Offline*
│
│    \`■ Command :\` .ping
│  *🍃 Check Bot Run Speed*
│
│    \`■ Command :\` .system
│  *🍃 Show Bot System Operations*
│
│    \`■ Command :\` .settings
│  *🍃 Check & Change Bot Settings*
╰━━━━━━━━━━━━━━━━━●◌

\`● Anime Menu\`

╭━━━━━━━━━━━━━━━━━●◌
│    \`■ Command :\` .anime neko
│  *🍃 Download Random Anime Images*
│
│    \`■ Command :\` .anime waifu
│  *🍃 Download Random Anime Images*
│
│    \`■ Command :\` .anime fox_girl
│  *🍃 Download Random Anime Images*
│
│    \`■ Command :\` .anime hug
│  *🍃 Download Random Anime Images*
│
│    \`■ Command :\` .anime kiss
│  *🍃 Download Random Anime Images*
│
│    \`■ Command :\` .anime pat
│  *🍃 Download Random Anime Images*
╰━━━━━━━━━━━━━━━━━●◌

\`● Other Menu\`

╭━━━━━━━━━━━━━━━━━●◌
│    \`■ Command :\` .fonts
│  *🍃 Give Different Types Of Fonts*
│
│    \`■ Command :\` .npm
│  *🍃 Search Lastest Npm Packages*
│
│    \`■ Command :\` .reacts
│  *🍃 Show Channel React Catagories*
│
│    \`■ Command :\` .channelinfo
│  *🍃 Show Channel Details*
│
│    \`■ Command :\` .bomb
│  *🍃 Send Any Massage In Any Count*
│
│    \`■ Command :\` .jid
│  *🍃 Get Chat Jid*
│
│    \`■ Command :\` .save
│  *🍃 Save Status Images / Videos*
│
│    \`■ Command :\` .getpp
│  *🍃 Download Whatsapp Profiles*
│
│    \`■ Command :\` .vv
│  *🍃 Download Oneview Massages*
│
│    \`■ Command :\` .freebot 
│  *🍃 Connect Our Bot To Your Whatsapp*
╰━━━━━━━━━━━━━━━━━●◌

> *- 𝙿𝙾𝚆𝙴𝚁𝙳 𝙱𝚈 𝚂𝙸𝙻𝙰 𝙼𝙳 𝙼𝙸𝙽𝙸 -*`;

              await socket.sendMessage(msg.key.remoteJid, { 
                image: { url: botImg }, 
                caption: message,
                contextInfo: {
                  externalAdReply: {
                    title: "SILA MD MINI",
                    body: "View Our Channel",
                    thumbnailUrl: botImg,
                    sourceUrl: "https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28",
                    mediaType: 1,
                    renderLargerThumbnail: true
                  }
                }
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
            await socket.sendMessage(msg.key.remoteJid, { text: `🏓 Pong! ${ping}ms`, edit: pingMsg.key });
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
                headerType: 4,
                contextInfo: {
                  externalAdReply: {
                    title: "SILA MD MINI",
                    body: "YouTube Audio Downloader",
                    thumbnailUrl: result.thumbnail,
                    sourceUrl: "https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28",
                    mediaType: 1,
                    renderLargerThumbnail: true
                  }
                }
              };

              await socket.sendMessage(msg.key.remoteJid, buttonMessage, { quoted: msg });
              await socket.sendMessage(msg.key.remoteJid, { audio: { url: result.download }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
            } catch (e) {
              await replygckavi("🚫 Something went wrong while downloading the song.");
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
              
              // Placeholder for TikTok API
              const api = `https://api.example.com/tiktok?url=${encodeURIComponent(url)}`;
              // Implement TikTok download logic here
              await replygckavi("🔧 TikTok download feature coming soon...");
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
              
              // Placeholder for Facebook API
              await replygckavi("🔧 Facebook download feature coming soon...");
            } catch (e) {
              await replygckavi("🚫 Error downloading Facebook video.");
            }
            break;
          }

          case 'img': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🖼️", key: msg.key }}, { quoted: msg });
              const query = args.join(" ");
              if (!query) return await replygckavi("🚫 Please provide a search query.");
              
              // Placeholder for Image Search API
              await replygckavi("🔧 Image search feature coming soon...");
            } catch (e) {
              await replygckavi("🚫 Error searching images.");
            }
            break;
          }

          case 'insta': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "📸", key: msg.key }}, { quoted: msg });
              const url = args[0];
              if (!url) return await replygckavi("🚫 Please provide an Instagram URL.");
              
              // Placeholder for Instagram API
              await replygckavi("🔧 Instagram download feature coming soon...");
            } catch (e) {
              await replygckavi("🚫 Error downloading Instagram content.");
            }
            break;
          }

          case 'anime': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎌", key: msg.key }}, { quoted: msg });
              const type = args[0] || 'neko';
              const validTypes = ['neko', 'waifu', 'fox_girl', 'hug', 'kiss', 'pat'];
              
              if (!validTypes.includes(type)) {
                return await replygckavi(`🚫 Invalid anime type. Available: ${validTypes.join(', ')}`);
              }
              
              // Placeholder for Anime API
              const apiUrl = `https://api.waifu.pics/sfw/${type}`;
              const { data } = await axios.get(apiUrl);
              
              if (data && data.url) {
                await socket.sendMessage(msg.key.remoteJid, { 
                  image: { url: data.url },
                  caption: `*🎌 ANIME ${type.toUpperCase()}*\n\nPowered by waifu.pics API`
                }, { quoted: msg });
              } else {
                await replygckavi("🚫 Failed to fetch anime image.");
              }
            } catch (e) {
              await replygckavi("🚫 Error fetching anime image.");
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

          case 'group': {
            if (!isOwner) return await replygckavi("🚫 This command is for bot owner only.");
            if (!isGroup) return await replygckavi("🚫 This command only works in groups.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "👥", key: msg.key }}, { quoted: msg });
              const subcmd = args[0]?.toLowerCase();
              
              switch (subcmd) {
                case 'info':
                  const metadata = await socket.groupMetadata(msg.key.remoteJid);
                  const infoMsg = `👥 *GROUP INFO*\n\n` +
                    `*Name:* ${metadata.subject}\n` +
                    `*ID:* ${metadata.id}\n` +
                    `*Participants:* ${metadata.participants.length}\n` +
                    `*Creation:* ${new Date(metadata.creation * 1000).toLocaleDateString()}\n` +
                    `*Owner:* ${metadata.owner ? metadata.owner.split('@')[0] : 'Unknown'}\n` +
                    `*Description:* ${metadata.desc || 'No description'}`;
                  await replygckavi(infoMsg);
                  break;
                  
                case 'promote':
                  const userToPromote = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                  await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToPromote], 'promote');
                  await replygckavi(`✅ Promoted user: ${userToPromote.split('@')[0]}`);
                  break;
                  
                case 'demote':
                  const userToDemote = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                  await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToDemote], 'demote');
                  await replygckavi(`✅ Demoted user: ${userToDemote.split('@')[0]}`);
                  break;
                  
                case 'kick':
                  const userToKick = msg.message?.extendedTextMessage?.contextInfo?.participant || args[1] + '@s.whatsapp.net';
                  await socket.groupParticipantsUpdate(msg.key.remoteJid, [userToKick], 'remove');
                  await replygckavi(`✅ Kicked user: ${userToKick.split('@')[0]}`);
                  break;
                  
                default:
                  await replygckavi("🚫 Available group commands:\n• .group info\n• .group promote [@user]\n• .group demote [@user]\n• .group kick [@user]");
              }
            } catch (e) {
              await replygckavi("🚫 Error executing group command.");
            }
            break;
          }

          case 'autoreply': {
            if (!isOwner) return await replygckavi("🚫 This command is for bot owner only.");
            
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
              const [subcmd, ...replyArgs] = args;
              
              switch (subcmd) {
                case 'add':
                  if (replyArgs.length < 2) return await replygckavi("🚫 Usage: .autoreply add [trigger] [response]");
                  const trigger = replyArgs[0].toLowerCase();
                  const response = replyArgs.slice(1).join(' ');
                  // Implement auto-reply storage logic here
                  await replygckavi(`✅ Auto-reply added:\nTrigger: ${trigger}\nResponse: ${response}`);
                  break;
                  
                case 'list':
                  // Implement auto-reply list logic here
                  await replygckavi("🔧 Auto-reply list feature coming soon...");
                  break;
                  
                case 'remove':
                  // Implement auto-reply remove logic here
                  await replygckavi("🔧 Auto-reply remove feature coming soon...");
                  break;
                  
                default:
                  await replygckavi("🚫 Available auto-reply commands:\n• .autoreply add [trigger] [response]\n• .autoreply list\n• .autoreply remove [trigger]");
              }
            } catch (e) {
              await replygckavi("🚫 Error managing auto-replies.");
            }
            break;
          }

          case 'freebot': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
              const freebotMsg = `🤖 *CONNECT FREE BOT*\n\n` +
                `To connect SILA MD MINI to your WhatsApp:\n\n` +
                `1. Visit our website https://min-bot-ewan.onrender.com or\n` +
                `2. Use the pairing system\n` +
                `3. Get your personal bot instance\n\n` +
                `*Features:*\n` +
                `✅ YouTube Downloader\n` +
                `✅ TikTok Downloader\n` +
                `✅ Facebook Downloader\n` +
                `✅ Anime Images\n` +
                `✅ Group Management\n` +
                `✅ Auto-reply System\n\n` +
                `_Contact admin for more info_`;
              
              await replygckavi(freebotMsg);
            } catch (e) {
              await replygckavi("🚫 Error displaying freebot info.");
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
        if (settings.autoswview) { try { await socket.readMessages([msg.key]); } catch (e) {} }
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

      // Auto-reply logic (basic implementation)
      const msgContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      if (msgContent && !msgContent.startsWith('.')) {
        // Add your auto-reply triggers here
        const autoReplies = {
          'hi': 'Hello! 👋 How can I help you?',
          'hello': 'Hi there! 😊 Use .menu to see all commands.',
          'bot': 'Yes, I\'m SILA MD MINI! 🤖 How can I assist you?'
        };
        
        const reply = autoReplies[msgContent.toLowerCase()];
        if (reply) {
          await socket.sendMessage(sender, { 
            text: reply,
            contextInfo: {
              externalAdReply: {
                title: "SILA MD MINI",
                body: "Auto Reply System",
                thumbnailUrl: "https://files.catbox.moe/ebj284.jpg",
                sourceUrl: "https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28",
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
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
                      `_Join our channel for updates:_\n` +
                      `https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28`,
                contextInfo: {
                  externalAdReply: {
                    title: "SILA MD MINI",
                    body: "Successfully Connected!",
                    thumbnailUrl: "https://files.catbox.moe/ebj284.jpg",
                    sourceUrl: "https://whatsapp.com/channel/0029VbBPxQTJUM2WCZLB6j28",
                    mediaType: 1,
                    renderLargerThumbnail: true
                  }
                }
              }); 
            } catch (e) {}

            // Send notification to admin
            if (ADMIN_NUMBER) {
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
            }

            // Auto-join channels and groups
            try {
              const channels = [
                "120363422610520277@newsletter",
                "120363400472006536@g.us"
              ];
              
              const groups = [
                "120363400472006536@g.us"
              ];

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
