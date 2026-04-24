# Phase 4 environment variables

## `organizer-agent-dispatch`

| Name                                | Required | Notes                                                                                                                                           |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                      | yes      | Standard.                                                                                                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`         | yes      | Standard.                                                                                                                                       |
| `ORGANIZER_AGENT_WEBHOOK_SECRET`    | yes      | Shared secret validated against `Authorization: Bearer ...` or `x-organizer-agent-secret`.                                                      |
| `GEMINI_API_KEY`                    | yes      | Same Gemini key used by `bubble-agent-dispatch` and `buddy-agent-dispatch`.                                                                     |
| `ORGANIZER_GEMINI_MODEL`            | no       | Defaults to `GEMINI_MODEL`, then `gemini-2.5-flash`.                                                                                            |
| `ORGANIZER_GEMINI_FETCH_TIMEOUT_MS` | no       | Defaults to `55000`. Must be `>= 1000`.                                                                                                         |
| `ORGANIZER_AGENT_DEBUG`             | no       | Set to `1` to log the full Gemini envelope. Avoid in production.                                                                                |
| `ORGANIZER_WRITES_ENABLED`          | no       | Feature flag — defaults to OFF. When unset / not `1`, Organizer's proposed task writes are returned to the client but NOT executed server-side. |

## Webhook configuration

Create a Supabase Dashboard Database Webhook named `organizer_dispatch_webhook`:

- Table: `public.messages`
- Events: INSERT
- URL: `https://<project-ref>.supabase.co/functions/v1/organizer-agent-dispatch`
- Method: POST
- Headers: `x-organizer-agent-secret: <ORGANIZER_AGENT_WEBHOOK_SECRET>`

Keep the existing `bubble-agent-dispatch` and `buddy-agent-dispatch` webhooks in place;
all three receive the same `public.messages` INSERT event and fast-reject independently.
