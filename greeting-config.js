'use strict';

const fs = require('fs');
const path = require('path');

loadEnvFile();

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');

    if (!fs.existsSync(envPath)) {
        return;
    }

    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split(/\r?\n/);

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            const separatorIndex = trimmedLine.indexOf('=');

            if (separatorIndex === -1) {
                continue;
            }

            const key = trimmedLine.slice(0, separatorIndex).trim();

            if (!key || process.env[key] != null) {
                continue;
            }

            let value = trimmedLine.slice(separatorIndex + 1).trim();

            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
                value = value.slice(1, -1);
            }

            process.env[key] = value;
        }
    } catch (error) {
        console.warn('[greeting-config] failed to load .env file, continuing with current process.env values', error.message);
    }
}

function readBoolean(name, fallback) {
    const raw = process.env[name];

    if (raw == null || raw === '') {
        return fallback;
    }

    return String(raw).toLowerCase() === 'true';
}

function readString(name, fallback) {
    const raw = process.env[name];
    return raw == null || raw === '' ? fallback : raw;
}

const greetingConfig = {
    playWelcomeFile: readBoolean('PLAY_WELCOME_FILE', true),
    enableDynamicGreeting: readBoolean('ENABLE_DYNAMIC_GREETING', false),
    greetingText: readString('GREETING_TEXT', 'Welcome to Sunrise Care Clinic. How may I help you today?'),
    greetingTtsProvider: readString('GREETING_TTS_PROVIDER', 'mock').toLowerCase(),
    sarvamApiKey: readString('SARVAM_API_KEY', '')
};

module.exports = {
    greetingConfig
};
