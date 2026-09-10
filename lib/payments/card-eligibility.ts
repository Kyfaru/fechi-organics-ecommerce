/**
 * Card payment is only offered for international orders or orders resolved
 * to a branch explicitly marked card-eligible (Nairobi/Nakuru at launch).
 * Used both client-side (to hide the option) and server-side (to enforce it).
 */
export function isCardEligible(isInternational: boolean, branchCardEligible: boolean): boolean {
  return isInternational || branchCardEligible;
}
