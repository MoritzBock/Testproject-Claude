/**
 * Feature switches with scopes (global → class → group → user).
 * The most specific scope wins; conflicting groups resolve to the most restrictive value.
 */

export const LEADERBOARD_CRITERIA = [
  'stars',
  'levels',
  'earned',
  'collection',
  'playtime',
] as const;
export type LeaderboardCriterion = (typeof LEADERBOARD_CRITERIA)[number];

export const LEADERBOARD_LABELS: Record<LeaderboardCriterion, string> = {
  stars: 'Sterne',
  levels: 'Abgeschlossene Level',
  earned: 'Verdiente Bytes',
  collection: 'Sammlung (Items)',
  playtime: 'Spielzeit',
};

interface BoolPolicy {
  type: 'bool';
  default: boolean;
  /** Which value is "more restrictive" when groups disagree. */
  restrictive: boolean;
  label: string;
}
interface ListPolicy {
  type: 'list';
  default: string[];
  options: readonly string[];
  label: string;
}
export type PolicyDef = BoolPolicy | ListPolicy;

export const POLICIES = {
  'multiplayer.visible': {
    type: 'bool',
    default: false,
    restrictive: false,
    label: 'Mitspielende in der Welt sehen',
  },
  'multiplayer.emotes': {
    type: 'bool',
    default: true,
    restrictive: false,
    label: 'Emotes erlaubt',
  },
  'economy.shop': { type: 'bool', default: true, restrictive: false, label: 'Shop aktiv' },
  'economy.lootboxes': {
    type: 'bool',
    default: false,
    restrictive: false,
    label: 'Lootboxen aktiv',
  },
  'leaderboard.enabled': {
    type: 'bool',
    default: false,
    restrictive: false,
    label: 'Ranglisten aktiv',
  },
  'leaderboard.criteria': {
    type: 'list',
    default: ['stars'],
    options: LEADERBOARD_CRITERIA,
    label: 'Ranglisten-Kriterien',
  },
  frozen: {
    type: 'bool',
    default: false,
    restrictive: true,
    label: 'Eingefroren (keine Bewegung)',
  },
} as const satisfies Record<string, PolicyDef>;

export type PolicyKey = keyof typeof POLICIES;
export type PolicyValue<K extends PolicyKey> = (typeof POLICIES)[K]['type'] extends 'bool'
  ? boolean
  : string[];
export type PolicyMap = { [K in PolicyKey]: PolicyValue<K> };
export const POLICY_KEYS = Object.keys(POLICIES) as PolicyKey[];

export type ScopeType = 'global' | 'class' | 'group' | 'user';

export interface PolicyLayers {
  global: Partial<Record<PolicyKey, unknown>>;
  class: Partial<Record<PolicyKey, unknown>>;
  groups: Array<Partial<Record<PolicyKey, unknown>>>;
  user: Partial<Record<PolicyKey, unknown>>;
}

export function isValidPolicyValue(key: PolicyKey, value: unknown): boolean {
  const def: PolicyDef = POLICIES[key];
  if (def.type === 'bool') return typeof value === 'boolean';
  return (
    Array.isArray(value) && value.every((v) => typeof v === 'string' && def.options.includes(v))
  );
}

function combineRestrictive(key: PolicyKey, values: unknown[]): unknown {
  const def: PolicyDef = POLICIES[key];
  if (def.type === 'bool')
    return values.includes(def.restrictive) ? def.restrictive : !def.restrictive;
  // lists: intersection = fewest permissions
  return (values as string[][]).reduce((acc, v) => acc.filter((x) => v.includes(x)));
}

export function resolvePolicies(layers: PolicyLayers): PolicyMap {
  const out = {} as Record<PolicyKey, unknown>;
  for (const key of POLICY_KEYS) {
    const valid = (v: unknown) => v !== undefined && isValidPolicyValue(key, v);
    if (valid(layers.user[key])) out[key] = layers.user[key];
    else {
      const groupVals = layers.groups.map((g) => g[key]).filter(valid);
      if (groupVals.length) out[key] = combineRestrictive(key, groupVals);
      else if (valid(layers.class[key])) out[key] = layers.class[key];
      else if (valid(layers.global[key])) out[key] = layers.global[key];
      else out[key] = POLICIES[key].default;
    }
  }
  return out as PolicyMap;
}
