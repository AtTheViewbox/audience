import { isCaseLinked, applyQuestionCaseFilter } from "./answerKeyCase.js";
import { isDemoMode, getDemoQuestions } from "./demoCase.js";

/** Load host answer-key content visible to participants in a share session. */
export async function fetchHostAnswerContent(supabaseClient, caseLink, authorId) {
  if (isDemoMode()) {
    const questions = getDemoQuestions();
    return { questions, hasBoxAnswers: true, hasContent: true };
  }

  if (!supabaseClient || !authorId || !isCaseLinked(caseLink)) {
    return { questions: [], hasBoxAnswers: false, hasContent: false };
  }

  let questions = [];
  let hasBoxAnswers = false;

  try {
    let qQuery = supabaseClient
      .from("series_annotations")
      .select("*")
      .eq("kind", "question")
      .order("created_at", { ascending: true });
    qQuery = applyQuestionCaseFilter(qQuery, { ...caseLink, authorId });
    if (qQuery) {
      const { data, error } = await qQuery;
      if (!error) questions = data || [];
    }
  } catch (e) {
    console.error("Failed to load host questions:", e);
  }

  try {
    let bQuery = supabaseClient
      .from("series_annotations")
      .select("id", { count: "exact", head: true })
      .eq("kind", "box");
    bQuery = applyQuestionCaseFilter(bQuery, { ...caseLink, authorId });
    if (bQuery) {
      const { count, error } = await bQuery;
      if (!error && count > 0) hasBoxAnswers = true;
    }
  } catch {
    // Box rows are owner-only unless RLS allows count; questions alone still gate the UI.
  }

  const hasContent = questions.length > 0 || hasBoxAnswers;
  return { questions, hasBoxAnswers, hasContent };
}
