import { isMcqQuestion, normalizeMcqOptions } from "./questionTypes.js";

/** Rank participants by MCQ correctness (requires question definitions). */
export function computeMcqLeaderboard(questions, submittedQuestionAnswers) {
  const mcqQuestions = (questions || []).filter(isMcqQuestion);
  if (mcqQuestions.length === 0) return [];

  return Object.entries(submittedQuestionAnswers || {})
    .map(([userId, sub]) => {
      let score = 0;
      let answeredMcq = 0;
      for (const q of mcqQuestions) {
        const ans = sub.answers?.[q.id];
        if (ans?.selectedIndex == null) continue;
        answeredMcq++;
        const opts = normalizeMcqOptions(q.options);
        if (ans.selectedIndex === opts.correctIndex) score++;
      }
      const anyAnswers = Object.keys(sub.answers || {}).length > 0;
      return {
        userId,
        userName: sub.userName || "Anonymous",
        score,
        total: mcqQuestions.length,
        answeredMcq,
        anyAnswers,
      };
    })
    .filter((e) => e.answeredMcq > 0 || e.anyAnswers)
    .sort((a, b) => b.score - a.score || b.answeredMcq - a.answeredMcq);
}

/** Rank by how many questions each participant answered (no correctness). */
export function computeParticipationLeaderboard(questions, submittedQuestionAnswers) {
  return Object.entries(submittedQuestionAnswers || {})
    .map(([userId, sub]) => {
      const answers = sub.answers || {};
      const answered = (questions || []).filter((q) => answers[q.id]).length;
      return {
        userId,
        userName: sub.userName || "Anonymous",
        answered,
        total: questions?.length || 0,
      };
    })
    .filter((e) => e.answered > 0)
    .sort((a, b) => b.answered - a.answered);
}

export function formatMcqAnswerLabel(question, selectedIndex) {
  if (selectedIndex == null) return "—";
  const opts = normalizeMcqOptions(question.options);
  const letter = String.fromCharCode(65 + selectedIndex);
  const text = opts.choices[selectedIndex]?.trim();
  return text ? `${letter}. ${text}` : letter;
}
