/**
 * 日付フォーマット用共通ユーティリティ
 */

/**
 * 日付を「月日 時:分」形式でフォーマット（LinkCard用）
 */
export const formatDateTimeShort = (date: Date): string => {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

/**
 * 日付を「月日」形式でフォーマット（FolderCard、TagGroupCard用）
 */
export const formatDateShort = (date: Date): string => {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'short',
    day: 'numeric',
  }).format(date);
};

/**
 * 日付を「YYYY-MM-DD」形式でフォーマット
 */
export const formatDateISO = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

/**
 * 日付を「YYYY-MM」形式でフォーマット
 */
export const formatYearMonth = (date: Date): string => {
  return date.toISOString().slice(0, 7);
};