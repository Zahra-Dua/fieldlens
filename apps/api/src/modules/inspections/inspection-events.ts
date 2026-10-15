export type InspectionEvent = {
  type: "inspection.created";
};

type InspectionEventListener = (event: InspectionEvent) => void;

const listeners = new Set<InspectionEventListener>();

export function subscribeToInspectionEvents(
  listener: InspectionEventListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishInspectionCreated(): void {
  const event: InspectionEvent = { type: "inspection.created" };
  for (const listener of listeners) {
    listener(event);
  }
}
