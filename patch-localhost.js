const fs = require('fs');
let c = fs.readFileSync('ws_audio_server.js', 'utf8');
c = c.replace(/http:\/\/localhost:4001\/clinic-settings/, 'http://127.0.0.1:4001/clinic-settings');
fs.writeFileSync('ws_audio_server.js', c);
