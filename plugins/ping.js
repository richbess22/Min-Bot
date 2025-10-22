// plugins/ping.js
module.exports = {
  name: 'ping',
  commands: ['ping'],
  init: async () => {},
  handle: async ({ socket, msg, args, number, reply }) => {
    try {
      const start = Date.now();
      const pingMsg = await socket.sendMessage(msg.key.remoteJid, { text: '🏓 Pinging...' }, { quoted: msg });
      const ping = Date.now() - start;
      await socket.sendMessage(msg.key.remoteJid, { text: `🏓 Pong! ${ping}ms`, edit: pingMsg.key });
    } catch (e) {
      await reply('Ping failed.');
    }
  }
};
