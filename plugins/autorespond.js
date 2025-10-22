// plugins/autorespond.js
module.exports = {
  name: 'autorespond',
  commands: [],
  init: async () => {},
  handle: async ({ socket, msg, text, number, reply }) => {
    if (!text) return;
    const normalized = text.toLowerCase();
    // basic keyword map - mix of Kiswahili & English
    const map = [
      { keys: ['hi','hello','hey'], resp: 'Hi! Habari yako? 😊' },
      { keys: ['salaam','salamu','as-salaam'], resp: 'Salam! Habari, ninaweza kukusaidia?' },
      { keys: ['bye','goodbye','kwaheri'], resp: 'Kwaheri! Uwe na siku njema 💫' },
      { keys: ['tnx','thanks','asante'], resp: 'Karibu 😊' },
      { keys: ['status','seen status','seen'], resp: 'SEEN YOUR STATUS BY SILA MD' }
    ];

    for (const rule of map) {
      for (const k of rule.keys) {
        if (normalized === k || normalized.includes(k)) {
          try { await reply(rule.resp); } catch(e) {}
          return;
        }
      }
    }
  }
};
