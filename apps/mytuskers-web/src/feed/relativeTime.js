import { formatDate } from '../api.js';

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

// Posts expire after 30 days, so anything older than a week is rare enough that
// an absolute date reads better than "3w ago".
export const relativeTime = (value) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < HOUR) return `${Math.round(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.round(seconds / HOUR)}h ago`;
  if (seconds < DAY * 7) return `${Math.round(seconds / DAY)}d ago`;
  return formatDate(value, { time: true });
};
