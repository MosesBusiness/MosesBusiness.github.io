// Saving files and the encrypted backup, in the Claude artifact and in the web app.
import { cap } from './claude';
import { VaultIO } from './store';
import { todayISO } from './format';

export async function saveFile(filename: string, data: string, mime: string): Promise<'saved' | 'copied' | 'declined' | 'failed'> {
  const dl = await cap<any>('downloads');
  if (dl) {
    try { await dl.save({ filename, data }); return 'saved'; } catch (e: any) { if (e?.code === 'declined') return 'declined'; }
  }
  try {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (!window.claude) return 'saved';
  } catch { /* fall through */ }
  try { await navigator.clipboard.writeText(data); return 'copied'; } catch { return 'failed'; }
}

/** The backup is the encrypted documents exactly as stored: it opens only with the passcode. */
export async function exportBackup(io: VaultIO): Promise<'saved' | 'copied' | 'declined' | 'failed'> {
  const docs = await io.backend.getAll();
  const payload = { app: 'hon-shaket', v: 1, exported: new Date().toISOString(), docs };
  return saveFile(`hon-shaket-backup-${todayISO()}.json`, JSON.stringify(payload), 'application/json');
}
