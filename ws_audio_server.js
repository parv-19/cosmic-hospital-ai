'use strict';

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { greetingConfig } = require('./greeting-config');
const { createGreetingService } = require('./greeting-service');
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
const PLAY_WELCOME_FILE = greetingConfig.playWelcomeFile;
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
        demoTurnIndex: 0,
        demoCompleted: false,
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
            _onControl(state, data.toString());
        }
    });

    ws.on('close', () => _cleanup(state, 'ws-close'));
    ws.on('error', () => _cleanup(state, 'ws-error'));
});

/* =====================
   CONTROL PLANE
===================== */

function _onControl(state, text) {
    logger.log(`Control message received uuid=${state.uuid || 'pending'} payload=${text}`);
    let msg;
    try { msg = JSON.parse(text); } catch { return; }

    switch (msg.type) {
    case 'start':
        state.uuid = msg.uuid;
        state.callerNumber = msg.mobile || msg.caller || '';
        state.startedAt = Date.now();
        logger.info(`WS start uuid=${state.uuid}`);
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
    if (state.inboundAudioData.length >= state.maxAudioDataLen) {
        logger.error('inboundAudioData overflow at '+state.SEND_CHUNK + '/'+ state.RECV_CHUNK + ' ' + state.inboundAudioData.length);
        state.inboundAudioData.shift();
    }
    state.inboundAudioData.push(chunk);
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

    if (state.isProcessing || state.demoCompleted) {
        return;
    }

    if (state.inboundAudioData.length < MIN_INBOUND_CHUNKS) {
        return;
    }

    if (state.playingFile || state.outboundAudioData.length >= state.outboundSize) {
        logger.log(`[${state.uuid || 'demo-session'}] skipping inbound batch while outbound playback is active queue=${state.outboundAudioData.length}`);
        return;
    }

    if (Date.now() - state.lastProcessedAt < state.minProcessGapMs) {
        logger.log(`[${state.uuid || 'demo-session'}] skipping inbound batch due to cooldown`);
        return;
    }

    const scriptedTranscript = DEMO_CALLER_UTTERANCES[state.demoTurnIndex];

    if (!scriptedTranscript) {
        state.demoCompleted = true;
        logger.log(`[${state.uuid || 'demo-session'}] demo script completed, no further mock STT turns will be sent`);
        return;
    }

    state.isProcessing = true;

    (async () => {
        const inboundBatch = state.inboundAudioData.splice(0, state.inboundAudioData.length);
        logger.log(`[${state.uuid || 'demo-session'}] inbound batch captured: ${inboundBatch.length} chunks`);

        try {
            const transcript = scriptedTranscript;
            logger.log(`[${state.uuid || 'demo-session'}] mock STT transcript: ${transcript}`);

            const botResponse = await callBotEngine(transcript, state.uuid || 'demo-session', state.callerNumber || 'unknown');
            const replyText = botResponse?.data?.reply || 'I am sorry, I could not process your request right now.';
            logger.log(`[${state.uuid || 'demo-session'}] bot reply: ${replyText}`);

            const audioBuffer = await mockTTS(replyText);
            logger.log(`[${state.uuid || 'demo-session'}] mock TTS buffer generated: ${audioBuffer.length} bytes`);

            enqueueOutbound(state, audioBuffer);
            state.processedUtterances += 1;
            state.demoTurnIndex += 1;
            state.lastProcessedAt = Date.now();

            if (botResponse?.data?.stage === 'booked' || botResponse?.data?.stage === 'cancelled') {
                state.demoCompleted = true;
            }

            logger.log(`[${state.uuid || 'demo-session'}] outbound audio enqueued, processedUtterances=${state.processedUtterances}`);
        } catch (error) {
            logger.error(`[${state.uuid || 'demo-session'}] receiveInboundTick failed`, error);
        } finally {
            state.isProcessing = false;
            logger.log(`[${state.uuid || 'demo-session'}] processing complete`);
        }
    })();
}

async function callBotEngine(transcript, sessionId, callerNumber) {
    logger.log(`[${sessionId}] calling bot-engine at ${BOT_ENGINE_URL}`);

    const response = await fetch(BOT_ENGINE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            transcript,
            sessionId,
            callerNumber
        })
    });

    if (!response.ok) {
        throw new Error(`bot-engine returned ${response.status}`);
    }

    const payload = await response.json();
    logger.log(`[${sessionId}] bot-engine response received`);
    return payload;
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
        state.playingFile = true;

        try {
            const audioBuffer = await greetingService.generateGreetingAudio(greetingConfig);
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
        await playFile(state, WELCOME_FILE);
        return;
    }

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

    if (state.outboundAudioData.length >= state.outboundSize) {
        const batch = state.outboundAudioData.splice(0, state.outboundSize);
        const frame = Buffer.concat(batch);

        state.SEND_CHUNK++;
        state.wsSendTs = Date.now();
        logger.log(`sendOutboundTick sending uuid=${state.uuid || 'pending'} sendChunk=${state.SEND_CHUNK} recvChunk=${state.RECV_CHUNK} frames=${batch.length} bytes=${frame.length} expectedBytesPerTick=${MAX_CHUNK_SIZE * state.outboundSize}`);
        state.ws.send(frame, { binary: true });
    }
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


/* =====================
   _CLEANUP
===================== */

function _cleanup(state, reason) {
    logger.log(`Cleanup ${state.uuid} (${reason})`);
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
