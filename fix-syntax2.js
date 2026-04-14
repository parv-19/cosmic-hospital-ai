const fs = require('fs');

function fixSyntax(file) {
  let content = fs.readFileSync(file, 'utf8');
  const badString = "\\`: \\${errorBody.slice(0, 200)}\\`";
  const goodString = "`: ${errorBody.slice(0, 200)}`";
  content = content.split(badString).join(goodString);
  fs.writeFileSync(file, content);
}

fixSyntax('stt-service.js');
fixSyntax('greeting-service.js');
console.log('Fixed syntax strings');
