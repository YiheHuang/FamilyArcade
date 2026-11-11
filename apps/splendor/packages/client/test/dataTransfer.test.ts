import { describe, expect, it } from 'vitest';
import { BACKUP_APP, BACKUP_SCHEMA, backupFileName, mergeRecords, parseBackup } from '../src/dataTransfer';

describe('数据备份/迁移', () => {
  it('合并记录：同 id 跳过，坏数据计数但不写入', () => {
    const existing = [{ id: 'a' }, { id: 'b' }];
    const incoming = [{ id: 'b' }, { id: 'c' }, { id: '' }, {} as { id: string }, { id: 'd' }];
    const { merged, added, skipped } = mergeRecords(existing, incoming);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(added.map((r) => r.id)).toEqual(['c', 'd']);
    expect(skipped).toBe(3);
  });

  it('解析备份：识别本应用的备份、拒绝陌生/过新文件', () => {
    const good = JSON.stringify({
      app: BACKUP_APP,
      schema: BACKUP_SCHEMA,
      exportedAt: 123,
      appVersion: '2.3.0',
      settings: { lang: 'zh' },
      savedGame: '{"seed":"x"}',
      records: [{ id: 'a' }, { nope: true }, { id: 'b' }],
    });
    const parsed = parseBackup(good);
    expect(parsed.schema).toBe(BACKUP_SCHEMA);
    expect(parsed.records.map((r) => r.id)).toEqual(['a', 'b']);
    expect(parsed.settings).toEqual({ lang: 'zh' });

    expect(() => parseBackup(JSON.stringify({ app: 'other', schema: 1 }))).toThrow(/E_BACKUP_NOT_OURS/);
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, schema: BACKUP_SCHEMA + 5 }))).toThrow(/E_BACKUP_TOO_NEW/);
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, schema: 1 })).records).toEqual([]);
  });

  it('文件名带日期，便于区分多次导出', () => {
    expect(backupFileName(new Date(2026, 9, 17))).toBe('splendor-backup-2026-10-17.json');
  });
});
