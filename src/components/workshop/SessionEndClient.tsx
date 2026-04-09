'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Download, Mail, CheckCircle, PartyPopper, ArrowLeft, BookOpen, Compass, FolderOpen } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { FeedbackForm } from './FeedbackForm';
import toast from 'react-hot-toast';

interface Submission {
  id: string;
  content: string;
  stepTitle: string;
  moduleTitle: string;
}

interface SessionEndClientProps {
  sessionId: string;
  organizationName: string;
  participantId: string;
  participantName: string;
  participantEmail: string | null;
  hasEmailConsent: boolean;
  feedbackSubmitted: boolean;
  submissions: Submission[];
}

export function SessionEndClient({
  sessionId,
  organizationName,
  participantId,
  participantName,
  participantEmail,
  hasEmailConsent,
  feedbackSubmitted: initialFeedbackSubmitted,
  submissions,
}: SessionEndClientProps) {
  const [email, setEmail] = useState(participantEmail || '');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(initialFeedbackSubmitted);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const submissionsByModule = useMemo(() => {
    const grouped = new Map<string, Submission[]>();
    for (const submission of submissions) {
      const existing = grouped.get(submission.moduleTitle) || [];
      existing.push(submission);
      grouped.set(submission.moduleTitle, existing);
    }
    return Array.from(grouped.entries()).map(([moduleTitle, moduleSubmissions]) => ({
      moduleTitle,
      submissions: moduleSubmissions,
    }));
  }, [submissions]);

  useEffect(() => {
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId,
        sessionId,
        eventType: 'session_end_viewed',
      }),
    });
  }, [participantId, sessionId]);

  const handleFeedbackSubmitted = () => {
    setFeedbackSubmitted(true);
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/api/pdf/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompt-pack-${participantName.toLowerCase().replace(/\s+/g, '-')}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setPdfDownloaded(true);
      toast.success('Prompt Pack downloaded!');

      // Log analytics
      await fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          sessionId,
          eventType: 'pdf_downloaded',
        }),
      });
    } catch {
      toast.error('Failed to download PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!email) {
      setEmailError('Please enter your email address');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setEmailError('');
    setIsEmailing(true);

    try {
      const response = await fetch('/api/email/prompt-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          sessionId,
          email,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to send email');
      }

      setEmailSent(true);
      toast.success('Prompt Pack sent to your email!');

      // Log analytics
      await fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          sessionId,
          eventType: 'email_sent',
        }),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsEmailing(false);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-4 backdrop-blur-sm">
            <PartyPopper className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Workshop Complete!
          </h1>
          <p className="text-white/80 max-w-2xl mx-auto">
            Great job, {participantName}. You&apos;ve reached the handoff point: reflect on the session,
            review what you created, and keep a copy of the prompt pack for your next real-world use.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4">
              <BookOpen className="w-5 h-5 text-brand-600 mb-2" />
              <h2 className="font-semibold text-gray-900 mb-1">1. Reflect</h2>
              <p className="text-sm text-gray-600">Capture what felt valuable while the workshop is still fresh.</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <FolderOpen className="w-5 h-5 text-brand-600 mb-2" />
              <h2 className="font-semibold text-gray-900 mb-1">2. Review what you made</h2>
              <p className="text-sm text-gray-600">See the outputs you created today grouped by chapter.</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <Compass className="w-5 h-5 text-brand-600 mb-2" />
              <h2 className="font-semibold text-gray-900 mb-1">3. Keep using it</h2>
              <p className="text-sm text-gray-600">Download or email the prompt pack so you can reuse it later.</p>
            </div>
          </CardContent>
        </Card>

        {/* Show Feedback Form if not submitted */}
        {!feedbackSubmitted && (
          <FeedbackForm
            sessionId={sessionId}
            participantId={participantId}
            participantName={participantName}
            onFeedbackSubmitted={handleFeedbackSubmitted}
          />
        )}

        {/* Show Prompt Pack sections only after feedback is submitted */}
        {feedbackSubmitted && (
          <>
            <Card className="mb-6">
              <CardContent className="p-6">
                <h2 className="font-semibold text-gray-900 mb-1">What you created today</h2>
                <p className="text-sm text-gray-600 mb-5">
                  Your work is grouped by chapter so it is easier to revisit and reuse later.
                </p>
                {submissionsByModule.length > 0 ? (
                  <div className="space-y-5">
                    {submissionsByModule.map((group) => (
                      <div key={group.moduleTitle}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-900">{group.moduleTitle}</h3>
                          <span className="text-xs text-gray-500">{group.submissions.length} saved</span>
                        </div>
                        <div className="space-y-3">
                          {group.submissions.map((sub) => (
                            <div key={sub.id} className="p-4 bg-gray-50 rounded-lg">
                              <div className="text-sm text-gray-500 mb-1">{sub.stepTitle}</div>
                              <p className="text-gray-700 font-mono text-sm whitespace-pre-wrap">
                                {sub.content.length > 200 ? `${sub.content.slice(0, 200)}...` : sub.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">
                    You did not save a submission during the workshop, but you can still keep the full prompt pack as a reusable reference for the exercises you worked through.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Submissions Summary */}
            {submissions.length > 0 ? (
              <Card className="mb-6">
                <CardContent className="p-6">
                  <h2 className="font-semibold text-gray-900 mb-4">
                    Full submission list ({submissions.length})
                  </h2>
                  <div className="space-y-4">
                    {submissions.map((sub) => (
                      <div 
                        key={sub.id}
                        className="p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="text-sm text-gray-500 mb-1">
                          {sub.moduleTitle} • {sub.stepTitle}
                        </div>
                        <p className="text-gray-700 font-mono text-sm whitespace-pre-wrap">
                          {sub.content.length > 200 
                            ? sub.content.slice(0, 200) + '...' 
                            : sub.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="mb-6">
                <CardContent className="p-6 text-center">
                  <p className="text-gray-600">
                    No prompts were submitted during the workshop — you can still download the template pack below.
                  </p>
                </CardContent>
              </Card>
            )}

        {/* Get Your Prompt Pack — unified card */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Get Your Prompt Pack</h2>
            <p className="text-sm text-gray-600 mb-5">
              Download or email a copy with your saved prompts, the workshop structure, and the takeaways you can build on next.
            </p>

            <div className="rounded-xl bg-gray-50 p-4 mb-5 text-sm text-gray-600">
              <p className="font-medium text-gray-900 mb-1">What&apos;s inside</p>
              <p>
                The prompt pack bundles your workshop outputs, the prompts you used, and a clean record you can return to after today.
                {!hasEmailConsent && ' You can still download it now even if you prefer not to receive it by email.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Download action */}
              <Button
                onClick={handleDownloadPDF}
                isLoading={isDownloading}
                variant={pdfDownloaded ? 'secondary' : 'primary'}
                className="flex-1"
              >
                {pdfDownloaded ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Downloaded
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </>
                )}
              </Button>

              {/* Email action */}
              {!emailSent ? (
                <div className="flex flex-1 gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError('');
                    }}
                    placeholder="your@email.com"
                    error={emailError}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendEmail}
                    isLoading={isEmailing}
                    variant="outline"
                    disabled={!email}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600 text-sm flex-1 justify-center">
                  <CheckCircle className="w-4 h-4" />
                  <span>Sent to {email}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Return Home */}
        <div className="text-center mt-8">
          <Image
            src="/biz-group-logo.webp"
            alt="Biz Group"
            width={48}
            height={48}
            className="mx-auto mb-3 rounded-lg"
          />
          <p className="text-white/70 mb-2">
            Thanks for joining the {organizationName} workshop!
          </p>
          <p className="text-white/50 text-xs mb-4">
            Powered by Biz Group &middot; Session data auto-deletes in 72 hours
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href={`/s/${sessionId}`}>
              <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Workshop
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
                Return to Home
              </Button>
            </Link>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
