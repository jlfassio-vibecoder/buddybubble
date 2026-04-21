import { normalizeItemType, type ItemType } from '@/lib/item-types';
import {
  getDefaultPresetForItemType,
  getPresetTextById,
  itemTypeLabelForPrompt,
} from '@/lib/ai/card-cover-presets';

const MAX_SCENE_BRIEF_CHARS = 1200;
const MAX_HINT = 220;

export type BuildCardCoverImagePromptInput = {
  /** From Gemini scene-brief step (V1.5); visual-only, ≤50 words typically. */
  sceneBrief: string;
  /** Raw `item_type` from DB or UI; normalized internally. */
  itemType: string;
  hint?: string;
  presetId?: string;
};

function resolveSceneArchetype(itemType: ItemType, presetId?: string): string {
  const fromUser = presetId ? getPresetTextById(presetId) : undefined;
  if (fromUser) return fromUser;
  return getDefaultPresetForItemType(itemType);
}

/**
 * Layered Imagen prompt: safety, item type, scene brief, archetype preset, hint, output constraints.
 */
export function buildCardCoverImagePrompt(input: BuildCardCoverImagePromptInput): string {
  const itemType = normalizeItemType(input.itemType);
  const sceneBrief = input.sceneBrief.trim().slice(0, MAX_SCENE_BRIEF_CHARS);
  const hint = input.hint?.trim().slice(0, MAX_HINT);
  const typeLabel = itemTypeLabelForPrompt(itemType);
  const scene = resolveSceneArchetype(itemType, input.presetId);

  const safety = 'Family-friendly, high-quality, no readable text overlays.';
  const itemTypeBlock = `This image represents a card in a community planning app. Card type: ${typeLabel}.`;
  const subjectBlock = `Depict the following visual scene: ${sceneBrief || '(unspecified — infer a neutral, friendly scene).'}`;
  const sceneBlock = `Scene archetype: ${scene}`;
  const outputConstraints =
    '16:9 aspect ratio, composition should allow for center-cropping. Render meaning through scenes, objects, environment, color, and activity — not by painting readable sentences.';

  const parts = [
    safety,
    itemTypeBlock,
    subjectBlock,
    sceneBlock,
    ...(hint ? [`Style / hint from user: ${hint}`] : []),
    outputConstraints,
  ];
  return parts.join('\n\n');
}
