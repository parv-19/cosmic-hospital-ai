'use strict';

function createGreetingService(options = {}) {
    const logger = options.logger || console;
    const maxChunkSize = options.maxChunkSize || 320;

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

                throw new Error('Sarvam greeting provider is not implemented in Phase 1');
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

module.exports = {
    createGreetingService
};
