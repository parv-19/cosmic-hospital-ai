const fs = require('fs');
let c = fs.readFileSync('src/services/bot-service.ts','utf8');
c = c.replace(
  'import { CallLogModel, DoctorModel } from "@ai-hospital/shared-db";', 
  'import { CallLogModel, DoctorModel } from "@ai-hospital/shared-db";\nimport { llmFactory, type LLMConfig } from "./provider-factory";'
);
fs.writeFileSync('src/services/bot-service.ts', c);
