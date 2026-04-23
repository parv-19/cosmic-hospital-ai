export type InferenceResult = {
  condition: string;
  specialization: string;
  doctorSuggestion?: string;
  isEmergency: boolean;
  confidence: number;
  matchedSymptoms: string[];
  reply: string;
};

type SymptomKey =
  | "chest_pain"
  | "arm_swelling"
  | "arm_pain"
  | "breathlessness"
  | "sweating"
  | "face_drooping"
  | "speech_problem"
  | "weakness_one_side"
  | "stomach_pain"
  | "lower_right_abdominal_pain"
  | "vomiting"
  | "fever"
  | "high_sugar"
  | "confusion"
  | "fainting"
  | "wheezing"
  | "cough"
  | "back_pain"
  | "burning_urination"
  | "frequent_urination"
  | "headache"
  | "light_sensitivity"
  | "body_pain"
  | "rash"
  | "anxiety"
  | "palpitations"
  | "dizziness";

type ConditionRule = {
  condition: string;
  specialization: string;
  doctorSuggestion?: string;
  isEmergency: boolean;
  requiredClusters: SymptomKey[][];
  reply: string;
};

const SYMPTOM_SYNONYMS: Record<SymptomKey, string[]> = {
  chest_pain: [
    "chest pain",
    "chest tightness",
    "seene mein dard",
    "seene me dard",
    "sine me dard",
    "chhati me dard",
    "chest ma dard",
    "छाती में दर्द",
    "सीने में दर्द",
    "છાતીમાં દુખાવો",
    "છાતી માં દુખાવો"
  ],
  arm_swelling: [
    "arm swelling",
    "hand swelling",
    "swelling in arm",
    "haath mein sujan",
    "haath me sujan",
    "hath me sujan",
    "हाथ में सूजन",
    "હાથમાં સોજો",
    "હાથ માં સોજો"
  ],
  arm_pain: [
    "arm pain",
    "left arm pain",
    "haath mein dard",
    "haath me dard",
    "hath me dard",
    "बाएं हाथ में दर्द",
    "हाथ में दर्द",
    "હાથમાં દુખાવો"
  ],
  breathlessness: [
    "shortness of breath",
    "breathlessness",
    "difficulty breathing",
    "saans phool rahi",
    "saans lene mein dikkat",
    "saans me dikkat",
    "सांस लेने में दिक्कत",
    "શ્વાસ લેવામાં તકલીફ",
    "શ્વાસ ચઢે છે"
  ],
  sweating: [
    "sweating",
    "cold sweat",
    "pasina",
    "paseena",
    "पसीना",
    "પરસેવો"
  ],
  face_drooping: [
    "face drooping",
    "face tilted",
    "munh tedha",
    "muh tedha",
    "चेहरा टेढ़ा",
    "મોઢું વાંકું"
  ],
  speech_problem: [
    "speech problem",
    "slurred speech",
    "cannot speak",
    "bolne mein dikkat",
    "bol nahi pa raha",
    "बोलने में दिक्कत",
    "બોલવામાં તકલીફ"
  ],
  weakness_one_side: [
    "one side weakness",
    "body one side weak",
    "ek taraf weakness",
    "aadha sharir kamzor",
    "एक तरफ कमजोरी",
    "એક બાજુ નબળાઈ"
  ],
  stomach_pain: [
    "stomach pain",
    "abdominal pain",
    "pet dard",
    "pet mein dard",
    "pait me dard",
    "पेट दर्द",
    "પેટમાં દુખાવો"
  ],
  lower_right_abdominal_pain: [
    "lower right stomach pain",
    "right lower abdomen pain",
    "right side stomach pain",
    "pet ke right side dard",
    "दाईं तरफ पेट दर्द",
    "પેટની જમણી બાજુ દુખાવો"
  ],
  vomiting: [
    "vomiting",
    "nausea",
    "ulti",
    "उल्टी",
    "ઉલટી"
  ],
  fever: [
    "fever",
    "high fever",
    "bukhar",
    "बुखार",
    "તાવ"
  ],
  high_sugar: [
    "high sugar",
    "blood sugar high",
    "diabetes sugar high",
    "sugar badh gaya",
    "शुगर बढ़ गया",
    "સુગર વધી ગઈ"
  ],
  confusion: [
    "confusion",
    "confused",
    "behoshi jaisa",
    "samajh nahi aa raha",
    "भ्रम",
    "ગૂંચવણ"
  ],
  fainting: [
    "fainting",
    "fainted",
    "behosh",
    "बेहोश",
    "બેભાન"
  ],
  wheezing: [
    "wheezing",
    "whistling breath",
    "seeti jaisi saans",
    "घरघराहट",
    "શ્વાસમાં સીટી"
  ],
  cough: [
    "cough",
    "khansi",
    "खांसी",
    "ખાંસી"
  ],
  back_pain: [
    "back pain",
    "side back pain",
    "kamar dard",
    "कमर दर्द",
    "કમર દુખે છે"
  ],
  burning_urination: [
    "burning urine",
    "burning urination",
    "urine burning",
    "peshab mein jalan",
    "पेशाब में जलन",
    "પેશાબમાં બળતરા"
  ],
  frequent_urination: [
    "frequent urination",
    "urine again and again",
    "bar bar peshab",
    "बार बार पेशाब",
    "વારંવાર પેશાબ"
  ],
  headache: [
    "headache",
    "severe headache",
    "sir dard",
    "सर दर्द",
    "માથાનો દુખાવો"
  ],
  light_sensitivity: [
    "light sensitivity",
    "light hurts",
    "roshni se takleef",
    "रोशनी से तकलीफ",
    "પ્રકાશથી તકલીફ"
  ],
  body_pain: [
    "body pain",
    "body ache",
    "sharir dard",
    "बदन दर्द",
    "શરીરમાં દુખાવો"
  ],
  rash: [
    "rash",
    "red spots",
    "skin spots",
    "daane",
    "चकत्ते",
    "ચકામા"
  ],
  anxiety: [
    "anxiety",
    "panic",
    "ghabrahat",
    "घबराहट",
    "ગભરામણ"
  ],
  palpitations: [
    "palpitations",
    "heart racing",
    "dhadkan tez",
    "दिल की धड़कन तेज",
    "ધબકારા વધી ગયા"
  ],
  dizziness: [
    "dizziness",
    "chakkar",
    "चक्कर",
    "ચક્કર"
  ]
};

const CONDITION_RULES: ConditionRule[] = [
  {
    condition: "Heart Attack",
    specialization: "Cardiology",
    doctorSuggestion: "available cardiologist",
    isEmergency: true,
    requiredClusters: [
      ["chest_pain", "breathlessness"],
      ["chest_pain", "sweating"],
      ["chest_pain", "arm_pain"]
    ],
    reply: "This can be serious. I am connecting you to emergency right away."
  },
  {
    condition: "Stroke",
    specialization: "Neurology",
    doctorSuggestion: "available neurologist",
    isEmergency: true,
    requiredClusters: [
      ["face_drooping", "speech_problem"],
      ["speech_problem", "weakness_one_side"],
      ["face_drooping", "weakness_one_side"]
    ],
    reply: "These symptoms need urgent attention. I am connecting you to emergency now."
  },
  {
    condition: "Appendicitis",
    specialization: "General Surgery",
    doctorSuggestion: "available general surgeon",
    isEmergency: true,
    requiredClusters: [
      ["lower_right_abdominal_pain", "fever"],
      ["lower_right_abdominal_pain", "vomiting"]
    ],
    reply: "This may need urgent surgical review. I am connecting you to emergency."
  },
  {
    condition: "Diabetic Emergency",
    specialization: "Endocrinology",
    doctorSuggestion: "available endocrinologist",
    isEmergency: true,
    requiredClusters: [
      ["high_sugar", "confusion"],
      ["high_sugar", "fainting"]
    ],
    reply: "This sugar-related symptom can be urgent. I am connecting you to emergency."
  },
  {
    condition: "Asthma Attack",
    specialization: "Pulmonology",
    doctorSuggestion: "available pulmonologist",
    isEmergency: true,
    requiredClusters: [
      ["breathlessness", "wheezing"],
      ["breathlessness", "cough"]
    ],
    reply: "Breathing difficulty needs quick help. I am connecting you to emergency."
  },
  {
    condition: "Kidney Stone",
    specialization: "Urology",
    doctorSuggestion: "available urologist",
    isEmergency: false,
    requiredClusters: [
      ["back_pain", "burning_urination"],
      ["back_pain", "vomiting"]
    ],
    reply: "For this, it is best to book an appointment with the available urologist. Which day should I check?"
  },
  {
    condition: "Migraine",
    specialization: "Neurology",
    doctorSuggestion: "available neurologist",
    isEmergency: false,
    requiredClusters: [
      ["headache", "light_sensitivity"],
      ["headache", "vomiting"]
    ],
    reply: "This sounds like it should be reviewed by Neurology. I can book you with the available neurologist."
  },
  {
    condition: "Dengue",
    specialization: "General Medicine",
    doctorSuggestion: "available physician",
    isEmergency: false,
    requiredClusters: [
      ["fever", "body_pain"],
      ["fever", "rash"]
    ],
    reply: "For fever with these symptoms, please see General Medicine. I can check the available physician slots."
  },
  {
    condition: "UTI",
    specialization: "Urology",
    doctorSuggestion: "available urologist",
    isEmergency: false,
    requiredClusters: [
      ["burning_urination", "frequent_urination"],
      ["burning_urination", "fever"]
    ],
    reply: "This may need a Urology consultation. I can book you with the available urologist."
  },
  {
    condition: "Panic Attack",
    specialization: "Psychiatry",
    doctorSuggestion: "available psychiatrist",
    isEmergency: false,
    requiredClusters: [
      ["anxiety", "palpitations"],
      ["anxiety", "dizziness"]
    ],
    reply: "I understand. A Psychiatry consultation can help with this. I can check the available doctor."
  }
];

const APPOINTMENT_TRIAGE_RULES: ConditionRule[] = [
  {
    condition: "Cardiac Symptoms",
    specialization: "Cardiology",
    doctorSuggestion: "available cardiologist",
    isEmergency: false,
    requiredClusters: [["chest_pain", "arm_swelling"]],
    reply: "For chest pain with swelling, please book an appointment with the available cardiologist. Which day should I check?"
  },
  {
    condition: "Stomach Pain",
    specialization: "General Medicine",
    doctorSuggestion: "available family physician",
    isEmergency: false,
    requiredClusters: [["stomach_pain"]],
    reply: "For stomach pain, General Medicine or a family physician is best. I can book the available doctor for you."
  }
];

export function inferCondition(transcript: string): InferenceResult | null {
  const normalizedTranscript = normalizeText(transcript);

  if (!normalizedTranscript) {
    return null;
  }

  const symptoms = detectSymptoms(normalizedTranscript);
  const rules = [...CONDITION_RULES, ...APPOINTMENT_TRIAGE_RULES];
  const matches = rules
    .map((rule) => scoreRule(rule, symptoms))
    .filter((result): result is InferenceResult => result !== null)
    .sort((left, right) => Number(right.isEmergency) - Number(left.isEmergency) || right.confidence - left.confidence);

  return matches[0] ?? null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSymptoms(normalizedTranscript: string): Set<SymptomKey> {
  const symptoms = new Set<SymptomKey>();

  for (const [symptom, synonyms] of Object.entries(SYMPTOM_SYNONYMS) as Array<[SymptomKey, string[]]>) {
    if (synonyms.some((synonym) => normalizedTranscript.includes(normalizeText(synonym)))) {
      symptoms.add(symptom);
    }
  }

  return symptoms;
}

function scoreRule(rule: ConditionRule, symptoms: Set<SymptomKey>): InferenceResult | null {
  const matchedCluster = rule.requiredClusters.find((cluster) => cluster.every((symptom) => symptoms.has(symptom)));

  if (!matchedCluster) {
    return null;
  }

  const matchedSymptoms = Array.from(symptoms);
  const confidence = Math.min(0.99, 0.68 + matchedCluster.length * 0.12 + Math.max(0, matchedSymptoms.length - matchedCluster.length) * 0.04);

  return {
    condition: rule.condition,
    specialization: rule.specialization,
    doctorSuggestion: rule.doctorSuggestion,
    isEmergency: rule.isEmergency,
    confidence,
    matchedSymptoms,
    reply: rule.reply
  };
}
