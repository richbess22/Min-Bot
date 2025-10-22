// plugins/song.js
const axios = require('axios');
const yts = require('yt-search');

module.exports = {
  name: 'song',
  commands: ['song','yta'],
  init: async () => {},
  handle: async ({ socket, msg, args, number, reply }) => {
    try {
      const q = args.join(' ');
      if (!q) return await reply('🚫 Please provide a search query.');
      let ytUrl;
      if (q.includes('youtube.com') || q.includes('youtu.be')) ytUrl = q;
      else {
        const search = await yts(q);
        if (!search?.videos?.length) return await reply('🚫 No results found.');
        ytUrl = search.videos[0].url;
      }
      const api = `https://sadiya-tech-apis.vercel.app/download/ytdl?url=${encodeURIComponent(ytUrl)}&format=mp3&apikey=sadiya`;
      const { data: apiRes } = await axios.get(api, { timeout: 20000 });
      if (!apiRes?.status || !apiRes.result?.download) return await reply('🚫 Something went wrong.');
      const result = apiRes.result;
      const caption = `*ℹ️ Title :* \`${result.title}\`\n*⏱️ Duration :* \`${result.duration}\`\n*🧬 Views :* \`${result.views}\``;
      await socket.sendMessage(msg.key.remoteJid, { image: { url: result.thumbnail }, caption }, { quoted: msg });
      await socket.sendMessage(msg.key.remoteJid, { audio: { url: result.download }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
    } catch (err) {
      await reply('🚫 Something went wrong fetching the song.');
    }
  }
};
