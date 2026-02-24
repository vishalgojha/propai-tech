export type ResaleTemplateCategory = "UTILITY" | "MARKETING";

export type ResaleTemplate = {
  name: string;
  summary: string;
  category: ResaleTemplateCategory;
  body: string;
  quickReplies: string[];
};

export type ResaleTemplateLanguage = "en" | "hi";

export type ResaleNurtureStep = {
  offsetDays: number;
  templateName: string;
  language: ResaleTemplateLanguage;
  category: "utility" | "marketing";
};

export type ResaleNurtureBucket = {
  id: "recent_0_6" | "warm_7_30" | "older_30_plus";
  label: string;
  description: string;
  steps: ResaleNurtureStep[];
};

export const RESALE_SYSTEM_PROMPT = `You are a domain-tuned WhatsApp assistant for Indian real-estate resale brokers.

Hard scope:
- ONLY resale inventory workflows: budget, BHK, area, timeline, brochure request, site visit booking, loan query, negotiation, rejection.
- Ignore/decline out-of-scope topics (stocks, coding, medicine, legal advice, politics, memes).
- Focus on tier-1/2 city resale contexts in India (Mumbai, Pune, Bangalore, Delhi-NCR, Hyderabad, Ahmedabad).

Language style:
- Natural India sales tone.
- If user message is in Hindi/Hinglish, respond in Hindi-Hinglish.
- If user message is in English, respond in concise English.
- Avoid robotic/translated wording.

Memory extraction (when available in text):
- name
- phone
- budget_min
- budget_max
- preferred_bhk
- preferred_area
- timeline_months
- last_intent
- lead_score (hot/warm/cold)
- notes

Allowed action policy:
- send template only when template action is appropriate.
- for interactive clarification use button-based message.
- schedule follow-ups in 1/3/7/14 day cadence.
- tag lead by funnel stage.
- escalate to human when confidence low, legal risk high, or negotiation becomes sensitive.

High-risk guardrail:
- If request involves money transfer, legal documents, agreements, token payment, or any external API/account action, require explicit approval.
- Never claim execution unless an action is emitted and approved.

Always optimize for first 48h impact:
- re-engagement reply
- qualification completion
- brochure/site visit conversion`;

export const RESALE_TEMPLATES: Record<ResaleTemplateLanguage, ResaleTemplate[]> = {
  en: [
    {
      name: "resale_instant_welcome_qualify_en",
      summary: "Instant inbound welcome + qualification",
      category: "UTILITY",
      body: "Hi {{1}}! You had asked about {{2}}. Could you share your budget and when you plan to buy?",
      quickReplies: ["Share Budget", "Need Call", "Not Now"]
    },
    {
      name: "resale_day1_followup_en",
      summary: "Day-1 stale lead re-engagement",
      category: "MARKETING",
      body: "Hi {{1}}, you had checked {{3}} in {{2}}. Still interested? We have fresh resale options matching your budget.",
      quickReplies: ["Send Brochure", "Site Visit", "Not Interested"]
    },
    {
      name: "resale_day3_market_update_en",
      summary: "Market pulse + soft nudge",
      category: "MARKETING",
      body: "Quick update, {{1}}: resale prices in {{2}} moved this week. Want latest options in {{3}} around your budget?",
      quickReplies: ["Yes Share", "Need Call", "Later"]
    },
    {
      name: "resale_post_brochure_nudge_en",
      summary: "Brochure follow-up",
      category: "UTILITY",
      body: "Hi {{1}}, did you get a chance to review the brochure? I can help shortlist options and schedule a site visit.",
      quickReplies: ["Book Visit", "Ask Question", "Need Time"]
    },
    {
      name: "resale_price_drop_alert_en",
      summary: "Urgency / price-drop trigger",
      category: "MARKETING",
      body: "Good news! Similar unit in {{2}} is available at lower pricing now. Want details before it gets blocked?",
      quickReplies: ["Send Details", "Call Me", "Skip"]
    },
    {
      name: "resale_site_visit_confirm_en",
      summary: "Site visit confirmation with maps",
      category: "UTILITY",
      body: "Your site visit is confirmed for {{2}} at {{3}}. Location: {{4}}. Please reply if you need reschedule.",
      quickReplies: ["On Time", "Reschedule", "Need Call"]
    },
    {
      name: "resale_site_visit_reminder_en",
      summary: "Visit reminder",
      category: "UTILITY",
      body: "Reminder: site visit today at {{3}} for {{2}}. Ping me when you start, I will coordinate.",
      quickReplies: ["Starting", "Delay 30m", "Cancel"]
    },
    {
      name: "resale_post_visit_feedback_en",
      summary: "Post-visit feedback + next step",
      category: "UTILITY",
      body: "Thanks for visiting, {{1}}. How did you like the property? I can help with negotiation or loan assistance.",
      quickReplies: ["Negotiate", "Loan Help", "Show More"]
    },
    {
      name: "resale_loan_assist_en",
      summary: "Loan support follow-up",
      category: "UTILITY",
      body: "If needed, I can connect you with bank partners for quick eligibility checks and EMI estimates.",
      quickReplies: ["Check Eligibility", "Share EMI", "Not Needed"]
    },
    {
      name: "resale_reopen_30plus_en",
      summary: "30+ day soft re-open",
      category: "MARKETING",
      body: "Hi {{1}}, it has been a while. If your requirement is still open, I can share 2-3 resale options in {{2}} matching {{3}}.",
      quickReplies: ["Share Options", "Call Later", "Closed"]
    }
  ],
  hi: [
    {
      name: "resale_instant_welcome_qualify_hi",
      summary: "नया इनबाउंड लीड स्वागत + क्वालिफिकेशन",
      category: "UTILITY",
      body: "नमस्ते {{1}}! आपने {{2}} के बारे में पूछा था। आपका बजट कितना है और कब तक खरीदने का प्लान है?",
      quickReplies: ["बजट बताऊं", "कॉल चाहिए", "अभी नहीं"]
    },
    {
      name: "resale_day1_followup_hi",
      summary: "Day-1 stale lead re-engagement",
      category: "MARKETING",
      body: "हाय {{1}}, आपने {{2}} में {{3}} देखा था। अभी भी इंटरेस्ट है? आपके बजट में नई रीसेल लिस्टिंग आई है।",
      quickReplies: ["ब्रोशर भेजो", "साइट विजिट", "इंटरेस्ट नहीं"]
    },
    {
      name: "resale_day3_market_update_hi",
      summary: "मार्केट अपडेट + हल्का नज",
      category: "MARKETING",
      body: "{{1}} जी, {{2}} रीसेल मार्केट में इस हफ्ते अच्छी डील्स आई हैं। {{3}} में आपकी रेंज के ऑप्शंस भेजूं?",
      quickReplies: ["हाँ भेजो", "कॉल करो", "बाद में"]
    },
    {
      name: "resale_post_brochure_nudge_hi",
      summary: "ब्रोशर देखने के बाद follow-up",
      category: "UTILITY",
      body: "{{1}} जी, ब्रोशर देख लिया? कोई सवाल हो तो बताइए। चाहें तो साइट विजिट भी फिक्स कर देते हैं।",
      quickReplies: ["विजिट फिक्स करो", "सवाल है", "थोड़ा समय"]
    },
    {
      name: "resale_price_drop_alert_hi",
      summary: "Urgency / price drop",
      category: "MARKETING",
      body: "अच्छी खबर! {{2}} में इसी तरह का फ्लैट अभी कम कीमत पर उपलब्ध है। डिटेल भेजूं?",
      quickReplies: ["डिटेल भेजो", "कॉल करो", "स्किप"]
    },
    {
      name: "resale_site_visit_confirm_hi",
      summary: "साइट विजिट कन्फर्मेशन + मैप लिंक",
      category: "UTILITY",
      body: "आपकी साइट विजिट {{2}} को {{3}} पर कन्फर्म है। लोकेशन: {{4}}। रीशेड्यूल चाहिए तो बताइए।",
      quickReplies: ["टाइम ठीक है", "रीशेड्यूल", "कॉल चाहिए"]
    },
    {
      name: "resale_site_visit_reminder_hi",
      summary: "साइट विजिट रिमाइंडर",
      category: "UTILITY",
      body: "रिमाइंडर: आज {{3}} बजे {{2}} का साइट विजिट है। निकलते समय एक मैसेज कर दीजिए।",
      quickReplies: ["निकल रहा हूँ", "30 मिनट लेट", "कैंसल"]
    },
    {
      name: "resale_post_visit_feedback_hi",
      summary: "पोस्ट विजिट फीडबैक + नेक्स्ट स्टेप",
      category: "UTILITY",
      body: "विजिट के लिए धन्यवाद {{1}} जी। प्रॉपर्टी कैसी लगी? नेगोशिएशन या लोन हेल्प चाहिए तो मैं मदद कर सकता हूँ।",
      quickReplies: ["नेगोशिएशन", "लोन हेल्प", "और विकल्प"]
    },
    {
      name: "resale_loan_assist_hi",
      summary: "लोन असिस्टेंस संदेश",
      category: "UTILITY",
      body: "अगर चाहें तो मैं बैंक पार्टनर्स से EMI और eligibility चेक जल्दी करवा सकता हूँ।",
      quickReplies: ["Eligibility चेक", "EMI बताओ", "जरूरत नहीं"]
    },
    {
      name: "resale_reopen_30plus_hi",
      summary: "30+ दिन पुराने लीड का soft re-open",
      category: "MARKETING",
      body: "नमस्ते {{1}} जी, काफी समय हो गया। अगर requirement अभी भी open है तो {{2}} में {{3}} के 2-3 अच्छे रीसेल ऑप्शंस भेज दूं?",
      quickReplies: ["ऑप्शंस भेजो", "बाद में कॉल", "क्लोज हो गया"]
    }
  ]
};

export const RESALE_NURTURE_BUCKETS: ResaleNurtureBucket[] = [
  {
    id: "recent_0_6",
    label: "Recent (<7 days)",
    description: "Light qualification nudge for fresh/warm conversations.",
    steps: [
      {
        offsetDays: 0,
        templateName: "resale_instant_welcome_qualify_hi",
        language: "hi",
        category: "utility"
      },
      {
        offsetDays: 1,
        templateName: "resale_day1_followup_hi",
        language: "hi",
        category: "marketing"
      },
      {
        offsetDays: 3,
        templateName: "resale_post_brochure_nudge_hi",
        language: "hi",
        category: "utility"
      }
    ]
  },
  {
    id: "warm_7_30",
    label: "Warm (7-30 days)",
    description: "Stronger re-engagement with fresh listing tease.",
    steps: [
      {
        offsetDays: 0,
        templateName: "resale_day1_followup_hi",
        language: "hi",
        category: "marketing"
      },
      {
        offsetDays: 3,
        templateName: "resale_day3_market_update_hi",
        language: "hi",
        category: "marketing"
      },
      {
        offsetDays: 7,
        templateName: "resale_price_drop_alert_hi",
        language: "hi",
        category: "marketing"
      }
    ]
  },
  {
    id: "older_30_plus",
    label: "Older (30+ days)",
    description: "Soft reopen with market update then urgency trigger.",
    steps: [
      {
        offsetDays: 0,
        templateName: "resale_reopen_30plus_hi",
        language: "hi",
        category: "marketing"
      },
      {
        offsetDays: 7,
        templateName: "resale_day3_market_update_hi",
        language: "hi",
        category: "marketing"
      },
      {
        offsetDays: 14,
        templateName: "resale_price_drop_alert_hi",
        language: "hi",
        category: "marketing"
      }
    ]
  }
];
