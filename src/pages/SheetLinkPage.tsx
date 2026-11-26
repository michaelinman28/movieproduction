import { useEffect, useState } from 'react';
import { CallSheetDocument } from '../components/CallSheetDocument';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { api, type LinkedCallSheet } from '../lib/api';
import { errorText, shortDate } from '../lib/format';

/**
 * A person's own call sheet, from the private link they were sent: view only, no
 * sign-in. It's a page on its own, outside the app, with a link back to the site.
 */
export function SheetLinkPage({ token }: { token: string }) {
  const [sheet, setSheet] = useState<LinkedCallSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

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

  return (
    <div className="flex-1">
      <div className="sheet-link-bar">
        <a href={home} className="mr-auto inline-flex min-h-11 items-center font-bold text-fg no-underline">Movie Production</a>
        {sheet && <button type="button" className="btn btn-secondary w-auto min-h-10 px-3 text-sm" onClick={() => window.print()}>Print or PDF</button>}
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
            <CallSheetDocument sheet={sheet} me={sheet.me} sectionPrefix="sheetLink" youAction={
              sheet.confirmed
                ? <span className="cs-confirmed">✓ Confirmed version {sheet.day.version}</span>
                : <>
                    <button type="button" className="btn" disabled={busy} onClick={confirm}>{busy ? 'Confirming…' : 'Confirm I got it'}</button>
                    {confirmError && <span className="error">{confirmError}</span>}
                  </>
            } />
            <p className="no-print m-0 text-center text-sm text-muted">
              This is your personal call sheet, so please don't forward the link. <a href={home}>Go to Movie Production</a>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
