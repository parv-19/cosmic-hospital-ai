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

function readNumber(name, fallback) {
    const raw = process.env[name];

    if (raw == null || raw === '') {
        return fallback;
    }

    const parsed = Number(raw);

    if (Number.isNaN(parsed)) {
        return fallback;
    }

    return parsed;
}

const greetingConfig = {
    playWelcomeFile: readBoolean('PLAY_WELCOME_FILE', true),
    enableDynamicGreeting: readBoolean('ENABLE_DYNAMIC_GREETING', false),
    greetingText: readString('GREETING_TEXT', 'Welcome to Sunrise Care Clinic. How may I help you today?'),
    greetingTtsProvider: readString('GREETING_TTS_PROVIDER', 'mock').toLowerCase(),
    sarvamApiKey: readString('SARVAM_API_KEY', ''),
    sarvamTtsModel: readString('SARVAM_TTS_MODEL', 'bulbul:v3'),
    sarvamTtsSpeaker: readString('SARVAM_TTS_SPEAKER', 'priya').toLowerCase(),
    sarvamTtsLanguage: readString('SARVAM_TTS_LANGUAGE', 'en-IN'),
    sarvamTtsSampleRate: readNumber('SARVAM_TTS_SAMPLE_RATE', 8000),
    sttProvider: readString('STT_PROVIDER', 'mock').toLowerCase(),
    sarvamSttModel: readString('SARVAM_STT_MODEL', 'saaras:v3'),
    sarvamSttMode: readString('SARVAM_STT_MODE', 'transcribe').toLowerCase(),
    sarvamSttLanguage: readString('SARVAM_STT_LANGUAGE', 'unknown'),
    sarvamSttSampleRate: readNumber('SARVAM_STT_SAMPLE_RATE', 16000),
    endOfSpeechMs: readNumber('END_OF_SPEECH_MS', 700),
    minUtteranceMs: readNumber('MIN_UTTERANCE_MS', 500),
    utteranceMaxMs: readNumber('UTTERANCE_MAX_MS', 5000),
    sttDebugSaveWav: readBoolean('STT_DEBUG_SAVE_WAV', false),
    sttDebugDir: readString('STT_DEBUG_DIR', './debug-stt')
};

module.exports = {
    greetingConfig
};
