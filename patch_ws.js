const fs = require('fs');
let c = fs.readFileSync('ws_audio_server.js', 'utf8');

c = c.replace(
  /function _onControl\(state, text\) \{\n    logger\.log\(`Control message received uuid=\$\{state\.uuid \|\| 'pending'\} payload=\$\{text\}`\);\n    let msg;\n    try \{ msg = JSON\.parse\(text\); \} catch \{ return; \}\n\n    switch \(msg\.type\) \{\n    case 'start':\n        state\.uuid = msg\.uuid;\n        state\.callerNumber = msg\.mobile \|\| msg\.caller \|\| '';\n        state\.startedAt = Date\.now\(\);\n        logger\.info\(`WS start uuid=\$\{state\.uuid\}`\);\n        break;/s,
`async function _onControl(state, text) {
    logger.log(\`Control message received uuid=\${state.uuid || 'pending'} payload=\${text}\`);
    let msg;
    try { msg = JSON.parse(text); } catch { return; }

    switch (msg.type) {
    case 'start':
        state.uuid = msg.uuid;
        state.callerNumber = msg.mobile || msg.caller || '';
        state.startedAt = Date.now();
        logger.info(\`WS start uuid=\${state.uuid}\`);
        
        try {
            const resp = await fetch('http://localhost:4001/clinic-settings');
            if (resp.ok) {
                const payload = await resp.json();
                state.aiConfig = payload.data || {};
            } else {
                state.aiConfig = {};
            }
        } catch (e) {
            logger.error(\`Failed to fetch clinic-settings for \${state.uuid}: \${e.message}\`);
            state.aiConfig = {};
        }
        break;`
);

// We need to use `!isBinary` with await since it is now async
c = c.replace(/_onControl\(state, data\.toString\(\)\);/g, 'void _onControl(state, data.toString());');

c = c.replace(
  /        const rawTranscript = await sttService\.transcribeInboundAudio\(\{\n            uuid: state\.uuid \|\| 'pending',\n            audioChunks: inboundBatch,\n            fallbackTranscript: scriptedTranscript,\n            utteranceMs,\n            config: greetingConfig\n        \}\);/s,
`        const rawTranscript = await sttService.transcribeInboundAudio({
            uuid: state.uuid || 'pending',
            audioChunks: inboundBatch,
            fallbackTranscript: scriptedTranscript,
            utteranceMs,
            config: state.aiConfig?.sttProviders || {}
        });`
);

c = c.replace(
  /        const audioBuffer = await greetingService\.generateGreetingAudio\(\{\n            \.\.\.greetingConfig,\n            greetingText: safeReplyText,\n            greetingTtsProvider: 'sarvam'\n        \}\);/s,
`        const audioBuffer = await greetingService.generateGreetingAudio({
            ...greetingConfig,
            ...(state.aiConfig?.ttsProviders || {}),
            greetingText: safeReplyText
        });`
);

c = c.replace(
  /            const audioBuffer = await greetingService\.generateGreetingAudio\(greetingConfig\);/s,
`            const audioBuffer = await greetingService.generateGreetingAudio({
                ...greetingConfig,
                ...(state.aiConfig?.ttsProviders || {}),
                greetingText: state.aiConfig?.greetingMessage || greetingConfig.greetingText
            });`
);

fs.writeFileSync('ws_audio_server.js', c);
