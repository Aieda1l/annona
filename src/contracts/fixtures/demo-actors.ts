import type { ActorRole } from "../enums";

// CONTRACTS §9.0 / D-024. Fixed UUIDs for every demo persona; Dev 2's seed must use the same IDs.
// No handles here: messaging handles come from env (CONTRACTS §12) and never enter git.

export type DemoActor = {
  readonly key: string;
  readonly actor_id: string;
  readonly role: ActorRole;
  readonly display_name: string;
};

export const DEMO_ACTORS: readonly DemoActor[] = [
  { key: "operator", actor_id: "00000000-0000-4000-8000-000000000001", role: "operator", display_name: "Operator (synthetic)" },
  { key: "donor_rainier", actor_id: "00000000-0000-4000-8000-000000000011", role: "donor", display_name: "Rainier Catering (synthetic)" },
  { key: "donor_pending", actor_id: "00000000-0000-4000-8000-000000000012", role: "donor", display_name: "Capitol Hill Bakery (synthetic, approval pending)" },
  { key: "donor_suspended", actor_id: "00000000-0000-4000-8000-000000000013", role: "donor", display_name: "Harbor Deli (synthetic, suspended)" },
  { key: "recipient_eastlake", actor_id: "00000000-0000-4000-8000-000000000021", role: "recipient", display_name: "Eastlake Community Pantry (synthetic)" },
  { key: "recipient_youth", actor_id: "00000000-0000-4000-8000-000000000022", role: "recipient", display_name: "Youth Meals Program (synthetic)" },
  { key: "recipient_unregistered", actor_id: "00000000-0000-4000-8000-000000000023", role: "recipient", display_name: "Northgate Meal Share (synthetic, not registered)" },
  { key: "recipient_hsp", actor_id: "00000000-0000-4000-8000-000000000024", role: "recipient", display_name: "Lakeview Senior Kitchen (synthetic, serves highly susceptible population)" },
  { key: "courier_a", actor_id: "00000000-0000-4000-8000-000000000031", role: "courier", display_name: "Courier A (synthetic, cold transport)" },
  { key: "courier_b", actor_id: "00000000-0000-4000-8000-000000000032", role: "courier", display_name: "Courier B (synthetic, cold transport)" },
  { key: "courier_c", actor_id: "00000000-0000-4000-8000-000000000033", role: "courier", display_name: "Courier C (synthetic, no cold transport)" },
];

export function findDemoActor(actorId: string): DemoActor | undefined {
  return DEMO_ACTORS.find((a) => a.actor_id === actorId);
}
