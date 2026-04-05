import { format } from 'date-fns';

const MESSAGE_TIMESTAMP_FORMAT = "MMM d, yyyy '·' h:mm a";

/** Shared format for chat messages and task comments (date + time). */
export function formatMessageTimestamp(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, MESSAGE_TIMESTAMP_FORMAT);
}
