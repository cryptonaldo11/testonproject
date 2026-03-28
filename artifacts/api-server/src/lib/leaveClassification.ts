export type LeaveReasonClassification = {
  classification: string;
  confidence: string;
};

export type LeaveReasonClassifier = (reason: string) => LeaveReasonClassification;

type Rule = {
  classification: string;
  keywords: string[];
  baseConfidence: number;
};

const RULES: Rule[] = [
  {
    classification: "medical",
    keywords: [
      "medical",
      "doctor",
      "clinic",
      "hospital",
      "fever",
      "flu",
      "sick",
      "ill",
      "appointment",
      "mc",
      "surgery",
      "treatment",
      "dentist",
    ],
    baseConfidence: 0.88,
  },
  {
    classification: "bereavement",
    keywords: [
      "bereavement",
      "funeral",
      "passed away",
      "death",
      "mourning",
      "condolence",
      "late father",
      "late mother",
      "late relative",
    ],
    baseConfidence: 0.94,
  },
  {
    classification: "emergency",
    keywords: [
      "emergency",
      "urgent",
      "accident",
      "unexpected",
      "immediate",
      "crisis",
      "hospitalized",
      "family emergency",
    ],
    baseConfidence: 0.91,
  },
  {
    classification: "family",
    keywords: [
      "family",
      "child",
      "children",
      "parent",
      "parents",
      "spouse",
      "wife",
      "husband",
      "mother",
      "father",
      "relative",
      "wedding",
      "caregiving",
      "care giver",
    ],
    baseConfidence: 0.82,
  },
  {
    classification: "personal",
    keywords: [
      "personal",
      "errand",
      "appointment",
      "moving",
      "travel",
      "rest",
      "mental health",
      "wellbeing",
      "well-being",
      "private",
      "personal matter",
    ],
    baseConfidence: 0.76,
  },
];

function classifyLeaveReasonWithRules(reason: string): LeaveReasonClassification {
  const normalized = reason.trim().toLowerCase();

  if (!normalized) {
    return { classification: "unclassified", confidence: "0.10" };
  }

  let bestMatch: { classification: string; score: number; confidence: number } | null = null;

  for (const rule of RULES) {
    const matches = rule.keywords.filter((keyword) => normalized.includes(keyword)).length;
    if (matches === 0) continue;

    const score = matches;
    const confidence = Math.min(0.99, rule.baseConfidence + matches * 0.02);

    if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && confidence > bestMatch.confidence)) {
      bestMatch = {
        classification: rule.classification,
        score,
        confidence,
      };
    }
  }

  if (!bestMatch || bestMatch.confidence < 0.7) {
    return { classification: "unclassified", confidence: "0.35" };
  }

  return {
    classification: bestMatch.classification,
    confidence: bestMatch.confidence.toFixed(2),
  };
}

let activeLeaveReasonClassifier: LeaveReasonClassifier = classifyLeaveReasonWithRules;

export function setLeaveReasonClassifier(classifier: LeaveReasonClassifier) {
  activeLeaveReasonClassifier = classifier;
}

export function classifyLeaveReason(reason: string): LeaveReasonClassification {
  return activeLeaveReasonClassifier(reason);
}
