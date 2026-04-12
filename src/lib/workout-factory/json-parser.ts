/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Comprehensive JSON parser with multi-layered repair strategy
 * Handles malformed JSON from AI responses with robust error recovery
 */

import { jsonrepair } from 'jsonrepair';

/**
 * Metadata about the parsing process
 */
export interface ParseResult {
  data: unknown;
  wasRepaired: boolean;
  repairMethod?: 'direct' | 'markdown_clean' | 'jsonrepair' | 'manual_fallback';
  originalLength: number;
  repairedLength?: number;
}

/**
 * Extract error context from a JSON parse error
 */
function extractErrorContext(
  text: string,
  error: Error,
  position?: number,
): {
  position: number;
  contextBefore: string;
  contextAfter: string;
  errorMessage: string;
  structureInfo: {
    depth: number;
    inString: boolean;
    inArray: boolean;
    inObject: boolean;
  };
} {
  let errorPosition = position || -1;

  // Try to extract position from error message
  if (errorPosition === -1) {
    const positionMatch = error.message.match(/position (\d+)/);
    if (positionMatch) {
      errorPosition = parseInt(positionMatch[1], 10);
    }
  }

  // Extract context around error
  const contextSize = 200;
  const start = Math.max(0, errorPosition - contextSize);
  const end = Math.min(text.length, errorPosition + contextSize);
  const contextBefore = text.substring(start, errorPosition);
  const contextAfter = text.substring(errorPosition, end);

  // Analyze structure at error position
  const beforeError = text.substring(0, errorPosition);
  let depth = 0;
  let inString = false;
  let inArray = false;
  let inObject = false;
  let escapeNext = false;

  for (let i = 0; i < beforeError.length; i++) {
    const char = beforeError[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth++;
      inObject = true;
      inArray = false;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        inObject = false;
      }
    } else if (char === '[') {
      depth++;
      inArray = true;
      inObject = false;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        inArray = false;
      }
    }
  }

  return {
    position: errorPosition,
    contextBefore,
    contextAfter,
    errorMessage: error.message,
    structureInfo: {
      depth,
      inString,
      inArray,
      inObject,
    },
  };
}

/**
 * Clean markdown code blocks from text
 */
function cleanMarkdown(text: string): string {
  let cleaned = text.trim();

  // Remove ```json and ``` markers (case insensitive)
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Try to find JSON object/array boundaries
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    cleaned = jsonMatch[1];
  }

  return cleaned;
}

/**
 * Manual fallback repairs for edge cases jsonrepair might miss
 */
function manualRepair(text: string): string {
  let repaired = text;

  // Remove trailing commas before closing brackets/braces
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Fix missing commas between array/object elements
  repaired = repaired.replace(/}\s*{/g, '},{');
  repaired = repaired.replace(/]\s*\[/g, '],[');

  // Fix common string issues (basic - jsonrepair handles most)
  // Unescape common patterns that might be double-escaped
  repaired = repaired.replace(/\\\\"/g, '\\"');

  return repaired;
}

/**
 * Multi-layered JSON parsing with robust repair
 *
 * Strategy:
 * 1. Try direct parse
 * 2. Clean markdown code blocks and try again
 * 3. Use jsonrepair library for automatic repair
 * 4. Fallback to manual repair attempts
 * 5. Return detailed error if all attempts fail
 *
 * @param text - Raw text that may contain JSON (possibly malformed)
 * @returns ParseResult with parsed data and metadata about the repair process
 * @throws Error with detailed context if all parsing attempts fail
 */
export function parseJSONWithRepair(text: string): ParseResult {
  const originalLength = text.length;
  let cleaned = text.trim();

  // Layer 1: Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    return {
      data: parsed,
      wasRepaired: false,
      repairMethod: 'direct',
      originalLength,
    };
  } catch {
    // Continue to next layer
  }

  // Layer 2: Clean markdown and try again
  cleaned = cleanMarkdown(text);
  try {
    const parsed = JSON.parse(cleaned);
    return {
      data: parsed,
      wasRepaired: true,
      repairMethod: 'markdown_clean',
      originalLength,
      repairedLength: cleaned.length,
    };
  } catch {
    // Continue to next layer
  }

  // Layer 3: Use jsonrepair library
  try {
    const repaired = jsonrepair(cleaned);
    const parsed = JSON.parse(repaired);
    return {
      data: parsed,
      wasRepaired: true,
      repairMethod: 'jsonrepair',
      originalLength,
      repairedLength: repaired.length,
    };
  } catch {
    // Continue to fallback
  }

  // Layer 4: Manual fallback repairs
  try {
    const manuallyRepaired = manualRepair(cleaned);
    const parsed = JSON.parse(manuallyRepaired);
    return {
      data: parsed,
      wasRepaired: true,
      repairMethod: 'manual_fallback',
      originalLength,
      repairedLength: manuallyRepaired.length,
    };
  } catch (error) {
    // All attempts failed - extract detailed error context
    const errorContext = extractErrorContext(
      cleaned,
      error instanceof Error ? error : new Error(String(error)),
    );

    const errorInfoDev = {
      originalLength,
      cleanedLength: cleaned.length,
      errorPosition: errorContext.position,
      structureInfo: errorContext.structureInfo,
      contextBefore: errorContext.contextBefore,
      contextAfter: errorContext.contextAfter,
      sample:
        cleaned.length > 2000
          ? cleaned.substring(0, 2000) + `\n... (truncated, total length: ${cleaned.length})`
          : cleaned,
    };
    const errorInfoProd = {
      originalLength,
      cleanedLength: cleaned.length,
      errorPosition: errorContext.position,
      structureInfo: errorContext.structureInfo,
    };

    if (process.env.NODE_ENV === 'development') {
      console.error('[json-parser] All parsing attempts failed:', errorInfoDev);
    } else {
      console.error('[json-parser] All parsing attempts failed:', errorInfoProd);
    }

    // Throw detailed error
    throw new Error(
      `Failed to parse JSON after all repair attempts. ` +
        `Error at position ${errorContext.position}: ${errorContext.errorMessage}. ` +
        `Context: ...${errorContext.contextBefore.substring(Math.max(0, errorContext.contextBefore.length - 100))} <<<ERROR>>> ${errorContext.contextAfter.substring(0, 100)}...`,
    );
  }
}

/**
 * Parse JSON and return just the data (simplified API)
 */
export function parseJSON(text: string): unknown {
  return parseJSONWithRepair(text).data;
}
