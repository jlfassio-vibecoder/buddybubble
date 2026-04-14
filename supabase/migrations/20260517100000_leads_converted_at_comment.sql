-- Clarify leads.converted_at semantics per dual-lead-capture TDD §6.3.
--
-- This timestamp is set when the PLATFORM trial starts (workspace owner
-- subscribes to BuddyBubble via /api/stripe/create-trial). It does NOT
-- indicate that the tenant has won an invitee as a paying customer (B2B2C).
--
-- Engineers adding B2B2C "payment to tenant" signals must use a separate
-- column or table — do not overload converted_at for that purpose.
--
-- See docs/technical-design-dual-lead-capture-workflows-v1.md §6.3 for
-- the recommended forward path (platform_converted_at vs tenant_converted_at).

COMMENT ON COLUMN public.leads.converted_at IS
  'Set when the platform trial starts for the user who owns this workspace '
  '(BuddyBubble subscription via /api/stripe/create-trial). '
  'This is a PLATFORM signal, NOT a B2B2C "tenant won the invitee as a customer" signal. '
  'See docs/technical-design-dual-lead-capture-workflows-v1.md §6.3 for the forward path.';
