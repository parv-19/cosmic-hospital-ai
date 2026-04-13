'use strict';

const fs = require('fs/promises');
const path = require('path');

const { createSttWavBuffer } = require('./audio-format');

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';

function createSttService(options = {}) {
    const logger = options.logger || console;
    const fetchImpl = options.fetchImpl || fetch;
    const timeoutMs = options.timeoutMs || 10000;
    const sourceSampleRate = options.sourceSampleRate || 8000;

    return {
        async transcribeInboundAudio(input) {
            const config = input?.config || {};
            const provider = String(config.sttProvider || 'mock').toLowerCase();
            const fallbackTranscript = String(input?.fallbackTranscript || '').trim();
            const audioChunks = Array.isArray(input?.audioChunks) ? input.audioChunks : [];

            logger.log(`[stt] provider=${provider}`);

            if (provider === 'mock') {
                logger.log(`[stt] transcript=${fallbackTranscript}`);
                return fallbackTranscript;
            }

            if (provider === 'sarvam') {
                try {
                    const transcript = await generateSarvamTranscript(fetchImpl, timeoutMs, {
                        config,
                        audioChunks,
                        sourceSampleRate,
                        logger,
                        uuid: input?.uuid,
                        utteranceMs: input?.utteranceMs
                    });

                    logger.log(`[stt] transcript=${transcript}`);
                    return transcript;
                } catch (error) {
                    logger.error(`[stt] fallback triggered provider=sarvam reason=${error.message}`);
                    logger.log(`[stt] transcript=${fallbackTranscript}`);
                    return fallbackTranscript;
                }
            }

            logger.error(`[stt] unsupported provider=${provider}, using mock fallback`);
            logger.log(`[stt] transcript=${fallbackTranscript}`);
            return fallbackTranscript;
        }
    };
}

async function generateSarvamTranscript(fetchImpl, timeoutMs, options) {
    const config = options.config || {};
    const audioBuffer = Buffer.concat(options.audioChunks || []);

    if (!config.sarvamApiKey) {
        throw new Error('SARVAM_API_KEY is missing');
    }

    if (audioBuffer.length === 0) {
        throw new Error('Inbound audio batch is empty');
    }

    const resolvedConfig = resolveSarvamSttConfig(config);
    const wavBuffer = createSttWavBuffer(audioBuffer, {
        sourceSampleRate: options.sourceSampleRate,
        targetSampleRate: resolvedConfig.sampleRate
    });

    await saveDebugWavIfEnabled(wavBuffer, {
        enabled: config.sttDebugSaveWav,
        directory: config.sttDebugDir,
        uuid: options.uuid
    }, options.logger);

    options.logger.log('[stt] request', {
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
                'api-subscription-key': config.sarvamApiKey
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
        model: String(config.sarvamSttModel || 'saaras:v3'),
        mode: String(config.sarvamSttMode || 'transcribe'),
        language: String(config.sarvamSttLanguage || 'unknown'),
        sampleRate: Number(config.sarvamSttSampleRate) || 16000
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
