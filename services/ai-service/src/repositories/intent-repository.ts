export type IntentDefinition = {
  intent:
    | "greeting"
    | "book_appointment"
    | "reschedule_appointment"
    | "cancel_appointment"
    | "check_availability"
    | "clinic_info"
    | "doctor_info"
    | "report_inquiry"
    | "appointment_status"
    | "ask_doctor_fee"
    | "emergency"
    | "human_escalation"
    | "goodbye"
    | "prescription_renewal"
    | "patient_admission_status"
    | "ot_scheduling"
    | "teleconsult_request"
    | "language_support"
    | "health_package_booking"
    | "referral_booking"
    | "second_opinion"
    | "insurance_inquiry"
    | "home_visit_request"
    | "digital_report_delivery"
    | "follow_up_care"
    | "unknown";
  keywords: string[];
};

const intentDefinitions: IntentDefinition[] = [
  {
    intent: "emergency",
    keywords: ["emergency", "urgent", "chest pain", "breathing problem", "unconscious", "severe bleeding", "emergency che", "તાત્કાલિક", "શ્વાસ", "बेहोश", "सीने में दर्द"]
  },
  {
    intent: "human_escalation",
    keywords: ["human", "reception", "agent", "transfer", "representative", "person se baat", "માણસ સાથે", "રિસેપ્શન", "human se"]
  },
  {
    intent: "reschedule_appointment",
    keywords: [
      "reschedule", "shift appointment", "change time", "change slot", "aa time nai chale", "bijo aapo", "shift karna hai",
      "appointment shift", "reschedule karna", "ફરી ગોઠવો", "સમય બદલો", "appointment change karvi che", "date badlavi che",
      "slot shift karo", "biji date aapo", "mane bijo time joiye", "postpone karvu che", "timing change kari do",
      "aa slot suit nathi karto", "doctor change nai time change", "same doctor sathe biji date joiye", "modify appointment",
      "alternate slot aapo", "aa divas nai chale", "adjust schedule", "mari booking update karo"
    ]
  },
  {
    intent: "cancel_appointment",
    keywords: [
      "cancel", "cancel appointment", "remove appointment", "hu nai aavu", "nahi aana", "appointment cancel", "booking cancel",
      "રદ", "નથી આવવું", "हटाओ appointment", "booking radd karo", "aa cancel karo", "mari booking hataavi do",
      "visit cancel karo", "aavanu nathi", "hu nahi avi shaku", "drop appointment", "delete booking", "remove entry",
      "mujhe nahi aana hai", "doctor nahi joiye have", "cancel my slot", "withdraw appointment", "opd entry cancel karo",
      "patient nai aavse", "cancel immediately", "pura cancel kari do"
    ]
  },
  {
    intent: "book_appointment",
    keywords: [
      "book", "appointment", "schedule", "doctor se milna", "mane doctor sathe malvu che", "appointment book karvu che",
      "appointment लेनी है", "see doctor", "book tomorrow", "mane appointment levi che", "doctor sathe malvu che",
      "checkup mate samay aapo", "doctor slot book karvo che", "appointment fix karvi che", "aaje mate booking karo",
      "next week appointment joiye", "doctor ne dekhavu che", "consultation book karvi che", "token book karvo che",
      "ek slot reserve karo", "online appointment karvi che", "skin doctor ka appointment chahiye", "aaje j doctor joiye",
      "koi earliest slot aapo", "evening ma appointment joiye", "doctor joiye", "slot lock karo"
    ]
  },
  {
    intent: "check_availability",
    keywords: ["available", "availability", "slot available", "doctor available", "available hai kya", "doctor available che", "slot che", "કયો સ્લોટ ખાલી છે"]
  },
  {
    intent: "ask_doctor_fee",
    keywords: ["fee", "charges", "cost", "payment", "billing", "kitna paisa lagega", "consultation fee", "ફી", "કેટલા પૈસા", "कितना पैसा"]
  },
  {
    intent: "clinic_info",
    keywords: ["timing", "address", "clinic", "location", "where is clinic", "hospital address", "ક્લિનિક ક્યાં છે", "ટાઈમિંગ", "address kya hai"]
  },
  {
    intent: "doctor_info",
    keywords: ["doctor info", "which doctor", "doctor details", "kon doctor", "kaya doctor", "કયા doctor", "ડોક્ટર વિશે"]
  },
  {
    intent: "report_inquiry",
    keywords: ["report", "lab report", "report ready", "report aayi kya", "report taiyar che", "રિપોર્ટ", "रिपोर्ट"]
  },
  {
    intent: "appointment_status",
    keywords: ["appointment status", "booking status", "status of appointment", "booked hai", "મારી અપોઇન્ટમેન્ટનું status", "status shu che"]
  },
  {
    intent: "teleconsult_request",
    keywords: ["teleconsult", "video consult", "phone consult", "online consult", "ટેલીકન્સલ્ટ", "फोन पर consult"]
  },
  {
    intent: "language_support",
    keywords: ["language", "gujarati", "hindi", "english", "speak gujarati", "ગુજરાતી માં", "हिंदी में", "english bolo"]
  },
  {
    intent: "insurance_inquiry",
    keywords: ["insurance", "cashless", "policy", "ઇન્સ્યોરન્સ", "बीमा"]
  },
  {
    intent: "second_opinion",
    keywords: ["second opinion", "બીજું મત", "दूसरी राय"]
  },
  {
    intent: "prescription_renewal",
    keywords: ["prescription renewal", "refill medicine", "renew prescription", "દવા ફરી", "प्रिस्क्रिप्शन renew"]
  },
  {
    intent: "patient_admission_status",
    keywords: ["admission status", "admitted", "room allotment", "દાખલ", "भरती status"]
  },
  {
    intent: "ot_scheduling",
    keywords: ["ot schedule", "operation theatre", "surgery schedule", "ઓપરેશન", "सर्जरी schedule"]
  },
  {
    intent: "health_package_booking",
    keywords: ["health package", "package booking", "checkup package", "હેલ્થ પેકેજ", "पैकेज booking"]
  },
  {
    intent: "referral_booking",
    keywords: ["referral", "referred by", "રેફરલ", "रेफरल booking"]
  },
  {
    intent: "home_visit_request",
    keywords: ["home visit", "ghar par doctor", "ઘરે આવો", "घर पर visit"]
  },
  {
    intent: "digital_report_delivery",
    keywords: ["digital report", "email report", "whatsapp report", "રિપોર્ટ whatsapp", "email par report"]
  },
  {
    intent: "follow_up_care",
    keywords: ["follow up care", "after care", "follow up", "ફોલો અપ care", "after discharge help"]
  },
  {
    intent: "goodbye",
    keywords: ["bye", "goodbye", "thank you bye", "namaste", "આભાર", "ठीक है bye"]
  },
  {
    intent: "greeting",
    keywords: ["hello", "hi", "namaste", "kem cho", "kemcho", "નમસ્તે", "હેલો"]
  }
];

export class IntentRepository {
  async list(): Promise<IntentDefinition[]> {
    return intentDefinitions;
  }
}
