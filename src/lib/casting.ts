import { api, type Character } from './api';

/**
 * Who plays which character is stored once: each character's actor. The Characters
 * page, a shoot day's calls and the Team page all show and change that same link,
 * so casting someone in one place shows everywhere.
 */

/** A character's name with its cast number, e.g. "Ellie (#1)". */
export const characterLabel = (c: Pick<Character, 'name' | 'cast_number'>) =>
  (c.cast_number != null ? `${c.name} (#${c.cast_number})` : c.name);

/** The characters someone plays, in cast-number order. */
export const characterIdsPlayedBy = (userId: string, characters: Character[]) =>
  characters.filter((c) => c.actor_id === userId).map((c) => c.id);

/**
 * Make someone the actor of exactly these characters. A character played by someone
 * else moves to them; characters they no longer play are left without an actor.
 */
export async function setCharactersPlayed(userId: string, ids: string[], characters: Character[]) {
  const want = new Set(ids);
  for (const c of characters) {
    if (want.has(c.id) && c.actor_id !== userId) await api.updateCharacter(c.id, { actor_id: userId });
    else if (!want.has(c.id) && c.actor_id === userId) await api.updateCharacter(c.id, { actor_id: null });
  }
}

/** For a pick-list of characters: "Ellie (#1)", noting who else plays it. */
export function characterChoices(userId: string, characters: Character[], nameOf: (id: string) => string | undefined) {
  return characters.map((c) => {
    const other = c.actor_id && c.actor_id !== userId ? nameOf(c.actor_id) : undefined;
    return { id: c.id, name: other ? `${characterLabel(c)} (played by ${other})` : characterLabel(c) };
  });
}
