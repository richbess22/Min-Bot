// plugins/welcome.js
module.exports = {
  name: 'welcome',
  commands: ['welcome','goodbye','setwelcome','setgoodbye'],
  init: async () => {},
  handle: async ({ socket, msg, args, number, reply, storage }) => {
    // simple toggles via settings, owner only check left to caller
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    const cmd = text.split(' ')[0].replace('.', '').toLowerCase();
    const param = text.split(' ').slice(1).join(' ').trim();

    if (['welcome','goodbye'].includes(cmd) && param) {
      // set default message in settings
      await storage.updateSettings(number, { [cmd]: param });
      return await reply(`${cmd} message updated.`);
    }

    // nothing to do on direct invocation
  },

  // helper to send welcome/goodbye (invoked from main when group update)
  sendWelcome: async ({ socket, jid, participants, storage }) => {
    for (const p of participants) {
      if (p.action === 'add') {
        const num = (jid.split('-')[0] || '');
        const settings = await storage.getSettings(num);
        const welcome = settings.welcomeMessage || `Welcome @${p.id.split('@')[0]}!`;
        try {
          await socket.sendMessage(jid, { text: welcome, mentions: [p.id] });
        } catch (e) {}
      } else if (p.action === 'remove') {
        const num = (jid.split('-')[0] || '');
        const settings = await storage.getSettings(num);
        const bye = settings.goodbyeMessage || `Goodbye @${p.id.split('@')[0]}!`;
        try {
          await socket.sendMessage(jid, { text: bye, mentions: [p.id] });
        } catch (e) {}
      }
    }
  }
};
