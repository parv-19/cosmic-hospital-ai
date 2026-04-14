'use strict';

const fs = require('fs/promises');
const path = require('path');

const { createSttWavBuffer } = require('./audio-format');

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const OPENAI_STT_URL = 'https://api.openai.com/v1/audio/transcriptions';

function createSttService(options = {}) {
    const logger = options.logger || console;
    const fetchImpl = options.fetchImpl || fetch;
    const defaultTimeoutMs = options.timeoutMs || 10000;
    const sourceSampleRate = options.sourceSampleRate || 8000;

    return {
        async transcribeInboundAudio(input) {
            const config = input?.config || {};
            const fallbackTranscript = String(input?.fallbackTranscript || '').trim();
            const audioChunks = Array.isArray(input?.audioChunks) ? input.audioChunks : [];

            const primaryProvider = config.primaryProvider || 'mock';
            const fallbackChain = Array.isArray(config.fallbackChain) ? config.fallbackChain : [];
            const chain = [primaryProvider, ...fallbackChain];
            const timeoutMs = config.timeoutMs || defaultTimeoutMs;

            for (const provider of chain) {
                const normProvider = String(provider).toLowerCase();
                logger.log(`[stt] attempting provider=${normProvider}`);

                try {
                    if (normProvider === 'mock') {
                        logger.log(`[stt] provider=mock transcript=${fallbackTranscript}`);
                        return fallbackTranscript;
                    }

                    if (normProvider === 'sarvam') {
                        const transcript = await generateSarvamTranscript(fetchImpl, timeoutMs, {
                            config,
                            audioChunks,
                            sourceSampleRate,
                            logger,
                            uuid: input?.uuid,
                            utteranceMs: input?.utteranceMs
                        });
                        logger.log(`[stt] provider=sarvam transcript=${transcript}`);
                        return transcript;
                    }

                    if (normProvider === 'openai') {
                        const transcript = await generateOpenAiTranscript(fetchImpl, timeoutMs, {
                            config,
                            audioChunks,
                            sourceSampleRate,
                            logger,
                            uuid: input?.uuid,
                            utteranceMs: input?.utteranceMs
                        });
                        logger.log(`[stt] provider=openai transcript=${transcript}`);
                        return transcript;
                    }

                    logger.warn(`[stt] unsupported provider=${normProvider}`);
                } catch (error) {
                    logger.error(`[stt] provider=${normProvider} failed reason=${error.message}`);
                    // continue to next in fallback chain
                }
            }

            logger.error(`[stt] All providers failed, using fallback`);
            logger.log(`[stt] transcript=${fallbackTranscript}`);
            return fallbackTranscript;
        }
    };
}

function resolveApiKey(config) {
    const ref = config.apiKeyRef || 'SARVAM_API_KEY';
    const key = process.env[ref] || ref;
    if (!key) throw new Error(`API key ref ${ref} is not set`);
    return key;
}

async function generateOpenAiTranscript(fetchImpl, timeoutMs, options) {
    const config = options.config || {};
    const audioBuffer = Buffer.concat(options.audioChunks || []);

    if (audioBuffer.length === 0) {
        throw new Error('Inbound audio batch is empty');
    }

    const apiKey = resolveApiKey(config);
    const model = config.model || 'whisper-1';
    
    // OpenAI supports standard wav
    const wavBuffer = createSttWavBuffer(audioBuffer, {
        sourceSampleRate: options.sourceSampleRate,
        targetSampleRate: 16000 // default target for whisper
    });

    options.logger.log('[stt] request openai', {
        uuid: options.uuid || 'pending',
        pcmBytes: audioBuffer.length,
        wavBytes: wavBuffer.length
    });

    const form = new FormData();
    form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'inbound.wav');
    form.append('model', model);
    if (config.language) {
        // OpenAI expects ISO-639-1 format (e.g. 'en', 'hi')
        form.append('language', config.language.split('-')[0]); 
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(OPENAI_STT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: form,
            signal: controller.signal
        });

        if (!response.ok) {
            const errorBody = await safeReadText(response);
            throw new Error(`OpenAI STT returned ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`);
        }

        const payload = await response.json();
        const transcript = String(payload?.text || '').trim();

        if (!transcript) {
            throw new Error('OpenAI STT response did not include transcript');
        }

        return transcript;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('OpenAI STT request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

async function generateSarvamTranscript(fetchImpl, timeoutMs, options) {
    const config = options.config || {};
    const audioBuffer = Buffer.concat(options.audioChunks || []);

    if (audioBuffer.length === 0) {
        throw new Error('Inbound audio batch is empty');
    }

    const apiKey = resolveApiKey(config);
    const resolvedConfig = resolveSarvamSttConfig(config);
    const wavBuffer = createSttWavBuffer(audioBuffer, {
        sourceSampleRate: options.sourceSampleRate,
        targetSampleRate: resolvedConfig.sampleRate
    });

    await saveDebugWavIfEnabled(wavBuffer, {
        enabled: config.sttDebugSaveWav || process.env.STT_DEBUG_SAVE_WAV === 'true',
        directory: config.sttDebugDir || process.env.STT_DEBUG_DIR,
        uuid: options.uuid
    }, options.logger);

    options.logger.log('[stt] request sarvam', {
        uuid: options.uuid || 'pending',
        language: resolvedConfig.language,
        pcmBytes: audioBuffer.length,
        wavBytes: wavBuffer.length,
        utteranceMs: options.utteranceMs || 0
    });

    const form = new FormData();
    form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'inbound.wav');
    form.append('model', resolvedConfig.model);
    form.append('mode', resolvedConfig.mode);
    form.append('language_code', resolvedConfig.language);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(SARVAM_STT_URL, {
            method: 'POST',
            headers: {
                'api-subscription-key': apiKey
            },
            body: form,
            signal: controller.signal
        });

        if (!response.ok) {
            const errorBody = await safeReadText(response);
            throw new Error(`Sarvam STT returned ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`);
        }

        const payload = await response.json();
        const transcript = String(payload?.transcript || '').trim();

        if (!transcript) {
            throw new Error('Sarvam STT response did not include transcript');
        }

        return transcript;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('Sarvam STT request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function resolveSarvamSttConfig(config) {
    return {
        model: String(config.model || 'saaras:v3'),
        mode: String(config.mode || 'transcribe'),
        language: String(config.language || 'unknown'),
        sampleRate: Number(config.sampleRate) || 16000
    };
}

async function safeReadText(response) {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

async function saveDebugWavIfEnabled(wavBuffer, options, logger) {
    if (!options?.enabled) {
        return;
    }

    const targetDir = path.resolve(process.cwd(), options.directory || './debug-stt');
    const fileName = `${String(options.uuid || 'session').replace(/[^a-zA-Z0-9-_]/g, '_')}-${Date.now()}.wav`;
    const targetPath = path.join(targetDir, fileName);

    try {
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(targetPath, wavBuffer);
        logger.log(`[stt] debug wav saved path=${targetPath}`);
    } catch (error) {
        logger.error(`[stt] debug wav save failed: ${error.message}`);
    }
}

module.exports = {
    createSttService
};
