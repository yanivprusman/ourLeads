'use client';

import { usePathname } from 'next/navigation';
import { FeedbackChat } from '@claudecontrol/feedback-lib';
import { feedbackBackend } from '@/lib/feedback-backend';

export default function FeedbackChatMount() {
  // A shared lead card (/c/…) is opened by people outside the partnership — no widget there.
  if (usePathname().startsWith('/c/')) return null;
  return <FeedbackChat backend={feedbackBackend} issuesPath="/feedback-lib-issues" />;
}
