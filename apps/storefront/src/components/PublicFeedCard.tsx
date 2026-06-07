import {
  MapPin,
  Sparkles,
  Camera,
  Lightbulb,
  SquareCheck,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import { getPublicCardVisual } from '../lib/item-styles';
import { formatClassSchedule } from '../lib/format-class-schedule';
import { metadataBlocks } from '../lib/public-card-metadata';
import type { PublicFeedItem } from '../lib/public-feed-types';
import PublicCardSocialStrip from './PublicCardSocialStrip';

function taskIcon(itemType: string): LucideIcon {
  const t = (itemType || 'task').toLowerCase();
  if (t === 'event') return MapPin;
  if (t === 'experience') return Sparkles;
  if (t === 'memory') return Camera;
  if (t === 'idea') return Lightbulb;
  return SquareCheck;
}

type Props = {
  item: PublicFeedItem;
};

export default function PublicFeedCard({ item }: Props) {
  if (item.kind === 'class') {
    const { instance } = item;
    const { offering } = instance;
    const v = getPublicCardVisual('class');
    const when = formatClassSchedule(instance.scheduled_at);
    const duration =
      Number.isFinite(offering.duration_min) && offering.duration_min > 0
        ? `${offering.duration_min} min`
        : null;
    const location = offering.location?.trim() || null;

    const blocks: { label: string; value: string; isLink?: boolean }[] = [
      { label: 'When', value: when },
    ];
    if (duration) blocks.push({ label: 'Duration', value: duration });
    if (location) {
      const isUrl = /^https?:\/\//i.test(location);
      blocks.push({ label: 'Location', value: location, isLink: isUrl });
    }

    return (
      <div
        className={`break-inside-avoid mb-6 rounded-2xl border-2 p-5 shadow-sm ${v.bg} ${v.border}`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${v.chip}`}
          >
            <GraduationCap className="size-3.5 shrink-0 opacity-90" aria-hidden />
            {v.label}
          </span>
          <span className="text-xs text-zinc-500">Scheduled · {when}</span>
        </div>

        <h3 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
          {offering.name}
        </h3>

        {offering.description?.trim() ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{offering.description}</p>
        ) : null}

        {blocks.length > 0 ? (
          <dl className="mt-4 space-y-2 border-t border-zinc-200/80 pt-4 text-sm text-zinc-700">
            {blocks.map((row) => (
              <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="shrink-0 font-medium text-zinc-500">{row.label}</dt>
                <dd className="min-w-0 break-words">
                  {row.isLink ? (
                    <a
                      href={row.value}
                      className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700"
                    >
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <PublicCardSocialStrip
          taskId={item.taskId}
          bubbleId={item.bubbleId}
          title={offering.name}
        />
      </div>
    );
  }

  const { card } = item;
  const v = getPublicCardVisual(card.item_type);
  const Icon = taskIcon(card.item_type);
  const blocks = metadataBlocks(card.item_type, card.metadata);
  const scheduled =
    card.scheduled_on && String(card.scheduled_on).trim()
      ? String(card.scheduled_on).slice(0, 10)
      : null;

  return (
    <div
      className={`break-inside-avoid mb-6 rounded-2xl border-2 p-5 shadow-sm ${v.bg} ${v.border}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${v.chip}`}
        >
          <Icon className="size-3.5 shrink-0 opacity-90" aria-hidden />
          {v.label}
        </span>
        {scheduled ? <span className="text-xs text-zinc-500">Scheduled · {scheduled}</span> : null}
      </div>

      <h3 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
        {card.title}
      </h3>

      {card.description?.trim() ? (
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{card.description}</p>
      ) : null}

      {blocks.length > 0 ? (
        <dl className="mt-4 space-y-2 border-t border-zinc-200/80 pt-4 text-sm text-zinc-700">
          {blocks.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="shrink-0 font-medium text-zinc-500">{row.label}</dt>
              <dd className="min-w-0 break-words">
                {row.label === 'Link' ? (
                  <a
                    href={row.value}
                    className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700"
                  >
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <PublicCardSocialStrip taskId={item.taskId} bubbleId={item.bubbleId} title={card.title} />
    </div>
  );
}
