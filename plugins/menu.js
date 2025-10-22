// plugins/menu.js
const assets = require('../assets.json');

module.exports = {
  name: 'menu',
  commands: ['menu'],
  init: async (ctx) => { /* optional init */ },
  handle: async ({ socket, msg, args, number, reply }) => {
    const PREFIX = '.';
    const botImg = assets.menu || assets.botImage;
    const totalMemMB = (process.platform ? require('os').totalmem() / (1024*1024) : 0).toFixed(2);
    const freeMemMB = (process.platform ? require('os').freemem() / (1024*1024) : 0).toFixed(2);
    const uptimeS = Math.floor((Date.now() - (global.__socketStartTime?.[number] || Date.now()))/1000);
    const hours = Math.floor(uptimeS/3600), minutes = Math.floor((uptimeS%3600)/60), seconds = uptimeS%60;

    const message = `『 👋 Hello 』
> *𝚂𝙸𝙻𝙰 𝙼𝙳* Menu

┏━━━━━━━━━━━━━━━➢
┠➥ *ᴠᴇʀsɪᴏɴ: 1.0.0*
┠➥ *ᴘʀᴇғɪx: ${PREFIX}*
┠➥ *ᴛᴏᴛᴀʟ ᴍᴇᴍᴏʀʏ: ${totalMemMB} MB*
┠➥ *ᴜᴘᴛɪᴍᴇ: ${hours}h ${minutes}m ${seconds}s*
┗━━━━━━━━━━━━━━━➢

*Commands*:
➥ .menu
➥ .ping
➥ .song <query/url>
➥ .settings (owner only)
➥ .welcome on|off (owner)
➥ .goodbye on|off (owner)
`;
    try {
      await socket.sendMessage(msg.key.remoteJid, { image: { url: botImg }, caption: message }, { quoted: msg });
    } catch (e) {
      await reply('Failed to send menu.');
    }
  }
};
