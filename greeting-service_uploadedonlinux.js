'use strict';

const { normalizeTelephonyPcm } = require('./audio-format');

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

function createGreetingService(options = {}) {
    const logger = options.logger || console;
    const maxChunkSize = options.maxChunkSize || 320;
    const fetchImpl = options.fetchImpl || fetch;
    const timeoutMs = options.timeoutMs || 10000;

    return {
        async generateGreetingAudio(config) {
            const text = String(config?.greetingText || '').trim();

            if (!text) {
                throw new Error('GREETING_TEXT is empty');
            }

            const provider = String(config?.greetingTtsProvider || 'mock').toLowerCase();

            logger.log('[greeting] generating dynamic greeting audio', {
                provider,
                textLength: text.length
            });

            if (provider === 'mock') {
                return synthesizeMockGreeting(text, maxChunkSize);
            }

            if (provider === 'sarvam') {
                if (!config?.sarvamApiKey) {
                    throw new Error('SARVAM_API_KEY is missing');
                }

                return synthesizeSarvamGreeting(fetchImpl, timeoutMs, config, text, logger);
            }

            throw new Error(`Unsupported greeting TTS provider: ${provider}`);
        }
    };
}

function synthesizeMockGreeting(text, maxChunkSize) {
    const framesPerCharacter = 3;
    const frameCount = Math.max(30, text.length * framesPerCharacter);
    const buffer = Buffer.alloc(frameCount * maxChunkSize);

    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = text.charCodeAt(i % text.length) & 0xff;
    }

    return buffer;
}

async function synthesizeSarvamGreeting(fetchImpl, timeoutMs, config, text, logger) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(new Error('Sarvam TTS request timed out')), timeoutMs);

    try {
        logger.log('[greeting] Sarvam TTS request start', {
            model: config.sarvamTtsModel,
            speaker: config.sarvamTtsSpeaker,
            language: config.sarvamTtsLanguage,
            sampleRate: config.sarvamTtsSampleRate,
            textLength: text.length
        });

        const response = await fetchImpl(SARVAM_TTS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': config.sarvamApiKey
            },
            body: JSON.stringify({
                text,
                target_language_code: config.sarvamTtsLanguage,
                speaker: config.sarvamTtsSpeaker,
                model: config.sarvamTtsModel,
                speech_sample_rate: config.sarvamTtsSampleRate,
                output_audio_codec: 'wav'
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorBody = await safeReadText(response);
            throw new Error(`Sarvam TTS returned ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`);
        }

        const payload = await response.json();
        const encodedAudio = payload?.audios?.[0];

        if (!encodedAudio || typeof encodedAudio !== 'string') {
            throw new Error('Sarvam TTS response did not include audios[0]');
        }

        const decodedAudio = decodeBase64Audio(encodedAudio);
        const normalizedAudio = normalizeTelephonyPcm(decodedAudio, {
            expectedSampleRate: config.sarvamTtsSampleRate
        });

        logger.log(`[greeting] Sarvam TTS success bytes=${normalizedAudio.length}`);

        return normalizedAudio;
    } catch (error) {
        logger.error(`[greeting] Sarvam TTS failed: ${error.message}`);

        if (error?.name === 'AbortError') {
            throw new Error('Sarvam TTS request timed out');
        }

        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function decodeBase64Audio(encodedAudio) {
    try {
        const normalized = encodedAudio.includes(',')
            ? encodedAudio.slice(encodedAudio.indexOf(',') + 1)
            : encodedAudio;
        const audioBuffer = Buffer.from(normalized, 'base64');

        if (audioBuffer.length === 0) {
            throw new Error('Decoded audio payload is empty');
        }

        return audioBuffer;
    } catch (error) {
        throw new Error(`Failed to decode Sarvam audio payload: ${error.message}`);
    }
}

async function safeReadText(response) {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

module.exports = {
    createGreetingService
};
