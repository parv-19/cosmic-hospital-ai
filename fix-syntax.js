const fs = require('fs');

function fixSyntax(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\\`: \\\$\\{errorBody\.slice\\(0, 200\\)\\}\\`/g, "`: ${errorBody.slice(0, 200)}`");
  fs.writeFileSync(file, content);
}

fixSyntax('stt-service.js');
fixSyntax('greeting-service.js');
console.log('Fixed syntax strings');
