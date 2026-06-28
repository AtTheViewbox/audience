import { useContext, useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus,
  Trash2,
  SquareDashedMousePointer,
  Eye,
  Pencil,
  X,
  Check,
  GripVertical,
  ListChecks,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import {
  isCaseLinked,
  buildAnnotationInsert,
  applyAnnotationCaseFilter,
} from "../lib/answerKeyCase.js";
import { restoreBoxRows, removeBoxRowFromCanvas } from "../lib/answerKeyBoxes.js";
import {
  QUESTION_TYPES,
  defaultMcqOptions,
  normalizeMcqOptions,
  questionTypeLabel,
  isMcqQuestion,
  formatMcqAnswer,
} from "../lib/questionTypes.js";
import QuestionAnswerPanel from "./QuestionAnswerPanel.jsx";
import QuestionSlideCarousel from "./QuestionSlideCarousel.jsx";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

function TypeToggle({ value, onChange, disabled }) {
  return (
    <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100/80 dark:bg-slate-900/60">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(QUESTION_TYPES.FREE_RESPONSE)}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
          value === QUESTION_TYPES.FREE_RESPONSE
            ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Free response
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(QUESTION_TYPES.MCQ)}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
          value === QUESTION_TYPES.MCQ
            ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ListChecks className="h-3.5 w-3.5" />
        Multiple choice
      </button>
    </div>
  );
}

function McqEditor({ options, onChange, disabled }) {
  const opts = normalizeMcqOptions(options);

  const setChoice = (index, text) => {
    const choices = [...opts.choices];
    choices[index] = text;
    onChange({ ...opts, choices });
  };

  const setCorrect = (index) => {
    onChange({ ...opts, correctIndex: index });
  };

  const addChoice = () => {
    onChange({ ...opts, choices: [...opts.choices, ""] });
  };

  const removeChoice = (index) => {
    if (opts.choices.length <= 2) return;
    const choices = opts.choices.filter((_, i) => i !== index);
    let correctIndex = opts.correctIndex;
    if (correctIndex >= choices.length) correctIndex = choices.length - 1;
    if (correctIndex === index) correctIndex = 0;
    else if (correctIndex > index) correctIndex -= 1;
    onChange({ choices, correctIndex });
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Choices — click letter to mark correct</Label>
      {opts.choices.map((choice, i) => {
        const letter = String.fromCharCode(65 + i);
        const isCorrect = opts.correctIndex === i;
        return (
          <div key={i} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setCorrect(i)}
              title="Mark as correct answer"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold transition-colors",
                isCorrect
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300"
              )}
            >
              {letter}
            </button>
            <Input
              value={choice}
              onChange={(e) => setChoice(i, e.target.value)}
              placeholder={`Option ${letter}`}
              disabled={disabled}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              disabled={disabled || opts.choices.length <= 2}
              onClick={() => removeChoice(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={disabled || opts.choices.length >= 8}
        onClick={addChoice}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add option
      </Button>
    </div>
  );
}

function AnnotationTab() {
  const {
    studyId,
    dicomSeriesId,
    caseUrlKey,
    renderingEngine,
    sessionId,
    sessionMeta,
  } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;

  const caseLink = { studyId, dicomSeriesId, caseUrlKey };
  const linked = isCaseLinked(caseLink);
  const isSessionOwner = sessionId && userData && sessionMeta?.owner === userData.id;
  const isParticipant = sessionId && !isSessionOwner;

  const [boxAnswers, setBoxAnswers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [questionType, setQuestionType] = useState(QUESTION_TYPES.FREE_RESPONSE);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [mcqOptions, setMcqOptions] = useState(defaultMcqOptions());

  const [editingId, setEditingId] = useState(null);
  const [editQuestionType, setEditQuestionType] = useState(QUESTION_TYPES.FREE_RESPONSE);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editMcqOptions, setEditMcqOptions] = useState(defaultMcqOptions());

  const fetchAll = useCallback(async () => {
    if (!supabaseClient || !linked || !userData?.id) return;
    setLoading(true);
    try {
      let query = supabaseClient
        .from("series_annotations")
        .select("*")
        .order("created_at", { ascending: true });
      query = applyAnnotationCaseFilter(query, {
        ...caseLink,
        userId: userData.id,
      });
      if (!query) return;

      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];
      setBoxAnswers(rows.filter((r) => r.kind === "box"));
      setQuestions(rows.filter((r) => r.kind === "question"));
    } catch (e) {
      console.error("Failed to load annotate/answer:", e);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, studyId, dicomSeriesId, caseUrlKey, linked, userData?.id]);

  useEffect(() => {
    if (!isParticipant) fetchAll();
  }, [fetchAll, isParticipant]);

  const resetQuestionForm = () => {
    setQuestionText("");
    setAnswerText("");
    setQuestionType(QUESTION_TYPES.FREE_RESPONSE);
    setMcqOptions(defaultMcqOptions());
  };

  const activateDraw = () => {
    dispatch({ type: "set_answer_key_authoring", payload: true });
    dispatch({ type: "select_tool", payload: "annotate" });
    toast.info("Close this dialog and draw boxes on the image. Each box is saved automatically.", {
      duration: 3500,
    });
  };

  const handleLoadBoxes = (boxAnswer) => {
    try {
      if (!renderingEngine) {
        toast.error("Viewer not ready");
        return;
      }
      restoreBoxRows(renderingEngine, [boxAnswer]);
      toast.success("Loaded answer boxes onto the viewer");
    } catch (e) {
      console.error("Failed to load boxes:", e);
      toast.error("Failed to load boxes");
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabaseClient
        .from("series_annotations")
        .delete()
        .eq("id", id);
      if (error) throw error;
      removeBoxRowFromCanvas(renderingEngine, id);
      dispatch({ type: "remove_persisted_answer_box", payload: id });
      await fetchAll();
    } catch (e) {
      console.error("Failed to delete:", e);
      toast.error("Failed to delete");
    }
  };

  const validateMcq = (opts) => {
    const normalized = normalizeMcqOptions(opts);
    const filled = normalized.choices.filter((c) => c.trim()).length;
    if (filled < 2) {
      toast.info("Add at least two choice options", { duration: 2000 });
      return null;
    }
    return {
      choices: normalized.choices.map((c) => c.trim()),
      correctIndex: normalized.correctIndex,
    };
  };

  const handleAddQuestion = async () => {
    if (!linked) return;
    if (!questionText.trim()) {
      toast.info("Enter a question first", { duration: 2000 });
      return;
    }

    let options = null;
    let answer = null;

    if (questionType === QUESTION_TYPES.MCQ) {
      options = validateMcq(mcqOptions);
      if (!options) return;
    } else {
      answer = answerText.trim() || null;
    }

    try {
      setSaving(true);
      const { error } = await supabaseClient.from("series_annotations").insert(
        buildAnnotationInsert({
          ...caseLink,
          userId: userData.id,
          fields: {
            kind: "question",
            question_type: questionType,
            question: questionText.trim(),
            answer,
            options,
          },
        })
      );
      if (error) throw error;
      resetQuestionForm();
      toast.success("Question added");
      await fetchAll();
    } catch (e) {
      console.error("Failed to add question:", e);
      toast.error("Failed to add question");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditQuestionType(q.question_type || QUESTION_TYPES.FREE_RESPONSE);
    setEditQuestion(q.question || "");
    setEditAnswer(q.answer || "");
    setEditMcqOptions(normalizeMcqOptions(q.options));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditQuestion("");
    setEditAnswer("");
    setEditMcqOptions(defaultMcqOptions());
  };

  const handleUpdateQuestion = async (id) => {
    if (!editQuestion.trim()) {
      toast.info("Question cannot be empty", { duration: 2000 });
      return;
    }

    let options = null;
    let answer = null;

    if (editQuestionType === QUESTION_TYPES.MCQ) {
      options = validateMcq(editMcqOptions);
      if (!options) return;
    } else {
      answer = editAnswer.trim() || null;
    }

    try {
      setSaving(true);
      const { error } = await supabaseClient
        .from("series_annotations")
        .update({
          question_type: editQuestionType,
          question: editQuestion.trim(),
          answer,
          options,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      cancelEdit();
      await fetchAll();
    } catch (e) {
      console.error("Failed to update question:", e);
      toast.error("Failed to update question");
    } finally {
      setSaving(false);
    }
  };

  const questionSlides = useMemo(
    () =>
      questions.map((q, idx) => (
        <div
          key={q.id}
          className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5"
        >
          {editingId === q.id ? (
            <div className="space-y-3">
              <TypeToggle
                value={editQuestionType}
                onChange={setEditQuestionType}
                disabled={saving}
              />
              <Input
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                placeholder="Question"
              />
              {editQuestionType === QUESTION_TYPES.MCQ ? (
                <McqEditor
                  options={editMcqOptions}
                  onChange={setEditMcqOptions}
                  disabled={saving}
                />
              ) : (
                <Textarea
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value)}
                  placeholder="Expected answer (optional)"
                  rows={2}
                />
              )}
              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEdit}>
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  className="h-8 w-8"
                  disabled={saving}
                  onClick={() => handleUpdateQuestion(q.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium break-words">
                    {idx + 1}. {q.question}
                  </p>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {questionTypeLabel(q.question_type || QUESTION_TYPES.FREE_RESPONSE)}
                  </Badge>
                </div>
                {isMcqQuestion(q) ? (
                  <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    {normalizeMcqOptions(q.options).choices.map((c, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <GripVertical className="h-3 w-3 opacity-40" />
                        <span
                          className={cn(
                            normalizeMcqOptions(q.options).correctIndex === i &&
                              "text-emerald-600 dark:text-emerald-400 font-medium"
                          )}
                        >
                          {String.fromCharCode(65 + i)}. {c}
                          {normalizeMcqOptions(q.options).correctIndex === i && " ✓"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  q.answer && (
                    <p className="text-xs text-muted-foreground break-words">{q.answer}</p>
                  )
                )}
                {isMcqQuestion(q) && !q.options?.choices?.some(Boolean) && q.answer && (
                  <p className="text-xs text-muted-foreground">{formatMcqAnswer(q)}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(q)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(q.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )),
    [
      questions,
      editingId,
      editQuestionType,
      editQuestion,
      editAnswer,
      editMcqOptions,
      saving,
    ]
  );

  if (isParticipant) {
    return (
      <Card>
        <CardContent className="pt-3">
          <QuestionAnswerPanel />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-3 max-h-[min(calc(100dvh-9rem),560px)] overflow-y-auto overscroll-contain space-y-3">
        {!linked && (
          <p className="text-xs text-muted-foreground">
            Link this case via the viewer URL (vd.*) or save it in Your Viewbox.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium">Bounding boxes</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!linked}
            onClick={activateDraw}
          >
            <SquareDashedMousePointer className="h-4 w-4 mr-1.5" />
            Draw
          </Button>
        </div>

        {boxAnswers.length === 0 ? (
          <p className="text-xs text-muted-foreground -mt-1">
            Draw on the image after closing this dialog — each box saves automatically.
          </p>
        ) : (
          <div className="space-y-1.5">
            {boxAnswers.map((b, idx) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
              >
                <span className="text-sm">
                  Box #{idx + 1}
                  <span className="text-xs text-muted-foreground ml-2">
                    {(b.boxes || []).length} box{(b.boxes || []).length !== 1 ? "es" : ""}
                  </span>
                </span>
                <div className="flex gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleLoadBoxes(b)}
                    title="Load onto viewer"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(b.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {questions.length > 0 ? (
          <QuestionSlideCarousel slides={questionSlides} compact />
        ) : (
          <p className="text-xs text-muted-foreground">No questions yet.</p>
        )}

        <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <TypeToggle
            value={questionType}
            onChange={setQuestionType}
            disabled={!linked || saving}
          />
          <Input
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="Question prompt"
            disabled={!linked}
          />
          {questionType === QUESTION_TYPES.MCQ ? (
            <McqEditor options={mcqOptions} onChange={setMcqOptions} disabled={!linked || saving} />
          ) : (
            <Textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Expected answer (optional)"
              rows={2}
              disabled={!linked}
            />
          )}
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!linked || saving} onClick={handleAddQuestion}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add question
            </Button>
          </div>
        </div>

        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
      </CardContent>
    </Card>
  );
}

export default AnnotationTab;
