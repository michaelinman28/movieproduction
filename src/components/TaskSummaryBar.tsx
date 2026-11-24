import { useState } from 'react';
import type { Task } from '../lib/api';
import { assigneeEmails, copySummary, summaryMailto, summaryText, type SummaryContext } from '../lib/taskSummary';

/**
 * Shown when tasks are ticked in the task table: email a summary of them from your own
 * email app, or copy it to paste into an email, chat or text.
 */
export function TaskSummaryBar({ chosen, ctx, onClear }: { chosen: Task[]; ctx: SummaryContext; onClear: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const emails = assigneeEmails(chosen, ctx);
  const [toAssignees, setToAssignees] = useState(true);
  const summary = summaryText(chosen, ctx);
  // Some email apps cut off very long mailto links; copying always works.
  const long = summary.body.length > 1800;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-accent-soft p-3" role="region" aria-label="Send a summary of the ticked tasks">
      <p className="m-0 text-sm font-semibold">{chosen.length} task{chosen.length === 1 ? '' : 's'} ticked</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <a className="btn no-underline" href={summaryMailto(summary, toAssignees ? emails : [])}>Email summary</a>
        <button type="button" className="btn btn-secondary" onClick={async () => setCopied(await copySummary(summary))}>Copy summary</button>
        <button type="button" className="btn-link min-h-11 text-sm" onClick={() => { setCopied(null); onClear(); }}>Clear ticks</button>
      </div>
      {emails.length > 0 && (
        <label className="check text-sm">
          <input type="checkbox" checked={toAssignees} onChange={(e) => setToAssignees(e.target.checked)} />
          Address the email to the {emails.length === 1 ? 'person' : `${emails.length} people`} assigned
        </label>
      )}
      {long && <p className="hint m-0">That's a long summary. If your email app cuts it short, use Copy summary and paste it in.</p>}
      {copied === true && <p className="hint m-0">Summary copied. Paste it into an email, chat or text.</p>}
      {copied === false && <p className="error m-0">Your browser didn't allow copying. Use Email summary instead.</p>}
    </div>
  );
}
