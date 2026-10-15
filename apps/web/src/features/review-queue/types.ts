export type ReviewQueueFilters = {
  deviceId: string;
  dateFrom: string;
  dateTo: string;
  originalLabel: string;
  correctedLabel: string;
  minConfidence: string;
  maxConfidence: string;
};

export type ReviewQueueRow = {
  id: string;
  inspectionId: string;
  predictedClass: string;
  correctedClass: string;
  confidence: number;
  isAccepted: boolean | null;
  capturedAt: string;
  createdAt: string;
  device: {
    id: string;
    name: string | null;
    platform: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
};
