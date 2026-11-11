/**
 * 数据备份与迁移：设置 / 上一局存档 / 对局记录 导出为 JSON，可导入到另一台机器
 * （或换壳后的新版本）。纯函数放在前面便于单测，IO 包装在文件末尾。
 */
import type { Settings } from './store';

export const BACKUP_SCHEMA = 1;
export const BACKUP_APP = 'splendor-family';

export interface BackupRecord {
  id: string;
  [key: string]: unknown;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: number;
  appVersion: string | null;
  settings: Partial<Settings> | null;
  savedGame: string | null;
  records: BackupRecord[];
}

export interface ImportSummary {
  recordsAdded: number;
  recordsSkipped: number;
  settingsApplied: boolean;
  savedGameRestored: boolean;
}

/** 记录冲突策略：同 id 视为同一局，保留已有，跳过导入 */
export function mergeRecords<T extends BackupRecord>(existing: T[], incoming: T[]): { merged: T[]; added: T[]; skipped: number } {
  const seen = new Set(existing.map((r) => r.id));
  const added: T[] = [];
  let skipped = 0;
  for (const rec of incoming) {
    if (!rec || typeof rec.id !== 'string' || !rec.id) {
      skipped += 1;
      continue;
    }
    if (seen.has(rec.id)) {
      skipped += 1;
      continue;
    }
    seen.add(rec.id);
    added.push(rec);
  }
  return { merged: [...existing, ...added], added, skipped };
}

/** 解析并校验备份文件（宽容：字段缺失只记为 null/空） */
export function parseBackup(text: string): BackupFile {
  const raw = JSON.parse(text) as Partial<BackupFile>;
  if (!raw || typeof raw !== 'object') throw new Error('E_BACKUP_INVALID');
  if (raw.app !== BACKUP_APP) throw new Error('E_BACKUP_NOT_OURS');
  if (typeof raw.schema !== 'number' || raw.schema > BACKUP_SCHEMA) throw new Error('E_BACKUP_TOO_NEW');
  return {
    app: BACKUP_APP,
    schema: raw.schema,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : Date.now(),
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : null,
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : null,
    savedGame: typeof raw.savedGame === 'string' ? raw.savedGame : null,
    records: Array.isArray(raw.records) ? raw.records.filter((r): r is BackupRecord => !!r && typeof (r as BackupRecord).id === 'string') : [],
  };
}

/** 备份文件名：splendor-backup-2026-10-17.json */
export function backupFileName(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `splendor-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
