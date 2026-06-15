/** Vertex Stage-1 outline fill — model and output token budget. */
export const OUTLINE_FILL_VERTEX_MODEL = 'google/gemini-3.1-flash-lite-preview';

/** Align with COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS after P1 fill-only output shrink. */
export const OUTLINE_FILL_MAX_OUTPUT_TOKENS = 12288;

/** Treat completion at or above this fraction of max_tokens as likely truncation. */
export const OUTLINE_FILL_TRUNCATION_TOKEN_RATIO = 0.95;
