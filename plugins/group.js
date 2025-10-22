// plugins/group.js
module.exports = {
  name: 'group',
  commands: ['kick','promote','demote','invite','leave'],
  init: async () => {},
  handle: async ({ socket, msg, args, number, reply }) => {
    const cmd = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').split(' ')[0].replace('.', '').toLowerCase();
    const from = msg.key.remoteJid;
    if (!from.endsWith('@g.us')) return await reply('This command works only in groups.');

    // ensure user is admin? We can check msg.key.participant or fetch group metadata
    try {
      const metadata = await socket.groupMetadata(from);
      const me = (await socket.decodeJid(socket.user.id));
      const isAdmin = metadata.participants.some(p => p.id === msg.key.participant && (p.admin === 'admin' || p.admin === 'superadmin'));
      if (!isAdmin) return await reply('You need to be group admin to use this command.');
    } catch (e) {
      // ignore metadata error
    }

    try {
      switch (cmd) {
        case 'kick': {
          const target = args[0]?.replace(/[^0-9]/g,'') + '@s.whatsapp.net';
          if (!target) return await reply('Provide phone number to kick.');
          await socket.groupRemove(from, [target]);
          await reply('Member removed.');
          break;
        }
        case 'promote': {
          const target = args[0]?.replace(/[^0-9]/g,'') + '@s.whatsapp.net';
          if (!target) return await reply('Provide phone number to promote.');
          await socket.groupMakeAdmin(from, [target]);
          await reply('Member promoted.');
          break;
        }
        case 'demote': {
          const target = args[0]?.replace(/[^0-9]/g,'') + '@s.whatsapp.net';
          if (!target) return await reply('Provide phone number to demote.');
          await socket.groupDemoteAdmin(from, [target]);
          await reply('Member demoted.');
          break;
        }
        case 'invite': {
          const invite = args[0];
          if (!invite) return await reply('Provide invite link.');
          // for safety: cannot auto-accept chat.whatsapp.com via API; respond with info
          await reply('Please open the invite link in your WhatsApp to invite the bot or members.');
          break;
        }
        case 'leave': {
          await socket.groupLeave(from);
          break;
        }
      }
    } catch (err) {
      await reply('Group action failed: ' + (err.message || err));
    }
  }
};
