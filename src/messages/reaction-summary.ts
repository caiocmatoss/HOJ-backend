export const REACTION_ORDER = ['LIKE', 'LOVE', 'LAUGH', 'WOW', 'SAD', 'FIRE'] as const;
export type ReactionTypeValue = (typeof REACTION_ORDER)[number];

export type ReactionSummary = { type: ReactionTypeValue; count: number };
export type ReactionAggregate = { reactions: ReactionSummary[]; myReaction: string | null };

export function summarizeReactions(rows: Array<{ type: string; userId: string }>, viewerId: string) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  const reactions = REACTION_ORDER.filter((type) => (counts.get(type) ?? 0) > 0).map((type) => ({ type, count: counts.get(type)! }));
  const mine = rows.find((row) => row.userId === viewerId)?.type ?? null;
  return { reactions, myReaction: mine };
}

export function withReactionSummary(message: any, summary: ReactionAggregate) {
  return { ...message, reactions: message.deletedAt ? [] : summary.reactions, myReaction: message.deletedAt ? null : summary.myReaction };
}
