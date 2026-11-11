/**
 * 数据备份的读写包装（依赖 localStorage / IndexedDB / 下载）：
 * 设置页「导出数据 / 导入数据」用它，换壳或换机时用它迁移。
 */
import { listRecords, saveRecord, type GameRecord } from './records';
import { useGame, type Settings } from './store';
import {
  BACKUP_APP,
  BACKUP_SCHEMA,
  backupFileName,
  mergeRecords,
  parseBackup,
  type BackupFile,
  type BackupRecord,
  type ImportSummary,
} from './dataTransfer';

const SAVE_KEY = 'splendor.save.v1';

export function buildBackup(): BackupFile {
  const settings = useGame.getState().settings;
  let savedGame: string | null = null;
  try {
    savedGame = localStorage.getItem(SAVE_KEY);
  } catch {
    savedGame = null;
  }
  return {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt: Date.now(),
    appVersion: window.splendorDesktop?.appVersion ?? null,
    settings: settings as Partial<Settings>,
    savedGame,
    records: [] as BackupRecord[],
  };
}

/** 导出：设置 + 上一局存档 + 全部对局记录 → 浏览器下载一个 JSON 文件 */
export async function exportData(): Promise<number> {
  const backup = buildBackup();
  const records = await listRecords();
  backup.records = records as unknown as BackupRecord[];
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return records.length;
}

/** 导入：合并记录（同 id 跳过）、应用设置、恢复上一局存档 */
export async function importData(text: string): Promise<ImportSummary> {
  const backup = parseBackup(text);
  const existing = (await listRecords()) as unknown as BackupRecord[];
  const { added, skipped } = mergeRecords(existing, backup.records);
  for (const rec of added) {
    await saveRecord(rec as unknown as GameRecord);
  }
  if (backup.settings) {
    useGame.getState().setSettings(backup.settings as Partial<Settings>);
  }
  let savedGameRestored = false;
  if (backup.savedGame) {
    try {
      localStorage.setItem(SAVE_KEY, backup.savedGame);
      savedGameRestored = true;
    } catch {
      savedGameRestored = false;
    }
  }
  useGame.setState({ recordsVersion: useGame.getState().recordsVersion + 1 });
  return { recordsAdded: added.length, recordsSkipped: skipped, settingsApplied: !!backup.settings, savedGameRestored };
}

/** 让用户选一个备份文件 */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
