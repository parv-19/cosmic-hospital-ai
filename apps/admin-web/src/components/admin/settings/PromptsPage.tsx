import React, { useEffect, useState, useCallback } from "react";
// THEMED: prompt editor keeps existing updateSettings payload shape.
import { fetchSettings, updateSettings, type SettingsRecord } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { Card, CardHeader } from "../../ui/Card";
import { Button } from "../../ui/Button";
import { PageLoader } from "../../ui/Spinner";

type Prompts = NonNullable<SettingsRecord["conversationPrompts"]>;
type TopLevelPromptKey = "greetingMessage" | "afterHoursMessage" | "fallbackResponse" | "emergencyMessage";
type PromptLanguageId = "english" | "hinglish" | "gujarati";

const PROMPT_FIELDS: Array<{ key: keyof Prompts; label: string; description: string }> = [
  { key: "askSpecialization",      label: "Ask Specialization",       description: "When bot asks the caller which specialty they need" },
  { key: "askDoctorPreference",    label: "Ask Doctor Preference",    description: "When bot asks if they have a preferred doctor" },
  { key: "askDate",                label: "Ask Appointment Date",     description: "When bot asks for preferred appointment date" },
  { key: "askTime",                label: "Ask Appointment Time",     description: "When bot asks for preferred appointment time" },
  { key: "askPatientName",         label: "Ask Patient Name",         description: "When bot asks for the patient's name" },
  { key: "askMobile",              label: "Ask Mobile Number",        description: "When bot asks for contact number" },
  { key: "askPatientType",         label: "Ask Patient Type",         description: "New or existing patient" },
  { key: "confirmPrefix",          label: "Confirm Prefix",           description: "Text before confirming the booking summary" },
  { key: "bookingConfirmed",       label: "Booking Confirmed",        description: "Message when booking is successful" },
  { key: "bookingConfirmationSummary", label: "Booking Confirmation Summary", description: "Uses {{confirmPrefix}}, {{date}}, {{time}}, {{doctor}}, {{patientName}}, {{contactNumber}}" },
  { key: "bookingFinalSummary",    label: "Booking Final Summary",    description: "Uses {{bookingConfirmed}}, {{date}}, {{time}}, {{doctor}}, {{reference}}" },
  { key: "bookingCancelled",       label: "Booking Cancelled",        description: "Message when booking is cancelled by bot" },
  { key: "bookingAlreadyComplete", label: "Already Booked",           description: "When patient already has an appointment" },
  { key: "bookingAlreadyCancelled",label: "Already Cancelled",        description: "When appointment was already cancelled" },
  { key: "transferMessage",        label: "Transfer Message",         description: "Spoken when transferring the call" },
  { key: "goodbyeMessage",         label: "Goodbye Message",          description: "Final message before ending the call" },
  { key: "confirmRememberedDoctor", label: "Remembered Doctor Confirm", description: "Uses {{doctor}} when the bot remembers the last doctor" },
  { key: "confirmRememberedDay",    label: "Remembered Day Confirm",    description: "Uses {{day}} when the bot remembers the last appointment day" },
  { key: "callerNumberConfirmation",label: "Caller Number Confirm",     description: "Uses {{maskedNumber}} and {{number}} for current caller number confirmation" },
  { key: "callerReuseConfirmation", label: "Returning Caller Reuse",    description: "Uses {{maskedNumber}} and {{number}} for previous caller details reuse" },
  { key: "silenceRetryWithSlots",   label: "Silence Retry With Slots",  description: "Uses {{slotChoices}} when caller is quiet after slot options" },
  { key: "silenceRetryDate",        label: "Silence Retry Date",        description: "Uses {{day}} when caller is quiet during date confirmation" },
  { key: "silenceRetryDoctor",      label: "Silence Retry Doctor",      description: "Uses {{doctor}} when caller is quiet during doctor confirmation" },
  { key: "silenceRetryGeneric",     label: "Silence Retry Generic",     description: "Uses {{stagePrompt}} for general no-response retry" },
  { key: "recoverySpecialization",  label: "Recovery Specialization",   description: "Uses {{specializations}} when doctor or department is unclear" },
  { key: "recoveryTimeWithSlots",   label: "Recovery Time With Slots",  description: "Uses {{slotChoices}} when time input is unclear after slot options" },
  { key: "recoveryTimeGeneric",     label: "Recovery Time Generic",     description: "When time input is unclear and no slots were suggested" },
  { key: "recoveryDateWithMemory",  label: "Recovery Date With Memory", description: "Uses {{day}} when date input is unclear but a day is remembered" },
  { key: "recoveryDateGeneric",     label: "Recovery Date Generic",     description: "When date input is unclear" },
  { key: "recoveryDoctorWithMemory",label: "Recovery Doctor Memory",    description: "Uses {{doctor}} when doctor choice is unclear but remembered" },
  { key: "recoveryPatientName",     label: "Recovery Patient Name",     description: "When patient name is unclear" },
  { key: "recoveryMobile",          label: "Recovery Mobile",           description: "When mobile number is unclear" },
  { key: "recoveryConfirmation",    label: "Recovery Confirmation",     description: "When final yes/no confirmation is unclear" },
  { key: "availableDoctors",        label: "Available Doctors",         description: "Uses {{doctorList}} when reading doctor options" },
  { key: "doctorDisambiguation",    label: "Doctor Disambiguation",     description: "Uses {{doctorOptions}} and {{sharedLastName}} for same-name doctor matches" },
  { key: "partialMobilePrompt",     label: "Partial Mobile Prompt",     description: "Uses {{digits}} and {{remainingDigits}} when caller says part of a phone number" },
  { key: "availabilityExactSlotAvailable", label: "Exact Slot Available", description: "Uses {{time}} when requested exact time is open" },
  { key: "availabilitySlotAvailable",      label: "Slot Available",       description: "Uses {{day}}, {{timeContext}}, {{slot}}, {{slotPreview}}" },
  { key: "availabilityTimeFull",           label: "Requested Time Full",  description: "Uses {{requestedTime}}, {{alternativeFrame}}, {{slotPreview}}, {{slot1}}, {{slot2}}" },
  { key: "availabilityAlternativeSameBucket", label: "Alternative Slots Same Period", description: "Uses {{slot1}}, {{slot2}}, {{bucket1}}, {{bucket2}}" },
  { key: "availabilityAlternativeDifferentBucket", label: "Alternative Slots Different Period", description: "Uses {{slot1}}, {{slot2}}, {{bucket1}}, {{bucket2}}" },
  { key: "availabilityDayUnavailableWithNext", label: "Day Unavailable With Next", description: "Uses {{day}}, {{nextDay}}, {{slotPreview}}" },
  { key: "availabilityDayUnavailableNoNext",   label: "Day Unavailable No Next",   description: "Uses {{day}} when no next slot exists" },
  { key: "availabilitySlotsFullWithNext",      label: "Slots Full With Next",      description: "Uses {{day}}, {{nextDay}}, {{slotPreview}}" },
  { key: "availabilitySlotsFullNoNext",        label: "Slots Full No Next",        description: "Uses {{day}} when doctor has no free slot" },
  { key: "availabilityBookingDisabled",        label: "Booking Disabled",          description: "Uses {{doctor}} when booking is off for that doctor" },
  { key: "rescheduleNoActiveBooking",          label: "Reschedule No Booking",     description: "When caller asks to reschedule but no active booking is found" },
  { key: "rescheduleFoundBooking",             label: "Reschedule Found Booking",  description: "Uses {{appointment}} before asking for a new day" },
  { key: "rescheduleAskNewDay",                label: "Reschedule Ask Day",        description: "When bot asks for the new appointment day" },
  { key: "rescheduleMissingBooking",           label: "Reschedule Missing Booking",description: "When booking details cannot be resolved" },
  { key: "rescheduleBookingDisabled",          label: "Reschedule Disabled",       description: "Uses {{doctor}} when reschedule needs reception" },
  { key: "rescheduleSlotsAvailable",           label: "Reschedule Slots Available",description: "Uses {{availabilityReply}} and {{slotChoices}}" },
  { key: "rescheduleAskSlot",                  label: "Reschedule Ask Slot",       description: "Uses {{slotChoices}} when asking for a new slot" },
  { key: "rescheduleConfirm",                  label: "Reschedule Confirm",        description: "Uses {{day}}, {{slot}}, {{doctor}}" },
  { key: "rescheduleFinal",                    label: "Reschedule Final",          description: "Uses {{day}}, {{slot}}, {{doctor}}, {{reference}}" },
  { key: "rescheduleDeclined",                 label: "Reschedule Declined",       description: "When caller declines the reschedule" },
  { key: "rescheduleAlreadyComplete",          label: "Already Rescheduled",       description: "When reschedule was already completed" },
  { key: "cancelNoActiveBooking",              label: "Cancel No Booking",         description: "When caller asks to cancel but no active booking is found" },
  { key: "noActiveAppointmentSpecific",         label: "Specific Booking Not Found",description: "Uses {{criteria}}, {{patientName}}, {{doctor}}, {{time}} when lookup by name/time/doctor fails" },
  { key: "cancelAskPatientName",                label: "Cancel Ask Patient Name",   description: "Uses {{criteria}}, {{doctor}}, {{time}} when a cancel target needs patient-name confirmation" },
  { key: "cancelConfirm",                      label: "Cancel Confirm",            description: "Uses {{appointment}} before cancelling" },
  { key: "cancelDeclined",                     label: "Cancel Declined",           description: "When caller declines cancellation" },
  { key: "cancelMissingBooking",               label: "Cancel Missing Booking",    description: "When booking details cannot be resolved" },
  { key: "cancelFinal",                        label: "Cancel Final",              description: "Uses {{appointment}} and {{reference}}" },
  { key: "extraInstructions",      label: "Extra Instructions",       description: "Additional instructions for the AI bot" },
];

const TOP_LEVEL: Array<{ key: TopLevelPromptKey; label: string; description: string }> = [
  { key: "greetingMessage",   label: "Greeting Message",    description: "First message the bot says when a call connects" },
  { key: "afterHoursMessage", label: "After Hours Message", description: "Played when caller calls outside business hours" },
  { key: "fallbackResponse",  label: "Fallback Response",   description: "When bot cannot understand the caller" },
  { key: "emergencyMessage",  label: "Emergency Message",   description: "Played for emergency situations" },
];

const PROMPT_LANGUAGE_PRESETS: Array<{
  id: PromptLanguageId;
  label: string;
  description: string;
  settingLanguage: string;
  topLevel: Record<TopLevelPromptKey, string>;
  prompts: Partial<Prompts>;
}> = [
  {
    id: "english",
    label: "English",
    description: "Use natural Indian English for every spoken prompt.",
    settingLanguage: "en-IN",
    topLevel: {
      greetingMessage: "Hello, welcome to the hospital appointment desk. I can help you book, reschedule, or cancel an appointment.",
      afterHoursMessage: "The clinic is currently closed. Please call during working hours, or leave your request and reception will follow up.",
      fallbackResponse: "Sorry, I could not understand that clearly. Please tell me whether you want to book, reschedule, cancel, or speak to reception.",
      emergencyMessage: "If this is a medical emergency, please contact emergency support immediately."
    },
    prompts: {
      askSpecialization: "Which doctor or specialization would you like an appointment for?",
      askDoctorPreference: "Would you like a specific doctor, or is the earliest available doctor okay?",
      askDate: "Which day would you prefer for the appointment?",
      askTime: "Would you prefer a morning, afternoon, or evening slot?",
      askPatientName: "Please tell me the patient's name.",
      askMobile: "Please tell me the mobile number.",
      askPatientType: "Is this a new patient or a follow-up visit?",
      confirmPrefix: "Let me confirm the details once.",
      bookingConfirmed: "Done. Your booking request has been updated on the dashboard.",
      bookingConfirmationSummary: "{{confirmPrefix}} The booking is for {{date}} {{time}} with Dr. {{doctor}}, patient name {{patientName}}, and contact number {{contactNumber}}. Is that correct?",
      bookingFinalSummary: "{{bookingConfirmed}} Your appointment is booked for {{date}} {{time}} with Dr. {{doctor}}. Reference last 4: {{reference}}.",
      bookingCancelled: "The booking request has been cancelled. If you need a new appointment, please tell me.",
      bookingAlreadyComplete: "Your appointment request is already confirmed. Thank you for calling.",
      bookingAlreadyCancelled: "This booking was already cancelled. You can start again by asking for a new appointment.",
      transferMessage: "I will connect you to reception.",
      goodbyeMessage: "Thank you for calling. Goodbye.",
      confirmRememberedDoctor: "Do you want to book with {{doctor}}?",
      confirmRememberedDay: "Should I check for {{day}}?",
      callerNumberConfirmation: "Should I use this current number for the booking? {{maskedNumber}}.",
      callerReuseConfirmation: "Should I reuse the previous contact details? {{maskedNumber}}.",
      silenceRetryWithSlots: "You can choose from {{slotChoices}}. I am waiting.",
      silenceRetryDate: "Should I keep {{day}}, or would you like another day? I am waiting.",
      silenceRetryDoctor: "Do you want to book with {{doctor}}?",
      silenceRetryGeneric: "{{stagePrompt}} I am waiting.",
      recoverySpecialization: "The doctor or department was not clear. Please choose from {{specializations}}.",
      recoveryTimeWithSlots: "I need to confirm the time. Which one should I keep from {{slotChoices}}?",
      recoveryTimeGeneric: "I need to confirm the time. Would you prefer morning or afternoon?",
      recoveryDateWithMemory: "Should I keep {{day}}, or would you like another day?",
      recoveryDateGeneric: "I need to confirm the day. Which day would you like for the appointment?",
      recoveryDoctorWithMemory: "Do you want to book with {{doctor}}?",
      recoveryPatientName: "The name was not clear. Which name should I use for the booking?",
      recoveryMobile: "The mobile number was not clear. Please tell me the number once again.",
      recoveryConfirmation: "I need to confirm. Are these details correct?",
      availableDoctors: "We have {{doctorList}} available. Which doctor would you like?",
      doctorDisambiguation: "Which doctor would you like an appointment with? We have {{doctorOptions}} available.",
      partialMobilePrompt: "{{digits}} received. Please say the remaining {{remainingDigits}} digits.",
      availabilityExactSlotAvailable: "{{time}} is available.",
      availabilitySlotAvailable: "{{day}} {{timeContext}}{{slot}} is available.",
      availabilityTimeFull: "{{requestedTime}} is not available. {{alternativeFrame}}. Which one should I book?",
      availabilityAlternativeSameBucket: "{{slot1}} and {{slot2}} are available",
      availabilityAlternativeDifferentBucket: "{{slot1}} is in the {{bucket1}}, and {{slot2}} is a little later in the {{bucket2}}",
      availabilityDayUnavailableWithNext: "The doctor is not available on {{day}}. On {{nextDay}}, {{slotPreview}} may be available. Should I check {{nextDay}}?",
      availabilityDayUnavailableNoNext: "The doctor is not available on {{day}}. Should I check another doctor?",
      availabilitySlotsFullWithNext: "The slots for {{day}} are full. On {{nextDay}}, {{slotPreview}} may be available. Should I check that?",
      availabilitySlotsFullNoNext: "The slots for {{day}} are full. Should I check another doctor?",
      availabilityBookingDisabled: "Booking for {{doctor}} currently needs reception confirmation. I can connect you.",
      rescheduleNoActiveBooking: "I could not find an active appointment on this number. If you want to book a new appointment, please tell me.",
      rescheduleFoundBooking: "Your booking is for {{appointment}}. Which day would you like to reschedule it to?",
      rescheduleAskNewDay: "Which day would you like to reschedule to? Please tell me a day from Monday to Sunday.",
      rescheduleMissingBooking: "The active booking details are not clear. Reception will need to confirm this.",
      rescheduleBookingDisabled: "Rescheduling for {{doctor}} currently needs reception confirmation. I can connect you to reception.",
      rescheduleSlotsAvailable: "{{availabilityReply}} Which slot should I keep from {{slotChoices}}?",
      rescheduleAskSlot: "Which slot should I keep from {{slotChoices}}?",
      rescheduleConfirm: "Should I reschedule to {{day}} at {{slot}} with Dr. {{doctor}}?",
      rescheduleFinal: "Done. Your appointment has been rescheduled to {{day}} at {{slot}} with Dr. {{doctor}}. Reference last 4: {{reference}}.",
      rescheduleDeclined: "Okay, I have cancelled the reschedule request for now. Tell me if you need a new appointment or any other help.",
      rescheduleAlreadyComplete: "Your appointment has already been rescheduled. Thank you.",
      cancelNoActiveBooking: "I could not find an active appointment on this number. If you want to book a new appointment, please tell me.",
      noActiveAppointmentSpecific: "I could not find an active appointment for {{criteria}} on this number.",
      cancelAskPatientName: "For {{criteria}}, which patient name should I cancel the appointment for?",
      cancelConfirm: "Your booking is for {{appointment}}. Should I cancel it?",
      cancelDeclined: "Okay, the appointment has not been cancelled. Tell me if you need any other help.",
      cancelMissingBooking: "I could not find an active booking. Tell me if you need any other help.",
      cancelFinal: "Okay, the appointment for {{appointment}} has been cancelled. Reference last 4: {{reference}}.",
      extraInstructions: ""
    }
  },
  {
    id: "hinglish",
    label: "Hindi / Hinglish",
    description: "Use Hindi phrasing written in English script for phone calls.",
    settingLanguage: "hi-IN",
    topLevel: {
      greetingMessage: "Namaste, hospital appointment desk mein aapka swagat hai. Main appointment book, reschedule, ya cancel karne mein madad kar sakti hoon.",
      afterHoursMessage: "Clinic abhi band hai. Kripya working hours mein call karein, ya apni request chhod dijiye, reception follow up karega.",
      fallbackResponse: "Maaf kijiye, mujhe clear samajh nahi aaya. Kripya batayein appointment book, reschedule, cancel, ya reception se baat karni hai.",
      emergencyMessage: "Agar yeh medical emergency hai, kripya turant emergency support se contact karein."
    },
    prompts: {
      askSpecialization: "Aap kis doctor ya specialization ke liye appointment lena chahte hain?",
      askDoctorPreference: "Kya aap kisi specific doctor se milna chahte hain, ya earliest available doctor chalega?",
      askDate: "Aapko kis din appointment chahiye?",
      askTime: "Aapko morning, afternoon, ya evening mein kaunsa slot chahiye?",
      askPatientName: "Kripya patient ka naam batayein.",
      askMobile: "Kripya mobile number batayein.",
      askPatientType: "Yeh new patient hai ya follow-up?",
      confirmPrefix: "Theek hai, main details ek baar confirm kar deti hoon.",
      bookingConfirmed: "Ho gaya. Aapki booking request dashboard par update kar di gayi hai.",
      bookingConfirmationSummary: "{{confirmPrefix}} {{date}} {{time}} par Dr. {{doctor}} ke saath booking hai, naam {{patientName}}, aur contact number {{contactNumber}} rahega. Sahi hai?",
      bookingFinalSummary: "{{bookingConfirmed}} {{date}} {{time}} par Dr. {{doctor}} ke saath appointment booked hai. Reference last 4: {{reference}}.",
      bookingCancelled: "Theek hai, booking request cancel kar di gayi hai. Nayi appointment chahiye ho to bata dijiye.",
      bookingAlreadyComplete: "Aapki appointment request already confirm hai. Thank you for calling.",
      bookingAlreadyCancelled: "Yeh booking pehle hi cancel ho chuki hai. Nayi appointment ke liye bata dijiye.",
      transferMessage: "Main aapko reception se connect kar rahi hoon.",
      goodbyeMessage: "Dhanyavaad. Namaste.",
      confirmRememberedDoctor: "{{doctor}} ke liye hi booking karni hai na?",
      confirmRememberedDay: "{{day}} ke liye hi dekhna hai?",
      callerNumberConfirmation: "Booking ke liye yahi current number use kar loon? {{maskedNumber}}.",
      callerReuseConfirmation: "Pichli baar wali contact details use kar loon? {{maskedNumber}}.",
      silenceRetryWithSlots: "Aap {{slotChoices}} mein se choose kar sakte hain. Main wait kar rahi hoon.",
      silenceRetryDate: "{{day}} hi rakhna hai ya koi aur din? Main wait kar rahi hoon.",
      silenceRetryDoctor: "{{doctor}} ke liye hi booking karni hai na?",
      silenceRetryGeneric: "{{stagePrompt}} Main wait kar rahi hoon.",
      recoverySpecialization: "Doctor ya department clear nahi aaya. {{specializations}} mein se bata dijiye.",
      recoveryTimeWithSlots: "Time confirm karna tha. {{slotChoices}} mein se kaunsa rakh doon?",
      recoveryTimeGeneric: "Time confirm karna tha. Morning chahte hain ya afternoon?",
      recoveryDateWithMemory: "{{day}} hi rakhna hai, ya koi aur din?",
      recoveryDateGeneric: "Din confirm karna tha. Kis din ka appointment chahiye?",
      recoveryDoctorWithMemory: "{{doctor}} ke liye hi booking karni hai na?",
      recoveryPatientName: "Naam clear nahi aaya. Kis naam se booking karoon?",
      recoveryMobile: "Mobile number clear nahi aaya. Ek baar number bata dijiye.",
      recoveryConfirmation: "Confirm karna tha. Details sahi hain?",
      availableDoctors: "Humare paas {{doctorList}} available hain. Kaunsa doctor chahiye?",
      doctorDisambiguation: "Batayiye, kaunse doctor se appointment leni hai? Humare yaha {{doctorOptions}} available hain.",
      partialMobilePrompt: "{{digits}} mila. Baaki {{remainingDigits}} digit bata dijiye.",
      availabilityExactSlotAvailable: "{{time}} ka slot available hai.",
      availabilitySlotAvailable: "{{day}} {{timeContext}}{{slot}} ka slot available hai.",
      availabilityTimeFull: "{{requestedTime}} available nahi hai. {{alternativeFrame}}. Kaunsa rakh doon?",
      availabilityAlternativeSameBucket: "{{slot1}} aur {{slot2}} available hain",
      availabilityAlternativeDifferentBucket: "{{slot1}} {{bucket1}} mein hai aur {{slot2}} thoda baad mein hoga",
      availabilityDayUnavailableWithNext: "{{day}} ko doctor available nahi hain. {{nextDay}} mein {{slotPreview}} mil sakta hai. {{nextDay}} dekh loon?",
      availabilityDayUnavailableNoNext: "{{day}} ko doctor available nahi hain. Kisi aur doctor ka slot dekh loon?",
      availabilitySlotsFullWithNext: "{{day}} ke slots full hain. {{nextDay}} mein {{slotPreview}} mil sakta hai. Wahi dekh loon?",
      availabilitySlotsFullNoNext: "{{day}} ke slots full hain. Kisi aur doctor ka slot dekh loon?",
      availabilityBookingDisabled: "{{doctor}} ke liye booking abhi reception se confirm hogi. Main connect kar sakti hoon.",
      rescheduleNoActiveBooking: "Is number par koi active appointment nahi mili. Nayi appointment book karni ho to bata dijiye.",
      rescheduleFoundBooking: "Aapki booking {{appointment}} ke liye hai. Kis din reschedule karna hai?",
      rescheduleAskNewDay: "Kis din reschedule karna hai? Monday se Sunday mein se din bata dijiye.",
      rescheduleMissingBooking: "Active booking ki doctor details clear nahi mili. Reception se confirm karna padega.",
      rescheduleBookingDisabled: "{{doctor}} ke liye reschedule abhi reception se confirm hoga. Main reception se connect kar sakti hoon.",
      rescheduleSlotsAvailable: "{{availabilityReply}} {{slotChoices}} mein se kaunsa slot rakh doon?",
      rescheduleAskSlot: "{{slotChoices}} mein se kaunsa slot rakh doon?",
      rescheduleConfirm: "{{day}} {{slot}} par Dr. {{doctor}} ke saath reschedule kar doon?",
      rescheduleFinal: "Ho gaya. Aapki appointment {{day}} {{slot}} par Dr. {{doctor}} ke saath reschedule kar di gayi hai. Reference last 4: {{reference}}.",
      rescheduleDeclined: "Theek hai, reschedule abhi cancel kar diya. Nayi appointment ya koi aur madad chahiye ho to bata dijiye.",
      rescheduleAlreadyComplete: "Aapki appointment already reschedule ho chuki hai. Thank you.",
      cancelNoActiveBooking: "Is number par koi active appointment nahi mili. Nayi appointment book karni ho to bata dijiye.",
      noActiveAppointmentSpecific: "Is number par {{criteria}} ke liye koi active appointment nahi mili.",
      cancelAskPatientName: "{{criteria}} ke liye kis patient ke naam par appointment cancel karni hai?",
      cancelConfirm: "Aapki booking {{appointment}} ke liye hai. Kya main ise cancel kar doon?",
      cancelDeclined: "Theek hai, appointment cancel nahi ki gayi. Koi aur madad chahiye ho to bata dijiye.",
      cancelMissingBooking: "Active booking nahi mili. Koi aur madad chahiye ho to bata dijiye.",
      cancelFinal: "Theek hai, {{appointment}} wali appointment cancel kar di gayi hai. Reference last 4: {{reference}}.",
      extraInstructions: ""
    }
  },
  {
    id: "gujarati",
    label: "Gujarati",
    description: "Use Gujarati for every spoken prompt.",
    settingLanguage: "gu-IN",
    topLevel: {
      greetingMessage: "નમસ્તે, હોસ્પિટલ એપોઇન્ટમેન્ટ ડેસ્કમાં આપનું સ્વાગત છે. હું એપોઇન્ટમેન્ટ બુક, રીશેડ્યૂલ અથવા કેન્સલ કરવામાં મદદ કરી શકું છું.",
      afterHoursMessage: "ક્લિનિક હાલમાં બંધ છે. કૃપા કરીને કામના સમયમાં ફોન કરો, અથવા તમારી વિનંતી મૂકી દો, રિસેપ્શન ફોલો અપ કરશે.",
      fallbackResponse: "માફ કરશો, મને સ્પષ્ટ સમજાયું નહીં. કૃપા કરીને કહો કે એપોઇન્ટમેન્ટ બુક, રીશેડ્યૂલ, કેન્સલ, કે રિસેપ્શન સાથે વાત કરવી છે.",
      emergencyMessage: "જો આ મેડિકલ ઇમરજન્સી હોય, તો કૃપા કરીને તરત ઇમરજન્સી સપોર્ટનો સંપર્ક કરો."
    },
    prompts: {
      cancelAskPatientName: "{{criteria}} માટે કયા patient ના નામે appointment cancel કરવી છે?",
      askSpecialization: "તમારે કયા ડોક્ટર અથવા કઈ સ્પેશિયલાઇઝેશન માટે એપોઇન્ટમેન્ટ લેવી છે?",
      askDoctorPreference: "તમારે કોઈ ચોક્કસ ડોક્ટર પાસે જવું છે, કે earliest available doctor ચાલશે?",
      askDate: "તમારે કયા દિવસે એપોઇન્ટમેન્ટ જોઈએ છે?",
      askTime: "તમારે morning, afternoon, કે evening માં કયો slot જોઈએ છે?",
      askPatientName: "કૃપા કરીને દર્દીનું નામ કહો.",
      askMobile: "કૃપા કરીને મોબાઇલ નંબર કહો.",
      askPatientType: "આ new patient છે કે follow-up?",
      confirmPrefix: "બરાબર, હું એક વાર details confirm કરી દઉં.",
      bookingConfirmed: "થઈ ગયું. તમારી booking request dashboard પર update થઈ ગઈ છે.",
      bookingCancelled: "બરાબર, booking request cancel કરી દીધી છે. નવી appointment જોઈએ તો કહેજો.",
      bookingAlreadyComplete: "તમારી appointment request પહેલેથી confirm છે. ફોન કરવા બદલ આભાર.",
      bookingAlreadyCancelled: "આ booking પહેલેથી cancel થઈ ગઈ છે. નવી appointment માટે કહેજો.",
      transferMessage: "હું તમને reception સાથે connect કરું છું.",
      goodbyeMessage: "આભાર. નમસ્તે.",
      confirmRememberedDoctor: "{{doctor}} માટે જ booking કરવી છે ને?",
      confirmRememberedDay: "{{day}} માટે જ જોવું છે?",
      callerNumberConfirmation: "Booking માટે આ current number use કરું? {{maskedNumber}}.",
      callerReuseConfirmation: "પાછલી વારની contact details use કરું? {{maskedNumber}}.",
      silenceRetryWithSlots: "તમે {{slotChoices}} માંથી choose કરી શકો છો. હું રાહ જોઈ રહી છું.",
      silenceRetryDate: "{{day}} જ રાખવો છે કે બીજો દિવસ? હું રાહ જોઈ રહી છું.",
      silenceRetryDoctor: "{{doctor}} માટે જ booking કરવી છે ને?",
      silenceRetryGeneric: "{{stagePrompt}} હું રાહ જોઈ રહી છું.",
      recoverySpecialization: "Doctor અથવા department clear નથી આવ્યું. {{specializations}} માંથી કહો.",
      recoveryTimeWithSlots: "Time confirm કરવો હતો. {{slotChoices}} માંથી કયો રાખું?",
      recoveryTimeGeneric: "Time confirm કરવો હતો. Morning જોઈએ છે કે afternoon?",
      recoveryDateWithMemory: "{{day}} જ રાખવો છે, કે બીજો દિવસ?",
      recoveryDateGeneric: "દિવસ confirm કરવો હતો. કયા દિવસની appointment જોઈએ?",
      recoveryDoctorWithMemory: "{{doctor}} માટે જ booking કરવી છે ને?",
      recoveryPatientName: "નામ clear નથી આવ્યું. કયા નામથી booking કરું?",
      recoveryMobile: "Mobile number clear નથી આવ્યો. એક વાર number કહો.",
      recoveryConfirmation: "Confirm કરવું હતું. Details સાચી છે?",
      availabilityExactSlotAvailable: "{{time}} નો slot available છે.",
      availabilitySlotAvailable: "{{day}} {{timeContext}}{{slot}} નો slot available છે.",
      availabilityTimeFull: "{{requestedTime}} available નથી. {{alternativeFrame}}. કયો રાખું?",
      availabilityAlternativeSameBucket: "{{slot1}} અને {{slot2}} available છે",
      availabilityAlternativeDifferentBucket: "{{slot1}} {{bucket1}} માં છે અને {{slot2}} થોડું પછી {{bucket2}} માં હશે",
      availabilityDayUnavailableWithNext: "{{day}} એ doctor available નથી. {{nextDay}} માં {{slotPreview}} મળી શકે છે. {{nextDay}} ચેક કરું?",
      availabilityDayUnavailableNoNext: "{{day}} એ doctor available નથી. બીજા doctor નો slot ચેક કરું?",
      availabilitySlotsFullWithNext: "{{day}} ના slots full છે. {{nextDay}} માં {{slotPreview}} મળી શકે છે. એ ચેક કરું?",
      availabilitySlotsFullNoNext: "{{day}} ના slots full છે. બીજા doctor નો slot ચેક કરું?",
      availabilityBookingDisabled: "{{doctor}} માટે booking હાલમાં reception થી confirm થશે. હું connect કરી શકું છું.",
      rescheduleNoActiveBooking: "આ number પર કોઈ active appointment મળી નથી. નવી appointment book કરવી હોય તો કહો.",
      rescheduleFoundBooking: "તમારી booking {{appointment}} માટે છે. કયા દિવસે reschedule કરવી છે?",
      rescheduleAskNewDay: "કયા દિવસે reschedule કરવું છે? Monday થી Sunday માંથી દિવસ કહો.",
      rescheduleMissingBooking: "Active booking ની doctor details clear નથી મળી. Reception થી confirm કરવું પડશે.",
      rescheduleBookingDisabled: "{{doctor}} માટે reschedule હાલમાં reception થી confirm થશે. હું reception સાથે connect કરી શકું છું.",
      rescheduleSlotsAvailable: "{{availabilityReply}} {{slotChoices}} માંથી કયો slot રાખું?",
      rescheduleAskSlot: "{{slotChoices}} માંથી કયો slot રાખું?",
      rescheduleConfirm: "{{day}} {{slot}} પર Dr. {{doctor}} સાથે reschedule કરી દઉં?",
      rescheduleFinal: "થઈ ગયું. તમારી appointment {{day}} {{slot}} પર Dr. {{doctor}} સાથે reschedule થઈ ગઈ છે. Reference last 4: {{reference}}.",
      rescheduleDeclined: "બરાબર, reschedule હાલ cancel કરી દીધું. નવી appointment અથવા બીજી મદદ જોઈએ તો કહો.",
      rescheduleAlreadyComplete: "તમારી appointment પહેલેથી reschedule થઈ ગઈ છે. આભાર.",
      cancelNoActiveBooking: "આ number પર કોઈ active appointment મળી નથી. નવી appointment book કરવી હોય તો કહો.",
      cancelConfirm: "તમારી booking {{appointment}} માટે છે. શું હું તેને cancel કરી દઉં?",
      cancelDeclined: "બરાબર, appointment cancel નથી કરી. બીજી મદદ જોઈએ તો કહો.",
      cancelMissingBooking: "Active booking મળી નથી. બીજી મદદ જોઈએ તો કહો.",
      cancelFinal: "બરાબર, {{appointment}} વાળી appointment cancel કરી દીધી છે. Reference last 4: {{reference}}.",
      extraInstructions: ""
    }
  }
];

const REQUIRED_PRESET_PROMPTS: Record<PromptLanguageId, Partial<Prompts>> = {
  english: {
    bookingConfirmationSummary: "{{confirmPrefix}} The booking is for {{date}} {{time}} with Dr. {{doctor}}, patient name {{patientName}}, and contact number {{contactNumber}}. Is that correct?",
    bookingFinalSummary: "{{bookingConfirmed}} Your appointment is booked for {{date}} {{time}} with Dr. {{doctor}}. Reference last 4: {{reference}}.",
    availableDoctors: "We have {{doctorList}} available. Which doctor would you like?",
    doctorDisambiguation: "Which doctor would you like an appointment with? We have {{doctorOptions}} available.",
    partialMobilePrompt: "{{digits}} received. Please say the remaining {{remainingDigits}} digits.",
    noActiveAppointmentSpecific: "I could not find an active appointment for {{criteria}} on this number.",
    cancelAskPatientName: "For {{criteria}}, which patient name should I cancel the appointment for?"
  },
  hinglish: {
    bookingConfirmationSummary: "{{confirmPrefix}} {{date}} {{time}} par Dr. {{doctor}} ke saath booking hai, naam {{patientName}}, aur contact number {{contactNumber}} rahega. Sahi hai?",
    bookingFinalSummary: "{{bookingConfirmed}} {{date}} {{time}} par Dr. {{doctor}} ke saath appointment booked hai. Reference last 4: {{reference}}.",
    availableDoctors: "Humare paas {{doctorList}} available hain. Kaunsa doctor chahiye?",
    doctorDisambiguation: "Batayiye, kaunse doctor se appointment leni hai? Humare yaha {{doctorOptions}} available hain.",
    partialMobilePrompt: "{{digits}} mila. Baaki {{remainingDigits}} digit bata dijiye.",
    noActiveAppointmentSpecific: "Is number par {{criteria}} ke liye koi active appointment nahi mili.",
    cancelAskPatientName: "{{criteria}} ke liye kis patient ke naam par appointment cancel karni hai?"
  },
  gujarati: {
    cancelAskPatientName: "{{criteria}} માટે કયા patient ના નામે appointment cancel કરવી છે?",
    bookingConfirmationSummary: "{{confirmPrefix}} {{date}} {{time}} પર Dr. {{doctor}} સાથે booking છે, નામ {{patientName}}, અને contact number {{contactNumber}} રહેશે. સાચું છે?",
    bookingFinalSummary: "{{bookingConfirmed}} {{date}} {{time}} પર Dr. {{doctor}} સાથે appointment booked છે. Reference last 4: {{reference}}.",
    availableDoctors: "અમારી પાસે {{doctorList}} available છે. કયા doctor જોઈએ?",
    doctorDisambiguation: "કયા doctor માટે appointment લેવી છે? અમારી પાસે {{doctorOptions}} available છે.",
    partialMobilePrompt: "{{digits}} મળ્યા. બાકી {{remainingDigits}} digit કહો.",
    noActiveAppointmentSpecific: "આ number પર {{criteria}} માટે કોઈ active appointment મળી નથી."
  }
};

export function PromptsPage() {
  const { token } = useAuth();
  const [records, setRecords] = useState<SettingsRecord[]>([]);
  const [selected, setSelected] = useState<SettingsRecord | null>(null);
  const [topLevel, setTopLevel] = useState<Partial<Record<TopLevelPromptKey, string>>>({});
  const [prompts, setPrompts]   = useState<Partial<Prompts>>({});
  const [promptLanguage, setPromptLanguage] = useState("hi-IN");
  const [selectedPresetId, setSelectedPresetId] = useState<PromptLanguageId | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchSettings(token);
      setRecords(data);
      if (data.length > 0) {
        setSelected(data[0]);
        applyRecord(data[0]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load prompts.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  function applyRecord(r: SettingsRecord) {
    setSelected(r);
    setTopLevel({
      greetingMessage:   r.greetingMessage ?? "",
      afterHoursMessage: r.afterHoursMessage ?? "",
      fallbackResponse:  r.fallbackResponse ?? "",
      emergencyMessage:  r.emergencyMessage ?? "",
    });
    setPrompts({ ...(r.conversationPrompts ?? {}) });
    setPromptLanguage(r.language ?? "hi-IN");
    setSelectedPresetId(null);
    setSaved(false);
  }

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!token || !selected) return;
    setSaving(true);
    setError("");
    try {
      await updateSettings(token, {
        doctorId: selected.doctorId,
        ...topLevel,
        language: promptLanguage,
        conversationPrompts: prompts,
      } as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function applyLanguagePreset(preset: (typeof PROMPT_LANGUAGE_PRESETS)[number]) {
    setTopLevel({ ...preset.topLevel });
    setPrompts({ ...REQUIRED_PRESET_PROMPTS[preset.id], ...preset.prompts });
    setPromptLanguage(preset.settingLanguage);
    setSelectedPresetId(preset.id);
    setSaved(false);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Doctor selector */}
      {records.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {records.map((r) => (
            <button
              key={r.doctorId}
              onClick={() => applyRecord(r)}
              className={`text-sm px-4 py-2 rounded-lg border transition-all ${selected?.doctorId === r.doctorId ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}
            >
              {r.doctorName || r.doctorId}
            </button>
          ))}
        </div>
      )}

      {/* Top-level messages */}
      <Card>
        <CardHeader title="Core Messages" subtitle="Key messages spoken by the AI bot" />
        <div className="mb-5 rounded-lg border border-sky-100 bg-sky-50 p-4 dark:border-sky-900/50 dark:bg-sky-950/30">
          <div className="mb-3 flex flex-col gap-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Prompt Language Presets</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a language to fill every prompt below. STT and TTS provider language codes stay separate in AI Providers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PROMPT_LANGUAGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyLanguagePreset(preset)}
                title={preset.description}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedPresetId === preset.id
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Current prompt language: <span className="font-semibold">{promptLanguage}</span>
          </p>
        </div>
        <div className="space-y-5">
          {TOP_LEVEL.map(({ key, label, description }) => (
            <div key={key as string}>
              <label className="block text-xs font-medium text-slate-700 mb-0.5">{label}</label>
              <p className="text-[11px] text-slate-400 mb-1.5">{description}</p>
              <textarea
                id={`prompt-${key as string}`}
                rows={2}
                value={(topLevel[key] as string) ?? ""}
                onChange={(e) => setTopLevel((t) => ({ ...t, [key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Conversation prompts */}
      <Card>
        <CardHeader title="Conversation Flow Prompts" subtitle="Messages used during the booking flow" />
        <div className="space-y-5">
          {PROMPT_FIELDS.map(({ key, label, description }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-700 mb-0.5">{label}</label>
              <p className="text-[11px] text-slate-400 mb-1.5">{description}</p>
              <textarea
                id={`prompt-${key}`}
                rows={2}
                value={(prompts[key] as string) ?? ""}
                onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-between bg-white border border-slate-200 rounded-xl shadow-card px-5 py-3">
        <div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 font-medium">✓ Prompts saved successfully</p>}
        </div>
        <Button id="save-prompts" variant="primary" loading={saving} onClick={handleSave}>
          Save Prompts
        </Button>
      </div>
    </div>
  );
}
