'use client';

import { useState } from 'react';
import { CheckCircle, Star } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import toast from 'react-hot-toast';

interface FeedbackFormProps {
  sessionId: string;
  participantId: string;
  participantName: string;
  onFeedbackSubmitted: () => void;
}

export function FeedbackForm({ 
  sessionId, 
  participantId,
  onFeedbackSubmitted 
}: FeedbackFormProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [mostValuable, setMostValuable] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (rating === 0) {
      newErrors.rating = 'Please provide a rating';
    }

    if (!feedback.trim()) {
      newErrors.feedback = 'Please share your feedback';
    } else if (feedback.trim().length < 10) {
      newErrors.feedback = 'Please provide at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          participantId,
          rating,
          feedback: feedback.trim(),
          mostValuable: mostValuable.trim() || null,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      toast.success('Thank you for your feedback!');
      setIsSubmitting(false);
      onFeedbackSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit feedback');
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Before you take your prompt pack
          </h2>
          <p className="text-gray-600">
            Share a quick reflection on what worked for you so we can make the next workshop even better.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Overall Rating <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} out of 5`}
                  onClick={() => {
                    setRating(star);
                    setErrors({ ...errors, rating: '' });
                  }}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-center text-sm text-gray-600 mt-2">
                {rating === 5 && 'Excellent! 🎉'}
                {rating === 4 && 'Great! 👍'}
                {rating === 3 && 'Good 👌'}
                {rating === 2 && 'Fair'}
                {rating === 1 && 'Needs improvement'}
              </p>
            )}
            {errors.rating && (
              <p className="text-sm text-red-600 text-center mt-2">{errors.rating}</p>
            )}
          </div>

          {/* Feedback */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What did you think of the workshop? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => {
                setFeedback(e.target.value);
                setErrors({ ...errors, feedback: '' });
              }}
              placeholder="Share your thoughts, what you learned, or suggestions for improvement..."
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white/70 ${
                errors.feedback ? 'border-red-500' : 'border-white/40'
              }`}
              rows={4}
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-sm text-gray-500">
                {feedback.length} characters (minimum 10)
              </p>
              {errors.feedback && (
                <p className="text-sm text-red-600">{errors.feedback}</p>
              )}
            </div>
          </div>

          {/* Most Valuable (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What was most valuable to you? (Optional)
            </label>
            <textarea
              value={mostValuable}
              onChange={(e) => setMostValuable(e.target.value)}
              placeholder="e.g., specific prompts, techniques, examples..."
              className="w-full px-4 py-3 border border-white/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white/70"
              rows={3}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-12"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            {!isSubmitting && (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Save Reflection & Open Prompt Pack
              </>
            )}
          </Button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          Your feedback helps us improve future workshops
        </p>
      </CardContent>
    </Card>
  );
}
