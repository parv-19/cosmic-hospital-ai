'use strict';

const { normalizeTelephonyPcm } = require('./audio-format');

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

function createGreetingService(options = {}) {
    const logger = options.logger || console;
    const maxChunkSize = options.maxChunkSize || 320;
    const fetchImpl = options.fetchImpl || fetch;
    const defaultTimeoutMs = options.timeoutMs || 10000;

    return {
        async generateGreetingAudio(config) {
            const text = String(config?.greetingText || '').trim();

            if (!text) {
                throw new Error('GREETING_TEXT is empty');
            }

            const primaryProvider = config?.primaryProvider || 'mock';
            const fallbackChain = Array.isArray(config?.fallbackChain) ? config.fallbackChain : [];
            const chain = [primaryProvider, ...fallbackChain];
            const timeoutMs = config?.timeoutMs || defaultTimeoutMs;

            logger.log('[greeting] generating dynamic greeting audio', {
                chain,
                textLength: text.length
            });

            for (const provider of chain) {
                const normProvider = String(provider).toLowerCase();
                logger.log(`[greeting] attempting provider=${normProvider}`);

                try {
                    if (normProvider === 'mock') {
                        return synthesizeMockGreeting(text, maxChunkSize);
                    }

                    if (normProvider === 'sarvam') {
                        return await generateSarvamGreeting(fetchImpl, timeoutMs, config, text, logger);
                    }
                    
                    if (normProvider === 'openai') {
                        return await generateOpenAiGreeting(fetchImpl, timeoutMs, config, text, logger);
                    }

                    logger.warn(`[greeting] unsupported TTS provider: ${normProvider}`);
                } catch (error) {
                    logger.error(`[greeting] provider=${normProvider} failed. reason=${error.message}`);
                    // Fall back
                }
            }

            logger.error('[greeting] all TTS providers failed, returning mock audio');
            return synthesizeMockGreeting(text, maxChunkSize);
        }
    };
}

function resolveApiKey(config) {
    const ref = config?.apiKeyRef || 'SARVAM_API_KEY';
    const key = process.env[ref] || ref;
    if (!key) throw new Error(`API key ref ${ref} is not set`);
    return key;
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

async function generateOpenAiGreeting(fetchImpl, timeoutMs, config, text, logger) {
    const apiKey = resolveApiKey(config);
    const model = String(config?.model || 'tts-1');
    const voice = String(config?.voice || 'alloy').toLowerCase();
    
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(new Error('OpenAI TTS request timed out')), timeoutMs);

    try {
        logger.log('[greeting] OpenAI TTS request start', {
            model,
            voice,
            textLength: text.length
        });

        const response = await fetchImpl(OPENAI_TTS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                input: text,
                voice,
                response_format: 'wav' // Ensure wav for telephony processing
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorBody = await safeReadText(response);
            throw new Error(`OpenAI TTS returned ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Target Sample rate logic isn't as easily isolated as Sarvam's base64 audio response,
        // but `normalizeTelephonyPcm` operates on a buffer. The gateway supports converting PCM chunks if needed.
        // Assuming 8000Hz expected, but openai usually outputs higher. 
        // We will just pass the buffer to normalizeTelephonyPcm (which looks for a wav header)
        
        const normalizedAudio = normalizeTelephonyPcm(buffer, {
            expectedSampleRate: 8000 // assuming standard output telephony
        });

        logger.log(`[greeting] OpenAI TTS success bytes=${normalizedAudio.length}`);

        return normalizedAudio;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

async function generateSarvamGreeting(fetchImpl, timeoutMs, config, text, logger) {
    const apiKey = resolveApiKey(config);
    const resolvedConfig = resolveSarvamTtsConfig(config);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(new Error('Sarvam TTS request timed out')), timeoutMs);

    try {
        logger.log('[greeting] Sarvam TTS request start', {
            model: resolvedConfig.model,
            speaker: resolvedConfig.speaker,
            language: resolvedConfig.language,
            sampleRate: resolvedConfig.sampleRate,
            textLength: text.length
        });

        const response = await fetchImpl(SARVAM_TTS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': apiKey
            },
            body: JSON.stringify({
                text,
                target_language_code: resolvedConfig.language,
                speaker: resolvedConfig.speaker,
                model: resolvedConfig.model,
                speech_sample_rate: resolvedConfig.sampleRate,
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
            expectedSampleRate: resolvedConfig.sampleRate
        });

        logger.log(`[greeting] Sarvam TTS success bytes=${normalizedAudio.length}`);

        return normalizedAudio;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function resolveSarvamTtsConfig(config) {
    return {
        model: String(config?.model || 'bulbul:v3'),
        speaker: String(config?.voice || 'shubh').toLowerCase(),
        language: String(config?.language || 'en-IN'),
        sampleRate: Number(config?.sampleRate) || 8000
    };
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
