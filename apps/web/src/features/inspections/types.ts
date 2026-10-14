export const WASTE_CLASSES = ["GLASS", "METAL", "ORGANIC", "PAPER", "PLASTIC"] as const;
export type WasteClass = (typeof WASTE_CLASSES)[number];

export type SortBy = "capturedAt" | "confidence" | "label" | "status";
export type SortOrder = "asc" | "desc";

// Same number as LOW_CONFIDENCE_THRESHOLD in the API and kConfidenceThreshold
// in the Flutter app. Below this, a prediction counts as low confidence.
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface Prediction {
  id: string;
  predictedClass: WasteClass;
  // The API sends decimals as strings, for example "0.93".
  confidence: string;
  correctedClass: WasteClass | null;
  isAccepted: boolean | null;
  inferenceSource: "ON_DEVICE" | "CLOUD";
  inferenceTimeMs: number | null;
  createdAt: string;
}

export interface InspectionImage {
  id: string;
  mimeType: string;
  fileSize: number;
}

export interface InspectionDevice {
  id: string;
  name: string | null;
  platform: "ANDROID" | "IOS" | "WEB";
}

export interface Inspection {
  id: string;
  status: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  capturedAt: string;
  latitude: string | null;
  longitude: string | null;
  predictions: Prediction[];
  images: InspectionImage[];
  device: InspectionDevice;
}

export interface InspectionPage {
  data: Inspection[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface InspectionStats {
  overTime: { date: string; count: number }[];
  distribution: { label: WasteClass; count: number }[];
  confidenceHistogram: { from: number; to: number; count: number }[];
  lowConfidence: {
    threshold: number;
    total: number;
    count: number;
    share: number;
  };
}