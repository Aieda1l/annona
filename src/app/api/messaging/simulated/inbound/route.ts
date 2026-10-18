export { POST } from "@/integrations/photon/http/simulated";

// Waits on the vision model (budget 15 s, D-012): give the function room so the app's own timeout answers first.
export const maxDuration = 30;
