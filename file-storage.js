// file-storage.js
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

fs.ensureDirSync(DATA_DIR);

async function readJsonSafe(filePath, defaultValue) {
  try {
    if (!await fs.pathExists(filePath)) {
      await fs.writeJson(filePath, defaultValue, { spaces: 2 });
      return defaultValue;
    }
    const data = await fs.readJson(filePath);
    return data || defaultValue;
  } catch (err) {
    console.warn('readJsonSafe error for', filePath, err.message);
    return defaultValue;
  }
}

async function writeJsonSafe(filePath, data) {
  try {
    await fs.writeJson(filePath, data, { spaces: 2 });
  } catch (err) {
    console.error('writeJsonSafe error for', filePath, err);
  }
}

/* Sessions API */
async function getAllSessions() {
  return await readJsonSafe(SESSIONS_FILE, []); // array of { number, sessionId, createdAt }
}

async function upsertSession(number, sessionId) {
  const sessions = await getAllSessions();
  const idx = sessions.findIndex(s => s.number === number);
  if (idx === -1) sessions.push({ number, sessionId, createdAt: new Date().toISOString() });
  else sessions[idx].sessionId = sessionId;
  await writeJsonSafe(SESSIONS_FILE, sessions);
  return true;
}

async function findSessions() {
  return await getAllSessions();
}

/* Settings API */
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
  onlyworkgroup_links: { whitelist: [] }
};

async function getAllSettings() {
  return await readJsonSafe(SETTINGS_FILE, {}); // object keyed by number
}

async function getSettings(number) {
  const sanitized = (number || '').replace(/\D/g, '');
  const all = await getAllSettings();
  if (!all[sanitized]) {
    all[sanitized] = JSON.parse(JSON.stringify(defaultSettings));
    await writeJsonSafe(SETTINGS_FILE, all);
    return all[sanitized];
  }
  const merged = JSON.parse(JSON.stringify(defaultSettings));
  Object.assign(merged, all[sanitized]);
  for (const k of Object.keys(defaultSettings)) {
    if (defaultSettings[k] && typeof defaultSettings[k] === 'object' && !Array.isArray(defaultSettings[k])) {
      merged[k] = { ...defaultSettings[k], ...(all[sanitized][k] || {}) };
    }
  }
  all[sanitized] = merged;
  await writeJsonSafe(SETTINGS_FILE, all);
  return merged;
}

async function updateSettings(number, updates = {}) {
  const sanitized = (number || '').replace(/\D/g, '');
  const all = await getAllSettings();
  const base = all[sanitized] || JSON.parse(JSON.stringify(defaultSettings));
  for (const key of Object.keys(updates)) {
    if (updates[key] && typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
      base[key] = { ...(base[key] || {}), ...updates[key] };
    } else {
      base[key] = updates[key];
    }
  }
  all[sanitized] = base;
  await writeJsonSafe(SETTINGS_FILE, all);
  return base;
}

async function saveSettings(number) {
  return await getSettings(number);
}

module.exports = {
  getSettings,
  updateSettings,
  saveSettings,
  upsertSession,
  findSessions,
  defaultSettings
};
