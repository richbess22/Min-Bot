// file-storage.js
const fs = require('fs-extra');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

class FileStorage {
    constructor() {
        this.settings = {};
        this.sessions = {};
        this.loadData();
    }

    loadData() {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                this.settings = fs.readJSONSync(SETTINGS_FILE);
            }
        } catch (e) {
            this.settings = {};
        }

        try {
            if (fs.existsSync(SESSIONS_FILE)) {
                this.sessions = fs.readJSONSync(SESSIONS_FILE);
            }
        } catch (e) {
            this.sessions = {};
        }
    }

    saveData() {
        try {
            fs.writeJSONSync(SETTINGS_FILE, this.settings, { spaces: 2 });
            fs.writeJSONSync(SESSIONS_FILE, this.sessions, { spaces: 2 });
        } catch (e) {
            console.error('Save data error:', e);
        }
    }

    async getSettings(number) {
        const sanitized = number.replace(/[^0-9]/g, '');
        return this.settings[sanitized] || {
            worktype: 'public',
            autoread: true,
            online: true,
            autoswview: true,
            autoswlike: true
        };
    }

    async saveSettings(number, settings) {
        const sanitized = number.replace(/[^0-9]/g, '');
        this.settings[sanitized] = { ...this.settings[sanitized], ...settings };
        this.saveData();
    }

    async upsertSession(userId, sessionId) {
        this.sessions[userId] = { sessionId, number: userId.split('@')[0] };
        this.saveData();
    }

    async findSessions() {
        return Object.values(this.sessions);
    }
}

module.exports = new FileStorage();
