const fs = require('fs');
let c = fs.readFileSync('src/services/bot-service.ts', 'utf8');

c = c.replace(
  /  private async processDemoCall\(input: ProcessCallInput\): Promise<ProcessCallOutput> \{\n    const normalizedTranscript = normalizeTranscript\(input\.transcript\);\n    const clinicResponse = await fetchJson<\S+>\(.*?\);\n    const runtimeConfigResponse = await fetchJson<\S+>\(.*?\);\n    const clinicSettings = clinicResponse\?\.data;\n    const runtimeDoctors = runtimeConfigResponse\?\.data\.doctors \?\? FALLBACK_DOCTORS;\n\n    let session = this\.repository\.getSession\(input\.sessionId\) \?\? createNewSession\(input\.sessionId, input\.callerNumber\);\n    session = updateSession\(session, \{\n      callerNumber: input\.callerNumber \?\? session\.callerNumber,\n      transcriptHistory: \[\.\.\.session\.transcriptHistory, createHistoryEntry\("caller", input\.transcript\)]\n    }\);/ms,
`  private async processDemoCall(input: ProcessCallInput): Promise<ProcessCallOutput> {
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
    });`
);

// We find `    } else {\n      switch (session.bookingStage) {`
c = c.replace(
  /    } else {\n      switch \(session\.bookingStage\) {/,
`    } else {
      const llmConfig = (clinicSettings as any)?.llmProviders as LLMConfig | undefined;
      const systemPrompt = \`You are a hospital assistant. Current Stage: \${session.bookingStage}. Status - Doctor: \${session.selectedDoctor || "None"}, Date: \${session.preferredDate || "None"}, Time: \${session.preferredTime || "None"}, Name: \${session.patientName || "None"}. If booking is finalized, reply strictly with '[CONFIRM_BOOKING]'.\`;

      const algorithmicFallback = async () => {
        switch (session.bookingStage) {`
);

c = c.replace(
  /        default:\n          reply = clinicSettings\?\.greetingMessage \?\? FALLBACK_MESSAGES\.greeting;\n          stage = "waiting_for_intent";\n          action = "reset_to_greeting";\n      }\n    }\n\n    session = updateSession\(session, {/,
`        default:
          reply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.greeting;
          stage = "waiting_for_intent";
          action = "reset_to_greeting";
      }
      return reply;
    };

    if (llmConfig && llmConfig.primaryProvider && llmConfig.primaryProvider !== "mock") {
      try {
        const aiReply = await llmFactory.generateReply(
          normalizedTranscript,
          session,
          llmConfig,
          systemPrompt,
          algorithmicFallback
        );
        if (aiReply.includes("[CONFIRM_BOOKING]")) {
           stage = "booked";
           action = "book_appointment";
           latestIntent = "book_appointment";
           reply = buildFinalSummary(session, "MOCK_123", prompts);
        } else {
           reply = aiReply;
           action = "llm_generate";
        }
      } catch (error) {
        reply = await algorithmicFallback();
      }
    } else {
      reply = await algorithmicFallback();
    }
  }

  session = updateSession(session, {`
);

fs.writeFileSync('src/services/bot-service.ts', c);
