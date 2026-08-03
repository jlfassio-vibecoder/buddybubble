import type { Json } from '@/types/database';

export const CLASS_OFFERING_FORMATS = ['online', 'in_person', 'hybrid'] as const;
export type ClassOfferingFormat = (typeof CLASS_OFFERING_FORMATS)[number];

export const CLASS_OFFERING_RECURRING = ['none', 'daily', 'weekly', 'monthly'] as const;
export type ClassOfferingRecurring = (typeof CLASS_OFFERING_RECURRING)[number];

export const CLASS_OFFERING_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type ClassOfferingWeekday = (typeof CLASS_OFFERING_WEEKDAYS)[number];

export const CLASS_OFFERING_REMINDERS = [
  '1 day before',
  '1 hour before',
  '15 min before',
  'At start',
] as const;
export type ClassOfferingReminder = (typeof CLASS_OFFERING_REMINDERS)[number];

export type ClassOfferingPhaseNFields = {
  format: ClassOfferingFormat | '';
  join_link: string;
  recurring: ClassOfferingRecurring;
  days: ClassOfferingWeekday[];
  price: string;
  reminders: ClassOfferingReminder[];
};

const FORMAT_SET = new Set<string>(CLASS_OFFERING_FORMATS);
const RECURRING_SET = new Set<string>(CLASS_OFFERING_RECURRING);
const WEEKDAY_SET = new Set<string>(CLASS_OFFERING_WEEKDAYS);
const REMINDER_SET = new Set<string>(CLASS_OFFERING_REMINDERS);

/** Location column is shown for in-person/hybrid; unset format treats as in-person. */
export function showsLocationForFormat(format: ClassOfferingFormat | ''): boolean {
  return format === '' || format === 'in_person' || format === 'hybrid';
}

/** External join_link input is shown for online/hybrid only. */
export function showsJoinLinkForFormat(format: ClassOfferingFormat | ''): boolean {
  return format === 'online' || format === 'hybrid';
}

export function emptyClassOfferingPhaseN(): ClassOfferingPhaseNFields {
  return {
    format: '',
    join_link: '',
    recurring: 'none',
    days: [],
    price: '',
    reminders: [],
  };
}

export function parseClassOfferingPhaseN(meta: unknown): ClassOfferingPhaseNFields {
  const empty = emptyClassOfferingPhaseN();
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return empty;
  const o = meta as Record<string, unknown>;

  const formatRaw = typeof o.format === 'string' ? o.format : '';
  const format = FORMAT_SET.has(formatRaw) ? (formatRaw as ClassOfferingFormat) : '';

  const join_link = typeof o.join_link === 'string' ? o.join_link : '';

  const recurringRaw = typeof o.recurring === 'string' ? o.recurring : 'none';
  const recurring = RECURRING_SET.has(recurringRaw)
    ? (recurringRaw as ClassOfferingRecurring)
    : 'none';

  const days: ClassOfferingWeekday[] = [];
  if (Array.isArray(o.days)) {
    for (const d of o.days) {
      if (
        typeof d === 'string' &&
        WEEKDAY_SET.has(d) &&
        !days.includes(d as ClassOfferingWeekday)
      ) {
        days.push(d as ClassOfferingWeekday);
      }
    }
  }

  const price = typeof o.price === 'string' ? o.price : '';

  const reminders: ClassOfferingReminder[] = [];
  if (Array.isArray(o.reminders)) {
    for (const r of o.reminders) {
      if (
        typeof r === 'string' &&
        REMINDER_SET.has(r) &&
        !reminders.includes(r as ClassOfferingReminder)
      ) {
        reminders.push(r as ClassOfferingReminder);
      }
    }
  }

  return { format, join_link, recurring, days, price, reminders };
}

/**
 * Merges Phase N offering keys into existing metadata without dropping `fitness` or unknown keys.
 * Strips `days` when not weekly; omits empty strings / empty reminder lists; drops `join_link`
 * when format is not online/hybrid.
 */
export function applyClassOfferingPhaseN(base: Json, fields: ClassOfferingPhaseNFields): Json {
  const o =
    base && typeof base === 'object' && !Array.isArray(base)
      ? { ...(base as Record<string, unknown>) }
      : {};

  const format = fields.format;
  if (format) o.format = format;
  else delete o.format;

  const joinTrim = fields.join_link.trim();
  if (showsJoinLinkForFormat(format) && joinTrim) o.join_link = joinTrim;
  else delete o.join_link;

  const recurring = fields.recurring || 'none';
  o.recurring = recurring;

  if (recurring === 'weekly') {
    const days = CLASS_OFFERING_WEEKDAYS.filter((d) => fields.days.includes(d));
    if (days.length > 0) o.days = [...days];
    else delete o.days;
  } else {
    delete o.days;
  }

  const priceTrim = fields.price.trim();
  if (priceTrim) o.price = priceTrim;
  else delete o.price;

  const reminders = CLASS_OFFERING_REMINDERS.filter((r) => fields.reminders.includes(r));
  if (reminders.length > 0) o.reminders = [...reminders];
  else delete o.reminders;

  return o as Json;
}
