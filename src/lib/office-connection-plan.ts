import plan from "../../docs/office-connection-plan.json";

/** One versioned setup record shared by Reception and every assistant adapter.
 * It carries dated evidence; no successful request automatically marks a step done.
 */
export function readOfficeConnectionPlan() {
  return structuredClone(plan);
}
