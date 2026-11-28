import { useEffect, useState } from 'react';
import { CallSheetDocument } from '../components/CallSheetDocument';
import { SheetViewSwitch, ownSheet, useSheetMode } from '../components/SheetViewSwitch';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { helpUrl } from '../components/HelpLink';
import { api, type LinkedCallSheet } from '../lib/api';
import { errorText, shortDate } from '../lib/format';

/**
 * A person's own call sheet, from the private link they were sent: view only, no
 * sign-in. It's a page on its own, outside the app, with a link back to the site.
 * Cast only get just their own call; crew get the whole day; people who are both can
 * switch, starting on My call.
 */
export function SheetLinkPage({ token }: { token: string }) {
  const [sheet, setSheet] = useState<LinkedCallSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [mode, setMode] = useSheetMode(sheet?.view ?? 'cast');

  async function confirm() {
    setBusy(true); setConfirmError(null);
    try {
      await api.confirmLinkedCallSheet(token);
      setSheet((s) => (s ? { ...s, confirmed: true } : s));
    } catch (e) { setConfirmError(errorText(e)); }
    setBusy(false);
  }

  useEffect(() => {
    api.linkedCallSheet(token).then(setSheet).catch((e) => setError(errorText(e)));
  }, [token]);

  useEffect(() => {
    if (sheet) document.title = `Call sheet: ${sheet.project.name}, day ${sheet.day.day_number} (${shortDate(sheet.day.shoot_date)})`;
  }, [sheet]);

  const home = import.meta.env.BASE_URL;
  const confirmBox = sheet && (sheet.confirmed
    ? <span className="cs-confirmed">✓ Confirmed version {sheet.day.version}</span>
    : <>
        <button type="button" className="btn sm:w-auto" disabled={busy} onClick={confirm}>{busy ? 'Confirming…' : 'Confirm I got it'}</button>
        {confirmError && <span className="error">{confirmError}</span>}
      </>);

  return (
    <div className="flex-1">
      <div className="sheet-link-bar">
        <a href={home} className="mr-auto inline-flex min-h-11 items-center font-bold text-fg no-underline">Movie Production</a>
        {sheet && <button type="button" className="btn btn-secondary w-auto min-h-10 px-3 text-sm" onClick={() => window.print()}>Print or PDF</button>}
        <a href={helpUrl('getting-started/your-call-sheet-link')} target="_blank" rel="noopener" className="btn-link shrink-0 whitespace-nowrap text-sm">What is this?</a>
        <ThemeSwitch />
      </div>
      <main className="mx-auto w-full max-w-5xl px-4 py-4 md:py-8">
        {error ? (
          <div className="card mx-auto max-w-md text-center">
            <h1 className="text-xl">This call sheet isn't available</h1>
            <p className="m-0 text-muted">{error}</p>
            <p className="m-0"><a href={home}>Go to Movie Production</a></p>
          </div>
        ) : !sheet ? (
          <p className="text-center text-muted">Loading your call sheet…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {sheet.view === 'both' && <SheetViewSwitch mode={mode} onChange={setMode} />}
            {mode === 'full' && (
              <div className="no-print flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0">You're called on this day. Version {sheet.day.version} was sent.</p>
                {confirmBox}
              </div>
            )}
            {/* The full sheet is the same for everyone: no "Your call" or "You" markers (those are on My call). */}
            <CallSheetDocument sheet={mode === 'mine' ? ownSheet(sheet, sheet.me) : sheet} me={mode === 'mine' ? sheet.me : null} own={mode === 'mine'}
              sectionPrefix="sheetLink" youAction={mode === 'mine' ? confirmBox : undefined} />
            <p className="no-print m-0 text-center text-sm text-muted">
              This is your personal call sheet, so please don't forward the link. <a href={home}>Go to Movie Production</a>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
