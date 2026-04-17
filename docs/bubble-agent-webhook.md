# Bubble Agent database webhook (Phase 2)

The Edge Function `bubble-agent-dispatch` receives **Database Webhook** payloads when a row is inserted into `public.messages`. It authenticates with a shared secret, skips non-human or non-mention messages, then calls the `SECURITY DEFINER` RPC `agent_create_card_and_reply` using the **service role** client to create a stub Kanban card and agent reply.

## Deploy

1. Set Edge secrets (Dashboard → Edge Functions → Secrets, or CLI):
   - `SUPABASE_URL` — project URL (often injected automatically).
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server only).
   - `BUBBLE_AGENT_WEBHOOK_SECRET` — long random string; must match the webhook configuration below.

2. Deploy the function:

   ```bash
   supabase functions deploy bubble-agent-dispatch --no-verify-jwt
   ```

   Local `supabase/config.toml` sets `[functions.bubble-agent-dispatch] verify_jwt = false` so Supabase’s webhook (no user JWT) can call the function. `--no-verify-jwt` aligns the remote project with that behavior.

## Webhook (Supabase Dashboard)

1. **Database** → **Webhooks** → **Create a new hook** (or equivalent for your project UI).
2. **Table**: `public.messages`
3. **Events**: **Insert**
4. **HTTP Request**:
   - **URL**: `https://<project-ref>.supabase.co/functions/v1/bubble-agent-dispatch`
   - **HTTP method**: `POST`
5. **Headers** (recommended): add a custom header so the function can verify the caller:
   - Name: `x-bubble-agent-secret`
   - Value: same string as `BUBBLE_AGENT_WEBHOOK_SECRET`

   Alternatively, send `Authorization: Bearer <BUBBLE_AGENT_WEBHOOK_SECRET>`.

The function returns **HTTP 200** with a small JSON body for most outcomes (including skips and RPC failures) so transient webhook retries do not hammer errors; a **500** is reserved for misconfiguration (missing env).

## Behavior summary

- Ignores payloads that are not `schema: public`, `table: messages`, `type: INSERT` (case-insensitive).
- Skips when `record.user_id` is an active `agent_definitions.auth_user_id` (loop guard).
- Skips when no active bubble-bound agent’s `display_name` appears in `record.content` as `@<display_name>`.
- On match, calls `agent_create_card_and_reply` with stub reply/task strings (no LLM in this phase).
