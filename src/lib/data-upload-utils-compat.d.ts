import "./data-upload-utils";

declare module "./data-upload-utils" {
  interface DatasetDiagnostics {
    /** @deprecated Use missingValuesPct instead. */
    missingPercent?: number;
  }
}
