import { useEffect, useState } from 'react';
import { CallSheetDocument } from '../components/CallSheetDocument';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { api, type SharedCallSheet } from '../lib/api';
import { errorText, shortDate } from '../lib/format';

/**
 * A day's whole call sheet, from its shared link: view only, no sign-in, for anyone
 * the link was sent to. The same design as the PDF, with no "your call" and no
 * Confirm (nobody is known). A page on its own, outside the app.
 */
export function SharedSheetPage({ token }: { token: string }) {
  const [sheet, setSheet] = useState<SharedCallSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.sharedCallSheet(token).then(setSheet).catch((e) => setError(errorText(e)));
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
          <p className="text-center text-muted">Loading the call sheet…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <CallSheetDocument sheet={sheet} sectionPrefix="sharedSheet" />
            <p className="no-print m-0 text-center text-sm text-muted">
              View only. {sheet.phones ? '' : 'Phone numbers aren\'t shown on this link. '}If you're called on this day, use your personal link to confirm.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
