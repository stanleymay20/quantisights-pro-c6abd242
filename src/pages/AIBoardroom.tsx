import Deliberation from "./Deliberation";

/**
 * AI Boardroom — Executive deliberation chamber.
 * Reuses the deterministic Deliberation surface with the "boardroom" variant,
 * which renders distinct header copy and description focused on executive review.
 * Decision context is encoded in the URL via ?decision=<id>.
 *
 * P1.7 fix: The boardroom variant is already differentiated in Deliberation.tsx
 * via variantCopy. This wrapper is retained and the sidebar label + badge are
 * updated to remove the "New" badge and clarify the purpose.
 */
export default function AIBoardroom() {
  return <Deliberation variant="boardroom" />;
}
