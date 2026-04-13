'use strict';

const RIFF_HEADER = 'RIFF';
const WAVE_HEADER = 'WAVE';
const FMT_CHUNK = 'fmt ';
const DATA_CHUNK = 'data';

function normalizeTelephonyPcm(audioBuffer, options = {}) {
    const expectedSampleRate = options.expectedSampleRate || 8000;

    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
        throw new Error('Audio payload is empty');
    }

    if (looksLikeWave(audioBuffer)) {
        return extractPcmFromWave(audioBuffer, expectedSampleRate);
    }

    if (audioBuffer.length % 2 !== 0) {
        throw new Error('Raw PCM payload length must be even for 16-bit samples');
    }

    return audioBuffer;
}

function looksLikeWave(audioBuffer) {
    return audioBuffer.length >= 12
        && audioBuffer.slice(0, 4).toString('ascii') === RIFF_HEADER
        && audioBuffer.slice(8, 12).toString('ascii') === WAVE_HEADER;
}

function extractPcmFromWave(audioBuffer, expectedSampleRate) {
    let offset = 12;
    let formatTag = null;
    let channelCount = null;
    let sampleRate = null;
    let bitsPerSample = null;
    let pcmData = null;

    while (offset + 8 <= audioBuffer.length) {
        const chunkId = audioBuffer.slice(offset, offset + 4).toString('ascii');
        const chunkSize = audioBuffer.readUInt32LE(offset + 4);
        const chunkDataStart = offset + 8;
        const chunkDataEnd = chunkDataStart + chunkSize;

        if (chunkDataEnd > audioBuffer.length) {
            throw new Error(`Invalid WAV chunk size for ${chunkId}`);
        }

        if (chunkId === FMT_CHUNK) {
            if (chunkSize < 16) {
                throw new Error('Invalid WAV fmt chunk');
            }

            formatTag = audioBuffer.readUInt16LE(chunkDataStart);
            channelCount = audioBuffer.readUInt16LE(chunkDataStart + 2);
            sampleRate = audioBuffer.readUInt32LE(chunkDataStart + 4);
            bitsPerSample = audioBuffer.readUInt16LE(chunkDataStart + 14);
        } else if (chunkId === DATA_CHUNK) {
            pcmData = audioBuffer.slice(chunkDataStart, chunkDataEnd);
        }

        offset = chunkDataEnd + (chunkSize % 2);
    }

    if (formatTag == null || channelCount == null || sampleRate == null || bitsPerSample == null || pcmData == null) {
        throw new Error('WAV payload is missing required chunks');
    }

    if (formatTag !== 1) {
        throw new Error(`Unsupported WAV encoding: ${formatTag}`);
    }

    if (bitsPerSample !== 16) {
        throw new Error(`Unsupported WAV bits per sample: ${bitsPerSample}`);
    }

    if (pcmData.length % 2 !== 0) {
        throw new Error('WAV PCM payload length must be even for 16-bit samples');
    }

    if (channelCount === 1 && sampleRate === expectedSampleRate) {
        return pcmData;
    }

    if (channelCount !== 1 && channelCount !== 2) {
        throw new Error(`Unsupported WAV channel count: ${channelCount}`);
    }

    const converted = convertPcm16ToTelephony(pcmData, {
        channelCount,
        sourceSampleRate: sampleRate,
        targetSampleRate: expectedSampleRate
    });

    if (converted.length === 0) {
        throw new Error('Converted WAV audio is empty');
    }

    return converted;
}

function convertPcm16ToTelephony(pcmData, options) {
    const channelCount = options.channelCount;
    const sourceSampleRate = options.sourceSampleRate;
    const targetSampleRate = options.targetSampleRate;
    const bytesPerFrame = channelCount * 2;
    const frameCount = Math.floor(pcmData.length / bytesPerFrame);

    if (frameCount === 0) {
        return Buffer.alloc(0);
    }

    const monoSamples = new Int16Array(frameCount);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const frameOffset = frameIndex * bytesPerFrame;

        if (channelCount === 1) {
            monoSamples[frameIndex] = pcmData.readInt16LE(frameOffset);
            continue;
        }

        const left = pcmData.readInt16LE(frameOffset);
        const right = pcmData.readInt16LE(frameOffset + 2);
        monoSamples[frameIndex] = clampInt16(Math.round((left + right) / 2));
    }

    if (sourceSampleRate === targetSampleRate) {
        return int16ArrayToBuffer(monoSamples);
    }

    const targetFrameCount = Math.max(1, Math.round(frameCount * targetSampleRate / sourceSampleRate));
    const resampled = new Int16Array(targetFrameCount);
    const maxSourceIndex = frameCount - 1;

    for (let targetIndex = 0; targetIndex < targetFrameCount; targetIndex++) {
        const sourcePosition = targetIndex * sourceSampleRate / targetSampleRate;
        const lowerIndex = Math.min(maxSourceIndex, Math.floor(sourcePosition));
        const upperIndex = Math.min(maxSourceIndex, lowerIndex + 1);
        const fraction = sourcePosition - lowerIndex;
        const lowerSample = monoSamples[lowerIndex];
        const upperSample = monoSamples[upperIndex];
        const interpolated = lowerSample + ((upperSample - lowerSample) * fraction);

        resampled[targetIndex] = clampInt16(Math.round(interpolated));
    }

    return int16ArrayToBuffer(resampled);
}

function int16ArrayToBuffer(samples) {
    const buffer = Buffer.alloc(samples.length * 2);

    for (let index = 0; index < samples.length; index++) {
        buffer.writeInt16LE(samples[index], index * 2);
    }

    return buffer;
}

function clampInt16(value) {
    if (value > 32767) {
        return 32767;
    }

    if (value < -32768) {
        return -32768;
    }

    return value;
}

module.exports = {
    normalizeTelephonyPcm,
    createSttWavBuffer
};

function createSttWavBuffer(audioBuffer, options = {}) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
        throw new Error('STT audio buffer is empty');
    }

    if (audioBuffer.length % 2 !== 0) {
        throw new Error('STT PCM payload length must be even for 16-bit samples');
    }

    const sourceSampleRate = options.sourceSampleRate || 8000;
    const targetSampleRate = options.targetSampleRate || 16000;
    const monoSamples = bufferToInt16Array(audioBuffer);
    const targetSamples = sourceSampleRate === targetSampleRate
        ? monoSamples
        : resampleInt16Mono(monoSamples, sourceSampleRate, targetSampleRate);

    return createWaveFromInt16Samples(targetSamples, targetSampleRate);
}

function bufferToInt16Array(buffer) {
    const sampleCount = buffer.length / 2;
    const samples = new Int16Array(sampleCount);

    for (let index = 0; index < sampleCount; index++) {
        samples[index] = buffer.readInt16LE(index * 2);
    }

    return samples;
}

function resampleInt16Mono(samples, sourceSampleRate, targetSampleRate) {
    if (samples.length === 0) {
        return new Int16Array(0);
    }

    const targetLength = Math.max(1, Math.round(samples.length * targetSampleRate / sourceSampleRate));
    const resampled = new Int16Array(targetLength);
    const maxSourceIndex = samples.length - 1;

    for (let targetIndex = 0; targetIndex < targetLength; targetIndex++) {
        const sourcePosition = targetIndex * sourceSampleRate / targetSampleRate;
        const lowerIndex = Math.min(maxSourceIndex, Math.floor(sourcePosition));
        const upperIndex = Math.min(maxSourceIndex, lowerIndex + 1);
        const fraction = sourcePosition - lowerIndex;
        const lowerSample = samples[lowerIndex];
        const upperSample = samples[upperIndex];
        const interpolated = lowerSample + ((upperSample - lowerSample) * fraction);

        resampled[targetIndex] = clampInt16(Math.round(interpolated));
    }

    return resampled;
}

function createWaveFromInt16Samples(samples, sampleRate) {
    const dataSize = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);

    for (let index = 0; index < samples.length; index++) {
        buffer.writeInt16LE(samples[index], 44 + (index * 2));
    }

    return buffer;
}
