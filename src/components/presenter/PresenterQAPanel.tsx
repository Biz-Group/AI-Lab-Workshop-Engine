'use client';

import { memo, useState } from 'react';
import { ChevronDown as ChevDown, MessageCircle, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PresenterQuestion {
  id: string;
  participant_name: string;
  question_text: string;
  answer_text: string | null;
  is_answered: boolean;
  created_at: string;
}

interface PresenterQAPanelProps {
  questions: PresenterQuestion[];
  onAnswerQuestion: (questionId: string, answerText: string) => Promise<boolean>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
}

export const PresenterQAPanel = memo(function PresenterQAPanel({
  questions,
  onAnswerQuestion,
  onDeleteQuestion,
}: PresenterQAPanelProps) {
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [showAnswered, setShowAnswered] = useState(false);

  const unansweredQuestions = questions.filter((question) => !question.is_answered);
  const answeredQuestions = questions.filter((question) => question.is_answered);

  const handleAnswerSubmit = async (questionId: string) => {
    const answerText = answerDrafts[questionId]?.trim();
    if (!answerText) return;

    const success = await onAnswerQuestion(questionId, answerText);
    if (!success) return;

    setAnswerDrafts((previous) => {
      const next = { ...previous };
      delete next[questionId];
      return next;
    });
  };

  return (
    <div className="mt-5 border-t border-gray-700 pt-4 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          Q&A
          {unansweredQuestions.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {unansweredQuestions.length}
            </span>
          )}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {unansweredQuestions.length === 0 && answeredQuestions.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No questions yet</p>
        ) : (
          <>
            {unansweredQuestions.map((question) => (
              <div key={question.id} className="bg-gray-700 rounded-lg p-3 border border-amber-500/30">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-brand-400">{question.participant_name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">
                      {new Date(question.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => {
                        void onDeleteQuestion(question.id);
                      }}
                      className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                      title="Remove question"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-200 mb-2">{question.question_text}</p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={answerDrafts[question.id] || ''}
                    onChange={(event) =>
                      setAnswerDrafts((previous) => ({
                        ...previous,
                        [question.id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleAnswerSubmit(question.id);
                      }
                    }}
                    placeholder="Type answer..."
                    className="flex-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-xs text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => {
                      void handleAnswerSubmit(question.id);
                    }}
                    disabled={!answerDrafts[question.id]?.trim()}
                    className="p-1 bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-40 transition-colors"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {answeredQuestions.length > 0 && (
              <div>
                <button
                  onClick={() => setShowAnswered((previous) => !previous)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 transition-colors py-1"
                >
                  <ChevDown className={cn('w-3 h-3 transition-transform', showAnswered && 'rotate-180')} />
                  Answered ({answeredQuestions.length})
                </button>
                {showAnswered && (
                  <div className="space-y-2 mt-1">
                    {answeredQuestions.map((question) => (
                      <div key={question.id} className="bg-gray-700/50 rounded-lg p-2.5 border border-green-500/20">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <span className="text-xs text-gray-400">{question.participant_name}</span>
                          <button
                            onClick={() => {
                              void onDeleteQuestion(question.id);
                            }}
                            className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-300 mb-1">{question.question_text}</p>
                        <p className="text-xs text-green-400">Answer: {question.answer_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
