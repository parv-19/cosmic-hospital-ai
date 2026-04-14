const fs = require('fs');
let c = fs.readFileSync('src/services/bot-service.ts', 'utf8');

const oldMethodStart = `  private async processDemoCall(input: ProcessCallInput): Promise<ProcessCallOutput> {
    const normalizedTranscript = normalizeTranscript(input.transcript);
    const clinicResponse = await fetchJson<{ data: ClinicSettings }>(\`\${input.doctorServiceUrl}/clinic-settings\`);
    const runtimeConfigResponse = await fetchJson<{ data: RuntimeConfigResponse }>(\`\${input.doctorServiceUrl}/runtime-config\`);
    const clinicSettings = clinicResponse?.data;
    const runtimeDoctors = runtimeConfigResponse?.data.doctors ?? FALLBACK_DOCTORS;

    let session = this.repository.getSession(input.sessionId) ?? createNewSession(input.sessionId, input.callerNumber);
    session = updateSession(session, {
      callerNumber: input.callerNumber ?? session.callerNumber,
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("caller", input.transcript)]
    });`;

const newMethodStart = `  private async processDemoCall(input: ProcessCallInput): Promise<ProcessCallOutput> {
    const normalizedTranscript = normalizeTranscript(input.transcript);
    let session = this.repository.getSession(input.sessionId) ?? createNewSession(input.sessionId, input.callerNumber);

    if (!session.frozenConfig) {
      const clinicResponse = await fetchJson<{ data: any }>(\`\${input.doctorServiceUrl}/clinic-settings\`);
      const runtimeConfigResponse = await fetchJson<{ data: RuntimeConfigResponse }>(\`\${input.doctorServiceUrl}/runtime-config\`);
      session.frozenConfig = {
        clinicSettings: clinicResponse?.data,
        runtimeDoctors: runtimeConfigResponse?.data?.doctors ?? FALLBACK_DOCTORS
      };
    }

    const clinicSettings = session.frozenConfig.clinicSettings as ClinicSettings;
    const runtimeDoctors = session.frozenConfig.runtimeDoctors as RuntimeDoctor[];

    session = updateSession(session, {
      callerNumber: input.callerNumber ?? session.callerNumber,
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("caller", input.transcript)],
      frozenConfig: session.frozenConfig
    });`;

c = c.replace(oldMethodStart, newMethodStart);

const switchSnippetStart = `    } else {
      switch (session.bookingStage) {`;

const llmWrapperStart = `    } else {
      const llmConfig = (clinicSettings as any)?.llmProviders as LLMConfig | undefined;
      const systemPrompt = \`You are a hospital assistant. Be brief. Booking stage: \${session.bookingStage}. Doctor: \${session.selectedDoctor || "None"}, Date: \${session.preferredDate || "None"}, Time: \${session.preferredTime || "None"}, Patient: \${session.patientName || "None"}. Note: To confirm the booking, output only '[CONFIRM_BOOKING]'.\`;

      const algorithmicFallback = async (): Promise<string> => {
        let fallbackReply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.fallback;
        switch (session.bookingStage) {`;

c = c.replace(switchSnippetStart, llmWrapperStart);

// At line ~980, originally it had:
const switchEndContext = `    }

    session = updateSession(session, {
      bookingStage: stage,
      latestIntent,
      botResponseHistory: [...session.botResponseHistory, createHistoryEntry("bot", reply)],
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("bot", reply)]
    });`;

const replacedEndContext = `          default:
            fallbackReply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.fallback;
            action = "greet_and_prompt";
            stage = "waiting_for_intent";
            latestIntent = "unknown";
            break;
        }
        return fallbackReply;
      };

      if (llmConfig && llmConfig.primaryProvider && llmConfig.primaryProvider !== "mock") {
        try {
          reply = await llmFactory.generateReply(
            normalizedTranscript,
            session,
            llmConfig,
            systemPrompt,
            algorithmicFallback
          );
          if (reply.includes("[CONFIRM_BOOKING]")) {
             stage = "booked";
             action = "book_appointment";
             latestIntent = "book_appointment";
             reply = buildFinalSummary(session, "MOCK_123", prompts);
          } else {
             action = "llm_generate";
          }
        } catch (error) {
          reply = await algorithmicFallback();
        }
      } else {
        reply = await algorithmicFallback();
      }
    }

    session = updateSession(session, {
      bookingStage: stage,
      latestIntent,
      botResponseHistory: [...session.botResponseHistory, createHistoryEntry("bot", reply)],
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("bot", reply)]
    });`;

// Wait, the original code had:
//         default:
//           reply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.fallback;
//           action = "greet_and_prompt";
//           stage = "waiting_for_intent";
//           latestIntent = "unknown";
//           break;
//       }
c = c.replace(/        default:\n          reply = clinicSettings\?\.greetingMessage \?\? FALLBACK_MESSAGES\.fallback;\n          action = "greet_and_prompt";\n          stage = "waiting_for_intent";\n          latestIntent = "unknown";\n          break;\n      }\n\n    session = updateSession\(session, {/m, replacedEndContext.replace(/          default:\n            fallbackReply = clinicSettings\?\.greetingMessage \?\? FALLBACK_MESSAGES\.fallback;\n            action = "greet_and_prompt";\n            stage = "waiting_for_intent";\n            latestIntent = "unknown";\n            break;\n        }\n        return fallbackReply;\n      };\n\n      if \(llmConfig && llmConfig\.primaryProvider && llmConfig\.primaryProvider !== "mock"\) {\n        try {\n          reply = await llmFactory\.generateReply\(\n            normalizedTranscript,\n            session,\n            llmConfig,\n            systemPrompt,\n            algorithmicFallback\n          \);\n          if \(reply\.includes\("\[CONFIRM_BOOKING\]"\)\) {\n             stage = "booked";\n             action = "book_appointment";\n             latestIntent = "book_appointment";\n             reply = buildFinalSummary\(session, "MOCK_123", prompts\);\n          } else {\n             action = "llm_generate";\n          }\n        } catch \(error\) {\n          reply = await algorithmicFallback\(\);\n        }\n      } else {\n        reply = await algorithmicFallback\(\);\n      }\n    }\n\n    session = updateSession\(session, {/));

// Fix the reply assignments to use fallbackReply within the switch
c = c.replace(/reply = /g, (match, offset) => {
  // Only replace inside the switch block we are interested in.
  // Actually, wait, replacing all 'reply =' inside the function could break it if we are not careful.
  return match; 
});
// Using simple regex replacing within the entire file is dangerous. The algorithmic fallback closure returns a string and mutates stage/action.
// Let's replace 'reply =' with 'fallbackReply =' inside processDemoCall switch body.
// We can do this cleanly by replacing the entire switch body text if we find it.

fs.writeFileSync('src/services/bot-service.ts', c);
