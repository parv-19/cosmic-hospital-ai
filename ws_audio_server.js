'use strict';

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { greetingConfig } = require('./greeting-config');
const { createGreetingService } = require('./greeting-service');
const { createSttService } = require('./stt-service');
const logger = console;

const activeSessions = new Set();

/* =====================
   CONFIG
===================== */

const PORT = Number(process.env.PORT || 8080);
const MAX_CHUNK_SIZE = 320;      // 20ms @ 8kHz PCM
const INTERVAL_MS = 100;
const MIN_INBOUND_CHUNKS = 20;
const BOT_ENGINE_URL = 'http://localhost:4004/process-call';
const BOT_ENGINE_BASE_URL = BOT_ENGINE_URL.replace(/\/process-call$/, '');
const TRANSFER_CONTROL_TYPE = process.env.TRANSFER_CONTROL_TYPE || 'transfer';
const TRANSFER_CONNECT_TO = process.env.TRANSFER_CONNECT_TO || 'reception';
const TRANSFER_CONFIRMATION_MESSAGE = process.env.TRANSFER_CONFIRMATION_MESSAGE || 'I am transferring your call, please hold.';
const PLAY_WELCOME_FILE = greetingConfig.playWelcomeFile;
const END_OF_SPEECH_MS = greetingConfig.endOfSpeechMs;
const MIN_UTTERANCE_MS = greetingConfig.minUtteranceMs;
const UTTERANCE_MAX_MS = greetingConfig.utteranceMaxMs;
const SPEECH_CHUNK_AVG_ABS_THRESHOLD = 250;
const DEMO_CALLER_UTTERANCES = [
    'appointment book karna hai',
    'cardiologist',
    'earliest available doctor',
    'tomorrow',
    'morning',
    'mera naam Rahul hai',
    'mobile number 9876543210',
    'new patient',
    'confirm'
];

const WELCOME_FILE = path.join(__dirname, 'welcome.sln');
const greetingService = createGreetingService({
    logger,
    maxChunkSize: MAX_CHUNK_SIZE
});
const sttService = createSttService({
    logger,
    sourceSampleRate: 8000
});

/* =====================
   WS SERVER
===================== */

const wss = new WebSocket.Server({
    port: PORT,
    perMessageDeflate: false
});

logger.log(`WS Audio Server listening on ${PORT}`);
logger.log(`PLAY_WELCOME_FILE=${PLAY_WELCOME_FILE}`);
logger.log(`ENABLE_DYNAMIC_GREETING=${greetingConfig.enableDynamicGreeting}`);
logger.log(`GREETING_TTS_PROVIDER=${greetingConfig.greetingTtsProvider}`);
logger.log(`STT_PROVIDER=${greetingConfig.sttProvider}`);
logger.log(`END_OF_SPEECH_MS=${END_OF_SPEECH_MS}`);
logger.log(`MIN_UTTERANCE_MS=${MIN_UTTERANCE_MS}`);
logger.log(`UTTERANCE_MAX_MS=${UTTERANCE_MAX_MS}`);
if (!fs.existsSync(WELCOME_FILE)) {
    logger.error(`WELCOME_FILE missing: ${WELCOME_FILE}`);
} else {
    const stats = fs.statSync(WELCOME_FILE);
    logger.log(`WELCOME_FILE ready: ${WELCOME_FILE} (${stats.size} bytes)`);
}
setupProcessSignalsWS(wss, activeSessions);

/* =====================
   SESSION STATE
===================== */

function createSessionState(ws) {
    return {
        ws,
        /* receiver timer */
        recvTimer: null,
        /* sender timer */
        sendTimer: null,

        uuid: '',
        callerNumber: '',
        startedAt: Date.now(),
        endedAt: Date.now(),

        /* inbound (caller -> ASR) */
        RECV_CHUNK: 0,
        inboundAudioData: [],
        maxAudioDataLen: 2048,
        currentUtteranceChunks: [],
        speechStartedAt: 0,
        lastInboundAt: 0,
        droppedInboundChunks: 0,
        turnState: 'LISTENING',
        speakingSource: '',

        /* outbound (TTS / file -> Asterisk) */
        SEND_CHUNK: 0,
        outboundAudioData: [],
        // 8kHz mono s16le is 16,000 bytes/sec, so 100ms of audio is 1,600 bytes.
        // With 320-byte frames (20ms each), we must send 5 frames per 100ms tick.
        outboundSize: 5,

        /* flags */
        firstAudioSeen: false,
        welcomePlayed: false,
        paused: false,
        playingFile: false,
        isProcessing: false,
        processedUtterances: 0,
        lastProcessedAt: 0,
        minProcessGapMs: 4000,
        pendingUsageEvents: [],
        demoTurnIndex: 0,
        demoCompleted: false,
        hangupSent: false,
        transferPending: false,
        transferSent: false,
        transferNumber: '',
        cleanupNotified: false,
    };
}

/* =====================
   CONNECTION
===================== */

wss.on('connection', ws => {
    logger.log('New websocket connection received');
    const state = createSessionState(ws);
    activeSessions.add(state);

    ws.on('message', (data, isBinary) => {
        if (isBinary) {
            _onAudio(state, data);
        } else {
            void _onControl(state, data.toString());
        }
    });

    ws.on('close', () => _cleanup(state, 'ws-close'));
    ws.on('error', () => _cleanup(state, 'ws-error'));
});

/* =====================
   CONTROL PLANE
===================== */

async function _onControl(state, text) {
    logger.log(`Control message received uuid=${state.uuid || 'pending'} payload=${text}`);
    let msg;
    try { msg = JSON.parse(text); } catch { return; }

    switch (msg.type) {
    case 'start':
        state.uuid = msg.uuid;
        state.callerNumber = msg.mobile || msg.caller || '';
        state.startedAt = Date.now();
        logger.info(`WS start uuid=${state.uuid}`);
        
        try {
            const resp = await fetch('http://127.0.0.1:4001/clinic-settings');
            if (resp.ok) {
                const payload = await resp.json();
                state.aiConfig = payload.data || {};
            } else {
                state.aiConfig = {};
            }
        } catch (e) {
            logger.error(`Failed to fetch clinic-settings for ${state.uuid}: ${e.message}`);
            state.aiConfig = {};
        }
        break;

    case 'info':
        logger.info(`uuid=${state.uuid} ${msg.level} ${msg.message}`);
        break;

    case 'hangup':
        state.endedAt = Date.now();
        logger.warn('ws hangup recived');
        _cleanup(state, 'hangup');
        break;
    }
}

/* =====================
   INBOUND AUDIO
===================== */

function _onAudio(state, chunk) {
    if (!(chunk instanceof Buffer) || chunk.length === 0) return;

    /* FIRST AUDIO BYTE LOGIC */
    if (!state.firstAudioSeen) {
        state.firstAudioSeen = true;
        logger.log(`First binary audio received uuid=${state.uuid || 'pending'} bytes=${chunk.length}`);

        // start audio sender / receiver
        logger.log(`Starting audio receiver uuid=${state.uuid || 'pending'}`);
        startAudioReceiver(state);
        logger.log(`Starting audio sender uuid=${state.uuid || 'pending'}`);
        startAudioSender(state);

        void playConfiguredGreeting(state);
    }

    state.RECV_CHUNK++;

    if (state.turnState === 'SPEAKING') {
        state.droppedInboundChunks += 1;
        return;
    }

    if (state.turnState !== 'LISTENING') {
        return;
    }

    const now = Date.now();

    if (!hasSpeechEnergy(chunk)) {
        return;
    }

    if (!state.speechStartedAt) {
        state.speechStartedAt = now;
    }

    state.lastInboundAt = now;

    if (state.currentUtteranceChunks.length >= state.maxAudioDataLen) {
        logger.error('currentUtteranceChunks overflow at '+state.SEND_CHUNK + '/'+ state.RECV_CHUNK + ' ' + state.currentUtteranceChunks.length);
        state.currentUtteranceChunks.shift();
    }
    state.currentUtteranceChunks.push(chunk);
}

function startAudioReceiver(state) {
    if (state.recvTimer) return;

    logger.log(`startAudioReceiver started uuid=${state.uuid || 'pending'} interval=${INTERVAL_MS}ms`);
    state.recvTimer = setInterval(() => {
        receiveInboundTick(state);
    }, INTERVAL_MS);
}

function receiveInboundTick(state) {
    if (state.ws.readyState !== WebSocket.OPEN) {
        return;
    }

    if (state.turnState === 'PROCESSING' || state.demoCompleted) {
        return;
    }

    if (state.turnState === 'SPEAKING') {
        return;
    }

    if (state.currentUtteranceChunks.length === 0) {
        return;
    }

    if (Date.now() - state.lastProcessedAt < state.minProcessGapMs) {
        logger.log(`[${state.uuid || 'demo-session'}] skipping inbound batch due to cooldown`);
        return;
    }

    const utteranceMs = getUtteranceDurationMs(state);
    const silenceMs = Date.now() - state.lastInboundAt;

    if (utteranceMs >= UTTERANCE_MAX_MS) {
        void finalizeCurrentUtterance(state, 'max_duration');
        return;
    }

    if (silenceMs < END_OF_SPEECH_MS) {
        return;
    }

    if (utteranceMs < MIN_UTTERANCE_MS) {
        logger.log(`[stt] dropped short utterance uuid=${state.uuid || 'pending'} utteranceMs=${utteranceMs}`);
        clearCurrentUtterance(state);
        return;
    }

    void finalizeCurrentUtterance(state, 'end_of_speech');
}

function hasSpeechEnergy(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length < 2) {
        return false;
    }

    let sumAbs = 0;
    let samples = 0;

    for (let offset = 0; offset + 1 < chunk.length; offset += 2) {
        sumAbs += Math.abs(chunk.readInt16LE(offset));
        samples += 1;
    }

    if (samples === 0) {
        return false;
    }

    return (sumAbs / samples) >= SPEECH_CHUNK_AVG_ABS_THRESHOLD;
}

async function callBotEngine(transcript, sessionId, callerNumber, usageEvents = []) {
    logger.log(`[${sessionId}] calling bot-engine at ${BOT_ENGINE_URL}`);

    const response = await fetch(BOT_ENGINE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            transcript,
            sessionId,
            callerNumber,
            usageEvents
        })
    });

    if (!response.ok) {
        throw new Error(`bot-engine returned ${response.status}`);
    }

    const payload = await response.json();
    logger.log(`[${sessionId}] bot-engine response received`);
    return payload;
}

async function recordUsageLedger(sessionId, usageEvents) {
    if (!Array.isArray(usageEvents) || usageEvents.length === 0) {
        return;
    }

    try {
        await fetch('http://localhost:4004/usage-ledger', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                usageEvents
            })
        });
    } catch (error) {
        logger.error(`[${sessionId}] usage ledger update failed: ${error.message}`);
    }
}

async function endBotSession(sessionId, reason) {
    if (!sessionId) {
        return;
    }

    try {
        const response = await fetch(`${BOT_ENGINE_BASE_URL}/end-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                reason
            })
        });

        if (!response.ok && response.status !== 404) {
            logger.error(`[${sessionId}] end-session failed status=${response.status}`);
        }
    } catch (error) {
        logger.error(`[${sessionId}] end-session failed: ${error.message}`);
    }
}

async function mockTTS(text) {
    const safeText = String(text || '').trim() || 'No reply generated';
    const framesPerCharacter = 3;
    const frameCount = Math.max(30, safeText.length * framesPerCharacter);
    const buffer = Buffer.alloc(frameCount * MAX_CHUNK_SIZE);

    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = safeText.charCodeAt(i % safeText.length) & 0xff;
    }

    return buffer;
}

async function generateReplyTtsAudio(state, replyText) {
    const safeReplyText = String(replyText || '').trim() || 'No reply generated';

    logger.log('[reply-tts] request start', {
        uuid: state.uuid || 'pending',
        textLength: safeReplyText.length
    });

    try {
        const audioBuffer = await greetingService.generateGreetingAudio({
            ...greetingConfig,
            ...(state.aiConfig?.ttsProviders || {}),
            greetingText: safeReplyText
        });

        logger.log(`[reply-tts] success bytes=${audioBuffer.length}`);
        return audioBuffer;
    } catch (error) {
        logger.error(`[reply-tts] fallback to mockTTS reason=${error.message}`);
        return mockTTS(safeReplyText);
    }
}

async function playConfiguredGreeting(state) {
    if (state.welcomePlayed) {
        return;
    }

    state.welcomePlayed = true;

    logger.log('[greeting] selecting greeting path', {
        uuid: state.uuid || 'pending',
        enableDynamicGreeting: greetingConfig.enableDynamicGreeting,
        playWelcomeFile: PLAY_WELCOME_FILE,
        provider: greetingConfig.greetingTtsProvider
    });

    if (greetingConfig.enableDynamicGreeting) {
        setTurnState(state, 'SPEAKING', 'greeting-dynamic');
        state.speakingSource = 'greeting';
        state.playingFile = true;

        try {
            const audioBuffer = await greetingService.generateGreetingAudio({
                ...greetingConfig,
                ...(state.aiConfig?.ttsProviders || {}),
                greetingText: state.aiConfig?.greetingMessage || greetingConfig.greetingText
            });
            const ttsConfig = state.aiConfig?.ttsProviders || {};
            state.pendingUsageEvents.push({
                service: 'tts',
                provider: ttsConfig.primaryProvider || greetingConfig.greetingTtsProvider || 'mock',
                model: ttsConfig.model || greetingConfig.sarvamTtsModel || 'mock',
                text: state.aiConfig?.greetingMessage || greetingConfig.greetingText,
                quantity: String(state.aiConfig?.greetingMessage || greetingConfig.greetingText).length
            });
            enqueueOutbound(state, audioBuffer);
            logger.log('[greeting] dynamic greeting enqueued', {
                uuid: state.uuid || 'pending',
                bytes: audioBuffer.length,
                provider: greetingConfig.greetingTtsProvider
            });
            return;
        } catch (error) {
            logger.error('[greeting] dynamic greeting failed, falling back to static welcome file', {
                uuid: state.uuid || 'pending',
                error: error.message
            });
        } finally {
            state.playingFile = false;
        }
    }

    if (PLAY_WELCOME_FILE) {
        setTurnState(state, 'SPEAKING', 'greeting-static');
        state.speakingSource = 'greeting';
        await playFile(state, WELCOME_FILE);
        return;
    }

    setTurnState(state, 'LISTENING', 'greeting-skipped');
    logger.log('[greeting] greeting playback skipped', {
        uuid: state.uuid || 'pending',
        reason: greetingConfig.enableDynamicGreeting ? 'dynamic_failed_and_static_disabled' : 'static_disabled'
    });
}

/* =====================
   OUTBOUND TIMER SENDER
===================== */

function startAudioSender(state) {
    if (state.sendTimer) return;

    logger.log(`startAudioSender started uuid=${state.uuid || 'pending'} interval=${INTERVAL_MS}ms`);
    state.sendTimer = setInterval(() => {
        sendOutboundTick(state);
    }, INTERVAL_MS);
}

function sendOutboundTick(state) {
    if (state.paused || state.ws.readyState !== WebSocket.OPEN) return;
    if (state.outboundAudioData.length === 0) return;

    const availableFrames = Math.min(state.outboundAudioData.length, state.outboundSize);
    const batch = state.outboundAudioData.splice(0, availableFrames);

    while (batch.length < state.outboundSize) {
        batch.push(Buffer.alloc(MAX_CHUNK_SIZE));
    }

    const frame = Buffer.concat(batch);

    state.SEND_CHUNK++;
    state.wsSendTs = Date.now();
    logger.log(`sendOutboundTick sending uuid=${state.uuid || 'pending'} sendChunk=${state.SEND_CHUNK} recvChunk=${state.RECV_CHUNK} frames=${availableFrames} bytes=${frame.length} expectedBytesPerTick=${MAX_CHUNK_SIZE * state.outboundSize}`);
    state.ws.send(frame, { binary: true });

    if (state.turnState === 'SPEAKING' && state.outboundAudioData.length === 0) {
        const finishReason = state.speakingSource === 'greeting' ? 'greeting-finished' : 'reply-finished';
        setTurnState(state, 'LISTENING', finishReason);
        clearCurrentUtterance(state);
        state.speakingSource = '';

        if (state.transferPending && !state.transferSent && state.ws.readyState === WebSocket.OPEN) {
            sendTransferControl(state, 'reply-finished');
            return;
        }

        if (state.transferPending) {
            return;
        }

        if (state.demoCompleted && !state.hangupSent && state.ws.readyState === WebSocket.OPEN) {
            state.hangupSent = true;
            logger.log(`[${state.uuid || 'pending'}] sending hangup after final reply`);
            state.ws.send(JSON.stringify({ type: 'hangup', uuid: state.uuid || 'pending' }));
        }
    }
}

function sendTransferControl(state, reason) {
    if (state.transferSent || state.ws.readyState !== WebSocket.OPEN) {
        return;
    }

    state.transferSent = true;
    const transferPayload = buildTransferControlPayload(state);
    logger.log(`[${state.uuid || 'pending'}] sending transfer reason=${reason} payload=${JSON.stringify(transferPayload)}`);
    state.ws.send(JSON.stringify(transferPayload));
}

function buildTransferControlPayload(state) {
    const dialNumber = state.transferNumber || normalizeTransferDialNumber(state.aiConfig?.transferNumber || '');

    return {
        type: TRANSFER_CONTROL_TYPE,
        intent: 'user request to transfer',
        connectto: normalizeTransferConnectTo(TRANSFER_CONNECT_TO),
        connectno: dialNumber
    };
}

function normalizeTransferConnectTo(value) {
    return String(value || '').trim().split(/\s+/)[0].toLowerCase();
}

function normalizeTransferDialNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');

    if (digits.length === 10) {
        return digits;
    }

    if (digits.length === 12 && digits.startsWith('91')) {
        return digits.slice(2);
    }

    if (digits.length === 11 && digits.startsWith('0')) {
        return digits.slice(1);
    }

    if (digits.length === 13 && digits.startsWith('091')) {
        return digits.slice(3);
    }

    logger.warn(`[transfer] unexpected number format digits=${digits} length=${digits.length}`);
    return digits;
}

/* =====================
   OUTBOUND ENQUEUE
===================== */

function enqueueOutbound(state, buffer) {
    const total = buffer.length;

    for (let offset = 0; offset < total; offset += MAX_CHUNK_SIZE) {
        const remaining = total - offset;

        let frame;

        if (remaining >= MAX_CHUNK_SIZE) {
            frame = buffer.slice(offset, offset + MAX_CHUNK_SIZE);
        } else {
            frame = Buffer.allocUnsafe(MAX_CHUNK_SIZE);
            buffer.copy(frame, 0, offset);
            frame.fill(0x00, remaining);
        }

        if (state.outboundAudioData.length >= state.maxAudioDataLen) {
            logger.error('outboundAudioData overflow at '+state.SEND_CHUNK + '/'+ state.RECV_CHUNK + ' ' + state.outboundAudioData.length);
            state.outboundAudioData.shift();
        }
        state.outboundAudioData.push(frame);
    }
}

/* =====================
   PLAY WELCOME FILE
===================== */

async function playFile(state, filepath) {
    if (state.playingFile) return;
    state.playingFile = true;
    logger.log(`playFile starting uuid=${state.uuid || 'pending'} path=${filepath}`);

    try {
        const stream = fs.createReadStream(filepath, {
            highWaterMark: MAX_CHUNK_SIZE
        });

        for await (const chunk of stream) {
            logger.log(`playFile enqueue chunk uuid=${state.uuid || 'pending'} bytes=${chunk.length}`);
            enqueueOutbound(state, chunk);
        }
    } catch (err) {
        logger.error('Failed to play file:', err.message);
    }
    state.playingFile = false;
}

async function finalizeCurrentUtterance(state, reason) {
    if (state.turnState !== 'LISTENING' || state.currentUtteranceChunks.length === 0) {
        return;
    }

    const inboundBatch = state.currentUtteranceChunks.splice(0, state.currentUtteranceChunks.length);
    const scriptedTranscript = DEMO_CALLER_UTTERANCES[state.demoTurnIndex] || '';
    const utteranceMs = getUtteranceDurationMsFromChunks(inboundBatch);

    clearCurrentUtterance(state);
    state.isProcessing = true;
    setTurnState(state, 'PROCESSING', reason);

    logger.log(`[${state.uuid || 'demo-session'}] inbound batch captured: ${inboundBatch.length} chunks`);
    logger.log(`[turn] utterance captured uuid=${state.uuid || 'pending'} ms=${utteranceMs}`);

    try {
        const effectiveSttProvider = String(state.aiConfig?.sttProviders?.primaryProvider || greetingConfig.sttProvider).toLowerCase();

        if (effectiveSttProvider === 'mock' && !scriptedTranscript) {
            state.demoCompleted = true;
            logger.log(`[${state.uuid || 'demo-session'}] demo script completed, no further mock STT turns will be sent`);
            setTurnState(state, 'LISTENING', 'demo-script-complete');
            return;
        }

        const rawTranscript = await sttService.transcribeInboundAudio({
            uuid: state.uuid || 'pending',
            audioChunks: inboundBatch,
            fallbackTranscript: scriptedTranscript,
            utteranceMs,
            config: state.aiConfig?.sttProviders || {}
        });

        const transcript = selectTranscript(rawTranscript, scriptedTranscript, state);
        logger.log(`[stt][final] uuid=${state.uuid || 'pending'} transcript="${transcript}"`);
        logger.log(`[stt] transcript=${transcript}`);

        const sttConfig = state.aiConfig?.sttProviders || {};
        const usageEvents = [
            ...state.pendingUsageEvents.splice(0, state.pendingUsageEvents.length),
            {
                service: 'stt',
                provider: sttConfig.primaryProvider || greetingConfig.sttProvider || 'mock',
                model: sttConfig.model || greetingConfig.sarvamSttModel || 'mock',
                durationMs: utteranceMs
            }
        ];
        const botResponse = await callBotEngine(transcript, state.uuid || 'demo-session', state.callerNumber || 'unknown', usageEvents);
        let replyText = botResponse?.data?.reply || 'I am sorry, I could not process your request right now.';
        logger.log(`[${state.uuid || 'demo-session'}] bot state stage=${botResponse?.data?.stage || 'unknown'} action=${botResponse?.data?.action || 'unknown'} intent=${botResponse?.data?.intent || 'unknown'}`);
        const botAction = botResponse?.data?.action || '';
        const botIntent = botResponse?.data?.intent || '';
        const botCallStatus = botResponse?.data?.session?.callStatus;
        const shouldTransferCall = botAction === 'transfer_call' || botAction === 'fallback_transfer' || botIntent === 'human_escalation' || botCallStatus === 'transferred';

        if (shouldTransferCall) {
            state.transferPending = true;
            const rawTransferNumber = state.aiConfig?.transferNumber || extractTransferNumber(replyText) || '';
            state.transferNumber = normalizeTransferDialNumber(rawTransferNumber);
            replyText = TRANSFER_CONFIRMATION_MESSAGE;
            logger.log(`[${state.uuid || 'demo-session'}] transfer queued number=${state.transferNumber || 'unknown'}`);
            sendTransferControl(state, 'transfer-intent');
            if (state.ws.readyState !== WebSocket.OPEN) {
                return;
            }
        }

        logger.log(`[${state.uuid || 'demo-session'}] bot reply: ${replyText}`);

        const audioBuffer = await generateReplyTtsAudio(state, replyText);
        if (state.ws.readyState !== WebSocket.OPEN || state.cleanupNotified) {
            logger.log(`[${state.uuid || 'demo-session'}] skipping reply audio enqueue because websocket is closed`);
            return;
        }

        logger.log(`[${state.uuid || 'demo-session'}] reply TTS buffer generated: ${audioBuffer.length} bytes`);
        const ttsConfig = state.aiConfig?.ttsProviders || {};
        void recordUsageLedger(state.uuid || 'demo-session', [
            {
                service: 'tts',
                provider: ttsConfig.primaryProvider || greetingConfig.greetingTtsProvider || 'mock',
                model: ttsConfig.model || greetingConfig.sarvamTtsModel || 'mock',
                text: replyText,
                quantity: replyText.length
            }
        ]);

        setTurnState(state, 'SPEAKING', 'reply-tts');
        state.speakingSource = 'reply';
        enqueueOutbound(state, audioBuffer);
        state.processedUtterances += 1;
        state.demoTurnIndex += 1;
        state.lastProcessedAt = Date.now();

        if (
            botResponse?.data?.stage === 'booked' ||
            botResponse?.data?.stage === 'cancelled' ||
            botResponse?.data?.stage === 'rescheduled' ||
            botCallStatus === 'completed' ||
            botCallStatus === 'cancelled' ||
            botCallStatus === 'transferred'
        ) {
            state.demoCompleted = true;
        }

        logger.log(`[${state.uuid || 'demo-session'}] outbound audio enqueued, processedUtterances=${state.processedUtterances}`);
    } catch (error) {
        logger.error(`[${state.uuid || 'demo-session'}] receiveInboundTick failed`, error);
        setTurnState(state, 'LISTENING', 'processing-error');
    } finally {
        state.isProcessing = false;
        logger.log(`[${state.uuid || 'demo-session'}] processing complete`);
    }
}

function getUtteranceDurationMs(state) {
    return getUtteranceDurationMsFromChunks(state.currentUtteranceChunks);
}

function getUtteranceDurationMsFromChunks(chunks) {
    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    return Math.round((totalBytes / 16000) * 1000);
}

function clearCurrentUtterance(state) {
    state.currentUtteranceChunks.length = 0;
    state.speechStartedAt = 0;
    state.lastInboundAt = 0;
}

function setTurnState(state, nextState, reason) {
    const previousState = state.turnState;

    if (previousState === nextState) {
        return;
    }

    logger.log(`[turn] uuid=${state.uuid || 'pending'} ${previousState} -> ${nextState} reason=${reason}`);
    state.turnState = nextState;

    if (previousState === 'SPEAKING' && state.droppedInboundChunks > 0) {
        logger.log(`[inbound] dropped chunk count during SPEAKING uuid=${state.uuid || 'pending'} count=${state.droppedInboundChunks}`);
        state.droppedInboundChunks = 0;
    }
}

function selectTranscript(rawTranscript, fallbackTranscript, state) {
    const normalizedTranscript = normalizeTranscript(rawTranscript);

    if (isUsableTranscript(normalizedTranscript)) {
        return normalizedTranscript;
    }

    const safeFallback = normalizeTranscript(fallbackTranscript);

    if (safeFallback) {
        logger.error(`[stt] fallback triggered provider=${greetingConfig.sttProvider} reason=unusable_transcript uuid=${state.uuid || 'pending'}`);
        return safeFallback;
    }

    return normalizedTranscript;
}

function normalizeTranscript(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractTransferNumber(text) {
    const match = String(text || '').match(/(?:\+?\d[\d\s().-]{7,}\d)/);
    return match ? match[0].replace(/\s+/g, '') : '';
}

function isUsableTranscript(text) {
    const normalized = normalizeTranscript(text);

    if (!normalized) {
        return false;
    }

    if (normalized.length < 3) {
        return false;
    }

    const words = normalized.toLowerCase().split(' ').filter(Boolean);

    if (words.length >= 3 && new Set(words).size === 1) {
        return false;
    }

    if (words.length === 1 && /^(.)\1{2,}$/.test(words[0])) {
        return false;
    }

    return true;
}


/* =====================
   _CLEANUP
===================== */

function _cleanup(state, reason) {
    logger.log(`Cleanup ${state.uuid} (${reason})`);
    if (state.uuid && !state.cleanupNotified) {
        state.cleanupNotified = true;
        void endBotSession(state.uuid, reason);
    }
    activeSessions.delete(state);
    if (state.sendTimer) {
        clearInterval(state.sendTimer);
        state.sendTimer = null;
    }
    if (state.recvTimer) {
        clearInterval(state.recvTimer);
        state.recvTimer = null;
    }

    state.firstAudioSeen = false;
    state.inboundAudioData.length = 0;
    state.outboundAudioData.length = 0;
    clearCurrentUtterance(state);
    state.speakingSource = '';
}

function setupProcessSignalsWS(wss, activeSessions) {
    const shutdown = (signal) => {
        console.log(`\n[${signal}] Graceful shutdown (ws_audio_server)`);

        try {
            wss.close(() => {
                console.log('WS server closed');
            });
        } catch {}

        for (const state of activeSessions) {
            try {
                if (state.ws.readyState === WebSocket.OPEN) {
                    state.ws.send(JSON.stringify({ type: 'hangup' }));
                }
            } catch {}

            try {
                _cleanup(state, `signal-${signal}`);
            } catch {}
        }

        setTimeout(() => {
            process.exit(0);
        }, 500);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGTSTP', shutdown);
}
