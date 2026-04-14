const fs = require('fs');
let c = fs.readFileSync('src/services/bot-service.ts','utf8');
c = c.replace(
  'import { llmFactory, type LLMConfig } from "./provider-factory";\r\nimport { llmFactory, type LLMConfig } from "./provider-factory";',
  'import { llmFactory, type LLMConfig } from "./provider-factory";'
);
c = c.replace(
  'import { llmFactory, type LLMConfig } from "./provider-factory";\nimport { llmFactory, type LLMConfig } from "./provider-factory";',
  'import { llmFactory, type LLMConfig } from "./provider-factory";'
);
fs.writeFileSync('src/services/bot-service.ts',c);
