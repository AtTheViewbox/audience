export const QUESTION_TYPES = {
  FREE_RESPONSE: "free_response",
  MCQ: "mcq",
};

export function defaultMcqOptions() {
  return { choices: ["", ""], correctIndex: 0 };
}

export function normalizeMcqOptions(raw) {
  if (!raw || typeof raw !== "object") return defaultMcqOptions();
  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((c) => String(c ?? ""))
    : ["", ""];
  while (choices.length < 2) choices.push("");
  const correctIndex = Number.isInteger(raw.correctIndex) ? raw.correctIndex : 0;
  return {
    choices,
    correctIndex: Math.min(Math.max(correctIndex, 0), choices.length - 1),
  };
}

export function questionTypeLabel(type) {
  return type === QUESTION_TYPES.MCQ ? "Multiple choice" : "Free response";
}

export function isMcqQuestion(q) {
  return q?.question_type === QUESTION_TYPES.MCQ;
}

export function formatMcqAnswer(q) {
  const opts = normalizeMcqOptions(q?.options);
  const idx = opts.correctIndex;
  const letter = String.fromCharCode(65 + idx);
  const text = opts.choices[idx]?.trim();
  return text ? `${letter}. ${text}` : letter;
}
