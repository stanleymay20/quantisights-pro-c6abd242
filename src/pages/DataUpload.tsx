import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { embedInsightsBatch } from "@/lib/decision-lifecycle";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Upload, FileSpreadsheet, ArrowRight, Check, X,
  AlertTriangle, ShieldCheck, BarChart3, Info,
  Sparkles, Wand2, Globe, Calendar, Hash, TrendingUp,
  Zap, Eye, ChevronRight, Layers, Database, Activity,
  Tag,
} from "lucide-react";
import UploadTrustBadges from "@/components/security/UploadTrustBadges";
import { motion, AnimatePresence } from "framer-motion";
import {
  type DetectedSchema, type ValidationResult, type HumanizedError,
  type DatasetIntelligence, type DatasetDiagnostics, type DatasetClassification,
  type ImportMode, type ColumnMapping, type ColumnTarget,
  inferSchema, validateData, generateIntelligence, computeDiagnostics,
  classifyDataset, confidenceColor, qualityColor, humanizeError, parseCSVText,
  slugifyMetric, deduplicateMetricSlugs,
} from "@/lib/data-upload-utils";
import {
  type ParsedWorkbook,
  type WorkbookSheet,
  isSupportedDataFile,
  isWorkbookFile,
  parseWorkbookFile,
} from "@/lib/workbook-parser";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useChunkedIngestion } from "@/hooks/useChunkedIngestion";
import IngestionProgressCard from "@/components/upload/IngestionProgressCard";
import PostUploadSummary from "@/components/upload/PostUploadSummary";
import MappingIntelligencePanel from "@/components/upload/MappingIntelligencePanel";
import { buildIngestionIntelligence, type IngestionIntelligenceResult } from "@/lib/ingestion-intelligence";
import { toIngestionMetadataSnapshot } from "@/lib/ingestion-metadata";
import { discoverCrossSheetRelationships, type CrossSheetDiscoveryResult } from "@/lib/cross-sheet-discovery";
import {
  buildSnapshot,
  detectDrift,
  type DriftReport,
  type SchemaColumn,
} from "@/lib/schema-evolution";

type Step = "upload" | "autodetect" | "mapping" | "validation" | "intelligence" | "importing" | "done";

const DEFAULT_METRIC_TYPES = ["revenue", "cost", "customers", "churn", "headcount", "marketing_spend"] as const;
const COLUMN_TARGETS = ["date", "value", "region", "region_code", "segment", "metric_type", "skip"] as const;

const typeIcon = (t: string) => {
  switch (t) {
    case "date": return <Calendar className="w-3.5 h-3.5" />;
    case "value": return <Hash className="w-3.5 h-3.5" />;
    case "region": return <Globe className="w-3.5 h-3.5" />;
    case "region_code": return <Tag className="w-3.5 h-3.5" />;
    case "segment": return <BarChart3 className="w-3.5 h-3.5" />;
    case "metric_type": return <TrendingUp className="w-3.5 h-3.5" />;
    default: return <X className="w-3.5 h-3.5" />;
  }
};

// ============ Component ============
const DataUpload = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { currentProject, createProject, attachDataset, setActiveDataset } = useProject();
  const { currentWorkspaceId } = useWorkspace();
  const { subscribed, tier } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [datasetName, setDatasetName] = useState("");
  const [defaultMetricType, setDefaultMetricType] = useState("revenue");
  const [importCount, setImportCount] = useState(0);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [detectedSchema, setDetectedSchema] = useState<DetectedSchema[]>([]);
  const [intelligence, setIntelligence] = useState<DatasetIntelligence | null>(null);
  const [yearAutoFixed, setYearAutoFixed] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("single");
  const [diagnostics, setDiagnostics] = useState<DatasetDiagnostics | null>(null);
  const [classification, setClassification] = useState<DatasetClassification | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);
  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [ingestionIntel, setIngestionIntel] = useState<IngestionIntelligenceResult | null>(null);
  const [crossSheet, setCrossSheet] = useState<CrossSheetDiscoveryResult | null>(null);
  const lastFileRef = useRef<File | null>(null);

  // Phase 4: chunked worker-driven ingestion. Used for CSVs ≥ 1 MB so the UI
  // stays responsive on multi-100k-row uploads. Small CSVs keep the sync path.
  const ingestion = useChunkedIngestion();


  const valueColumnCount = useMemo(() => {
    return Object.values(mapping).filter(v => v === "value").length;
  }, [mapping]);

  const dateColumnCount = useMemo(() => {
    return Object.values(mapping).filter(v => v === "date").length;
  }, [mapping]);

  // Shared post-parse pipeline. Accepts already-parsed headers + rows so both
  // CSV text and workbook sheets feed into the same inference/classification.
  const ingestParsed = useCallback((hdrs: string[], dataRows: string[][]) => {
    if (hdrs.length === 0) return;

    // Large-dataset guard: route >50k rows to the server-side pipeline rather
    // than freeze the browser. We still let smaller-than-50k workbooks through.
    if (dataRows.length > 50_000) {
      toast({
        title: "Large dataset detected",
        description: `${dataRows.length.toLocaleString()} rows exceeds the 50k browser limit. Use Data Connectors (Settings → Connectors) for server-side ingestion.`,
        variant: "destructive",
      });
      return;
    }

    setHeaders(hdrs);
    setAllRows(dataRows);
    setRows(dataRows.slice(0, 100));

    const schema = inferSchema(hdrs, dataRows);
    setDetectedSchema(schema);

    const autoMap: ColumnMapping = {};
    schema.forEach(s => { autoMap[s.colIdx] = s.inferredType; });
    setMapping(autoMap);

    const valCount = schema.filter(s => s.inferredType === "value").length;
    if (valCount > 1) {
      setImportMode("multi");
    }

    const cls = classifyDataset(hdrs, autoMap);
    setClassification(cls);

    // Phase 8: build full ingestion intelligence (locale, repair report,
    // dictionary, similarity, semantic schema) so the mapping UI can surface it.
    try {
      const diag = computeDiagnostics(dataRows, hdrs, autoMap, schema);
      const intel = buildIngestionIntelligence({
        headers: hdrs,
        rows: dataRows,
        schema,
        mapping: autoMap,
        diagnostics: diag,
      });
      setIngestionIntel(intel);
    } catch (err) {
      console.warn("[DataUpload] buildIngestionIntelligence failed:", err);
      setIngestionIntel(null);
    }

    setStep("autodetect");
  }, [toast]);

  const handleParse = useCallback((text: string) => {
    const { headers: hdrs, rows: dataRows } = parseCSVText(text);
    ingestParsed(hdrs, dataRows);
  }, [ingestParsed]);

  const loadWorkbookSheet = useCallback((wb: ParsedWorkbook, sheetName: string) => {
    const sheet = wb.sheets.find(s => s.name === sheetName);
    if (!sheet || sheet.headers.length === 0 || sheet.rows.length === 0) {
      toast({ title: "Empty sheet", description: `"${sheetName}" has no usable data.`, variant: "destructive" });
      return;
    }
    setActiveSheetName(sheetName);
    setDatasetName(wb.sheetCount > 1 ? `${wb.workbookName} — ${sheetName}` : wb.workbookName);
    ingestParsed(sheet.headers, sheet.rows);
  }, [ingestParsed, toast]);

  const handleWorkbookFile = useCallback(async (f: File) => {
    try {
      const parsed = await parseWorkbookFile(f);
      const visibleSheets = parsed.sheets.filter(s => !s.hidden && s.rows.length > 0);
      if (visibleSheets.length === 0) {
        toast({ title: "No data sheets found", description: "Workbook contains no readable sheets.", variant: "destructive" });
        return;
      }
      setWorkbook(parsed);
      try {
        setCrossSheet(discoverCrossSheetRelationships(parsed));
      } catch (err) {
        console.warn("[DataUpload] cross-sheet discovery failed:", err);
        setCrossSheet(null);
      }
      if (visibleSheets.length === 1) {
        loadWorkbookSheet(parsed, visibleSheets[0].name);
      } else {
        // Multi-sheet: open the first by default, user can switch via selector
        loadWorkbookSheet(parsed, visibleSheets[0].name);
      }
    } catch (err) {
      console.error("[DataUpload] workbook parse failed", err);
      toast({ title: "Could not read workbook", description: String(err), variant: "destructive" });
    }
  }, [loadWorkbookSheet, toast]);

  const acceptFile = useCallback((f: File) => {
    if (f.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 20MB.", variant: "destructive" });
      return;
    }
    if (!isSupportedDataFile(f.name)) {
      toast({ title: "Unsupported file type", description: "Use CSV, XLSX, XLS, XLSM, or ODS.", variant: "destructive" });
      return;
    }
    setFile(f);
    lastFileRef.current = f;
    setWorkbook(null);
    setActiveSheetName(null);
    setDrift(null);
    setIngestionIntel(null);
    setCrossSheet(null);
    if (isWorkbookFile(f.name)) {
      setDatasetName(f.name.replace(/\.(xlsx|xls|xlsm|ods)$/i, ""));
      handleWorkbookFile(f);
    } else {
      setDatasetName(f.name.replace(/\.csv$/i, ""));
      // Phase 4: route large CSVs (>1MB) through the Web Worker pipeline so the
      // UI thread stays free. Smaller files keep the fast synchronous path.
      if (f.size > 1024 * 1024) {
        ingestion.start(f).catch((err) => {
          toast({
            title: "Ingestion failed to start",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        });
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => handleParse(ev.target?.result as string);
        reader.readAsText(f);
      }
    }
  }, [handleParse, handleWorkbookFile, ingestion, toast]);

  // Phase 4: when the worker finishes, feed parsed rows into the shared
  // post-parse pipeline (inference + classification). When the dataset is
  // routed to the server pipeline, surface a guidance toast instead.
  useEffect(() => {
    if (ingestion.status === "done") {
      if (ingestion.shouldRouteToServer) {
        toast({
          title: "Routed to server pipeline",
          description: `${(ingestion.progress.totalRowsEstimate ?? 0).toLocaleString()} rows exceeds the in-browser ceiling. Use Data Connectors to finish ingestion server-side.`,
        });
      } else if (ingestion.result) {
        ingestParsed(ingestion.result.headers, ingestion.result.rows);
      }
    }
    if (ingestion.status === "error" && ingestion.error) {
      toast({ title: "Ingestion error", description: ingestion.error, variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestion.status]);

  const retryIngestion = useCallback(() => {
    const last = lastFileRef.current;
    if (!last) return;
    ingestion.reset();
    acceptFile(last);
  }, [acceptFile, ingestion]);


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

  // Helper: find colIdx mapped to a target type
  const findMappedColIdx = (target: ColumnTarget): number => {
    const entry = Object.entries(mapping).find(([, v]) => v === target);
    return entry ? Number(entry[0]) : -1;
  };

  const findAllMappedColIdx = (target: ColumnTarget): number[] => {
    return Object.entries(mapping)
      .filter(([, v]) => v === target)
      .map(([k]) => Number(k));
  };

  const applyYearToDateFix = () => {
    const dateIdx = findMappedColIdx("date");
    if (dateIdx < 0) return;
    const fixedRows = allRows.map(row => {
      const newRow = [...row];
      const val = newRow[dateIdx]?.trim();
      if (val && /^\d{4}$/.test(val)) {
        newRow[dateIdx] = `${val}-01-01`;
      }
      return newRow;
    });
    setAllRows(fixedRows);
    setRows(fixedRows.slice(0, 100));
    setYearAutoFixed(true);
    toast({ title: "Dates converted", description: "Year values converted to YYYY-01-01 format." });
  };

  const autoSelectBestDate = () => {
    const dateCols = Object.entries(mapping).filter(([, v]) => v === "date");
    if (dateCols.length <= 1) return;
    // Pick the one with best schema confidence
    const best = dateCols.reduce((bestEntry, [colIdxStr]) => {
      const colIdx = Number(colIdxStr);
      const det = detectedSchema.find(d => d.colIdx === colIdx);
      const bestDet = detectedSchema.find(d => d.colIdx === Number(bestEntry[0]));
      return (det?.confidence ?? 0) > (bestDet?.confidence ?? 0) ? [colIdxStr, "date"] : bestEntry;
    }, dateCols[0]);
    const bestColIdx = Number(best[0]);
    const newMapping = { ...mapping };
    dateCols.forEach(([colIdxStr]) => {
      const colIdx = Number(colIdxStr);
      if (colIdx !== bestColIdx) newMapping[colIdx] = "skip";
    });
    setMapping(newMapping);
    const bestHeader = headers[bestColIdx] || `col ${bestColIdx}`;
    toast({ title: "Date column selected", description: `"${bestHeader}" set as primary time dimension.` });
  };

  const hasYearOnlyDates = useMemo(() => {
    return detectedSchema.some(s => s.autoFix === "year_to_date");
  }, [detectedSchema]);

  // Get sample values for each column index from first 3 rows
  const sampleValuesByColIdx = useMemo(() => {
    const map: Record<number, string[]> = {};
    headers.forEach((_, idx) => {
      map[idx] = rows.slice(0, 3).map(r => r[idx] || "").filter(Boolean);
    });
    return map;
  }, [headers, rows]);

  const runValidation = () => {
    if (dateColumnCount > 1) {
      toast({
        title: "Multiple date columns detected",
        description: "Only one column can be mapped as date. Please choose one primary time dimension.",
        variant: "destructive",
      });
      return;
    }
    const hasMappedValue = Object.values(mapping).includes("value");
    if (!hasMappedValue) {
      toast({ title: "Value column required", description: "Please map at least one value column.", variant: "destructive" });
      return;
    }

    let result: ValidationResult;
    try {
      result = validateData(allRows, headers, mapping, importMode);
      console.log("[DataUpload] Validation result:", {
        totalRows: result.totalRows,
        validRows: result.validRows,
        validPoints: result.validPoints,
        totalPoints: result.totalPoints,
        errorCount: result.errors.length,
        qualityScore: result.qualityScore,
      });
      setValidation(result);
    } catch (err) {
      console.error("[DataUpload] validateData threw:", err);
      toast({ title: "Validation error", description: String(err), variant: "destructive" });
      return;
    }

    try {
      const intel = generateIntelligence(headers, allRows, mapping, result, importMode);
      setIntelligence(intel);
      console.log("[DataUpload] Intelligence generated:", { recordCount: intel.recordCount });
    } catch (err) {
      console.error("[DataUpload] generateIntelligence threw:", err);
      setIntelligence({
        recordCount: allRows.length,
        validPointCount: result.validPoints,
        columnCount: headers.length,
        dateSpan: null,
        regionCount: 0,
        regions: [],
        metricTypes: [],
        signals: [],
        qualityScore: result.qualityScore,
        qualityLabel: "Unknown",
      });
    }

    try {
      const diag = computeDiagnostics(allRows, headers, mapping, detectedSchema);
      setDiagnostics(diag);
    } catch (err) {
      console.error("[DataUpload] computeDiagnostics threw:", err);
    }

    try {
      const cls = classifyDataset(headers, mapping);
      setClassification(cls);
    } catch (err) {
      console.error("[DataUpload] classifyDataset threw:", err);
    }

    // Always advance — never leave user stranded
    const shouldShowIntelligence = result.errors.length === 0 || result.validRows > 0;
    console.log("[DataUpload] Step transition:", { shouldShowIntelligence, validRows: result.validRows, errorCount: result.errors.length });

    if (shouldShowIntelligence) {
      setStep("intelligence");
    } else {
      setStep("validation");
    }
  };

  const handleImport = async () => {
    if (!currentOrgId || !user || !file) {
      toast({ title: "Missing context", description: "Organization, user, or file not available.", variant: "destructive" });
      return;
    }

    if (tier === "starter") {
      const { count } = await supabase
        .from("datasets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrgId);
      if ((count ?? 0) >= 1) {
        toast({ title: "Dataset limit reached", description: "Starter plan allows 1 dataset. Upgrade to Growth for unlimited.", variant: "destructive" });
        return;
      }
    }
    if (!subscribed && tier !== null) {
      // Only block if user had a subscription that expired; allow users with no subscription record (demo/new)
      toast({ title: "Subscription expired", description: "Please renew your subscription to upload datasets.", variant: "destructive" });
      return;
    }

    setStep("importing");
    const pipelineStartedAt = Date.now();
    let pipelineRunId: string | null = null;

    try {
      const filePath = `${currentOrgId}/${Date.now()}_${file.name}`;
      await supabase.storage.from("datasets").upload(filePath, file);

      // Convert colIdx mapping to deterministic composite keys for storage
      const storedMapping: Record<string, ColumnTarget> = {};
      Object.entries(mapping).forEach(([colIdxStr, target]) => {
        const colIdx = Number(colIdxStr);
        const headerName = headers[colIdx] || `col_${colIdx}`;
        storedMapping[`${colIdx}:${headerName}`] = target;
      });

      const { data: dataset, error: dsError } = await supabase
        .from("datasets")
        .insert({
          organization_id: currentOrgId,
          workspace_id: currentWorkspaceId || null,
          name: datasetName,
          file_path: filePath,
          uploaded_by: user.id,
          row_count: allRows.length,
          column_mapping: storedMapping,
          status: "processing",
        })
        .select()
        .single();

      if (dsError) throw dsError;

      // Create dataset version
      const ingestionMetadataSnapshot = ingestionIntel
        ? toIngestionMetadataSnapshot(ingestionIntel, crossSheet)
        : null;
      const { data: versionData } = await supabase.from("dataset_versions").insert({
        dataset_id: dataset.id,
        organization_id: currentOrgId,
        workspace_id: currentWorkspaceId || null,
        version_number: 1,
        file_path: filePath,
        row_count: allRows.length,
        column_mapping: storedMapping,
        change_summary: importMode === "multi" ? `Multi-metric import (${findAllMappedColIdx("value").length} metrics normalized)` : "Initial upload",
        created_by: user.id,
        is_active: true,
        metadata: (ingestionMetadataSnapshot ?? {}) as never,
      }).select("id").single();

      // ═══════════════════════════════════════════════════════
      // SCHEMA EVOLUTION & DATA LINEAGE — Automated tracking
      // ═══════════════════════════════════════════════════════

      // Record schema evolution (what columns were detected and mapped)
      const schemaColumns = Object.entries(storedMapping).map(([key, target]) => ({
        column: key.split(":")[1] || key,
        mappedAs: target,
      }));

      // Phase 5: detect drift against the most recent prior dataset with the
      // same name in this org. First snapshot is recorded as 'initial_upload'.
      const toSnapshotColumns = (cols: { column: string; mappedAs: string }[]): SchemaColumn[] =>
        cols.map((c) => {
          const det = detectedSchema.find((d) => d.column === c.column);
          const role = (c.mappedAs as SchemaColumn["role"]) ?? "skip";
          const type: SchemaColumn["type"] = det
            ? det.inferredType === "date"
              ? "date"
              : det.inferredType === "value"
                ? "number"
                : "text"
            : "unknown";
          return { name: c.column, type, role };
        });

      let driftReport: DriftReport | null = null;
      try {
        const { data: priorDatasets } = await supabase
          .from("datasets")
          .select("id, current_version, column_mapping")
          .eq("organization_id", currentOrgId)
          .eq("name", datasetName)
          .neq("id", dataset.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const prior = priorDatasets?.[0];
        if (prior?.column_mapping && typeof prior.column_mapping === "object") {
          const priorCols = Object.entries(prior.column_mapping as Record<string, string>).map(
            ([key, target]) => ({ column: key.split(":")[1] || key, mappedAs: target }),
          );
          const prevSnap = buildSnapshot(prior.id, prior.current_version ?? 1, toSnapshotColumns(priorCols));
          const nextSnap = buildSnapshot(dataset.id, 1, toSnapshotColumns(schemaColumns));
          driftReport = detectDrift(prevSnap, nextSnap);
        }
      } catch (err) {
        console.warn("[SchemaEvolution] drift detection skipped:", err);
      }
      setDrift(driftReport);

      const driftRows = driftReport && driftReport.totalChanges > 0
        ? driftReport.changes.map((c) => ({
            organization_id: currentOrgId,
            dataset_id: dataset.id,
            change_type: c.changeType,
            column_name: c.columnName,
            old_type: c.oldType ?? null,
            new_type: c.newType ?? null,
            detected_by: user.id,
            metadata: {
              confidence: c.confidence,
              recommendation: c.recommendation,
              old_name: c.oldName,
              old_role: c.oldRole,
              new_role: c.newRole,
            },
          }))
        : [];

      const { error: schemaErr } = await supabase.from("schema_evolution_log").insert([
        {
          organization_id: currentOrgId,
          dataset_id: dataset.id,
          change_type: "initial_upload",
          detected_by: user.id,
          metadata: {
            columns: schemaColumns,
            row_count: allRows.length,
            import_mode: importMode,
            drift_summary: driftReport
              ? {
                  total: driftReport.totalChanges,
                  backward_compatible: driftReport.backwardCompatible,
                }
              : null,
          },
        },
        ...driftRows,
      ]);
      if (schemaErr) console.error("[SchemaEvolution] Failed to log:", schemaErr.message, schemaErr.details);


      // Record data lineage: CSV file → dataset → metrics
      const { error: lineageErr } = await supabase.from("data_lineage").insert([{
        organization_id: currentOrgId,
        source_type: "file",
        source_id: dataset.id,
        source_name: file?.name ?? "unknown",
        target_type: "dataset",
        target_id: dataset.id,
        target_name: datasetName,
        transformation: "csv_import",
        transformation_details: { 
          columns_mapped: Object.keys(storedMapping).length,
          rows: allRows.length,
          import_mode: importMode,
        },
      }]);
      if (lineageErr) console.error("[DataLineage] Failed to log:", lineageErr.message, lineageErr.details);
      // ═══════════════════════════════════════════════════════

      // Create pipeline run for observability
      const { data: pipelineRun } = await supabase.from("pipeline_runs").insert({
        organization_id: currentOrgId,
        workspace_id: currentWorkspaceId || null,
        dataset_id: dataset.id,
        run_type: "full",
        status: "running",
        stage: "raw_ingest",
        metadata: { import_mode: importMode, file_name: file.name },
      }).select("id").single();

      pipelineRunId = pipelineRun?.id ?? null;

      // Build raw records from parsed rows
      const rawRecords: Array<{
        organization_id: string;
        workspace_id: string | null;
        dataset_id: string;
        dataset_version_id: string | null;
        row_index: number;
        raw_data: Record<string, string>;
      }> = [];

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        if (row.every(cell => !cell || !cell.trim())) continue;
        const rowData: Record<string, string> = {};
        headers.forEach((_, idx) => {
          rowData[String(idx)] = row[idx] || "";
        });
        rawRecords.push({
          organization_id: currentOrgId,
          workspace_id: currentWorkspaceId || null,
          dataset_id: dataset.id,
          dataset_version_id: versionData?.id || null,
          row_index: i,
          raw_data: rowData,
        });
      }

      // Batch insert raw records
      let rawInserted = 0;
      for (let i = 0; i < rawRecords.length; i += 500) {
        const batch = rawRecords.slice(i, i + 500);
        const { error } = await supabase.from("raw_records").insert(batch);
        if (error) throw error;
        rawInserted += batch.length;
      }

      // Update pipeline with raw count
      if (pipelineRunId) {
        await supabase.from("pipeline_runs").update({ raw_count: rawInserted, stage: "raw_complete" }).eq("id", pipelineRunId);
      }

      // ═══════════════════════════════════════════════════════
      // TIER 2: CLEAN LAYER — Transform raw → normalized metrics
      // ═══════════════════════════════════════════════════════

      const dateIdx = findMappedColIdx("date");
      const regionIdx = findMappedColIdx("region");
      const regionCodeIdx = findMappedColIdx("region_code");
      const segmentIdx = findMappedColIdx("segment");
      const metricTypeIdx = findMappedColIdx("metric_type");
      const valueColIndices = findAllMappedColIdx("value");

      // Pre-compute slugified & deduplicated metric names for multi-metric
      const valueColHeaders = valueColIndices.map(i => headers[i] || `col_${i}`);
      const metricSlugs = deduplicateMetricSlugs(valueColHeaders.map(c => slugifyMetric(c)));

      // Null sentinel for source_id (matches DB default)
      const NULL_SOURCE = "00000000-0000-0000-0000-000000000000";

      // Clean a numeric string: strip currency symbols, thousand separators, whitespace
      const cleanNumeric = (raw: string | undefined): number => {
        if (!raw) return NaN;
        const cleaned = raw
          .replace(/[\s$€£¥₹,]/g, "")
          .replace(/\(([^)]+)\)/, "-$1");
        return parseFloat(cleaned);
      };

      const metricsToInsert: Array<{
        organization_id: string;
        workspace_id: string | null;
        dataset_id: string;
        metric_type: string;
        value: number;
        date: string;
        region: string;
        segment: string;
        source_id: string;
      }> = [];

      let rowCounter = 0;
      // Counts raw rows that produced at least one metric, as opposed to
      // `inserted` below (metric ROWS upserted) -- in multi-metric mode one
      // raw row fans out into N metric rows, so using `inserted` for
      // pipeline_runs.transformed_count made the "Clean" pipeline stage
      // display a larger count than "Raw", which reads as backwards for a
      // funnel that's supposed to only ever hold steady or shrink.
      let rawRowsCleaned = 0;
      for (const row of allRows) {
        if (row.every(cell => !cell || !cell.trim())) continue;
        rowCounter++;
        let rowProducedMetric = false;

        let dateVal: string;
        if (dateIdx >= 0) {
          const rawDate = row[dateIdx]?.trim();
          if (!rawDate) { continue; }
          dateVal = rawDate;
          if (/^\d{4}$/.test(dateVal)) dateVal = `${dateVal}-01-01`;
          else if (/^\d{4}[/-]Q[1-4]$/i.test(dateVal)) {
            const y = dateVal.slice(0, 4);
            const q = parseInt(dateVal.slice(-1));
            dateVal = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
          } else if (/^\d{4}[/-]\d{2}$/.test(dateVal)) {
            dateVal = `${dateVal}-01`;
          }
          if (isNaN(Date.parse(dateVal))) continue;
        } else {
          // No date column: spread rows across synthetic dates (year/month/day)
          // to avoid upsert collision on the date dimension
          const syntheticYear = 2024 + Math.floor((rowCounter - 1) / 365);
          const dayOfYear = ((rowCounter - 1) % 365);
          const syntheticMonth = Math.floor(dayOfYear / 28) % 12 + 1;
          const syntheticDay = (dayOfYear % 28) + 1;
          dateVal = `${syntheticYear}-${String(syntheticMonth).padStart(2, "0")}-${String(syntheticDay).padStart(2, "0")}`;
        }

        const regionVal = regionIdx >= 0 ? (row[regionIdx]?.trim() || "") : "";
        const regionCodeVal = regionCodeIdx >= 0 ? (row[regionCodeIdx]?.trim() || "") : "";
        const effectiveRegion = regionVal || regionCodeVal || "";
        const segmentVal = segmentIdx >= 0 ? (row[segmentIdx]?.trim() || "") : "";

        if (importMode === "multi" && valueColIndices.length > 1) {
          for (let vi = 0; vi < valueColIndices.length; vi++) {
            const valIdx = valueColIndices[vi];
            const val = cleanNumeric(row[valIdx]);
            if (isNaN(val) || !isFinite(val) || Math.abs(val) > 1e12) continue;
            metricsToInsert.push({
              organization_id: currentOrgId,
              workspace_id: currentWorkspaceId || null,
              dataset_id: dataset.id,
              metric_type: metricSlugs[vi],
              value: val,
              date: dateVal,
              region: effectiveRegion,
              segment: segmentVal,
              source_id: NULL_SOURCE,
            });
            rowProducedMetric = true;
          }
        } else {
          const valueIdx = valueColIndices[0];
          if (valueIdx === undefined) continue;
          const val = cleanNumeric(row[valueIdx]);
          if (isNaN(val) || !isFinite(val) || Math.abs(val) > 1e12) continue;
          // Use metric_type column if mapped; otherwise derive from value column header
          const derivedType = metricTypeIdx >= 0
            ? (row[metricTypeIdx]?.trim() || defaultMetricType)
            : (valueColHeaders[0] ? slugifyMetric(valueColHeaders[0]) : defaultMetricType);
          const mt = derivedType;
          metricsToInsert.push({
            organization_id: currentOrgId,
            workspace_id: currentWorkspaceId || null,
            dataset_id: dataset.id,
            metric_type: mt,
            value: val,
            date: dateVal,
            region: effectiveRegion,
            segment: segmentVal,
            source_id: NULL_SOURCE,
          });
          rowProducedMetric = true;
        }
        if (rowProducedMetric) rawRowsCleaned++;
      }

      // Deduplicate metrics by conflict key before upserting
      const deduped = new Map<string, typeof metricsToInsert[0]>();
      for (const m of metricsToInsert) {
        const key = `${m.organization_id}|${m.metric_type}|${m.date}|${m.region}|${m.segment}|${m.source_id}`;
        deduped.set(key, m); // last-write-wins
      }
      const uniqueMetrics = Array.from(deduped.values());

      let inserted = 0;
      for (let i = 0; i < uniqueMetrics.length; i += 500) {
        const batch = uniqueMetrics.slice(i, i + 500);
        const { error } = await supabase.from("metrics").upsert(batch, { onConflict: "organization_id,metric_type,date,region,segment,source_id" });
        if (error) throw error;
        inserted += batch.length;
      }

      // Mark raw records as transformed
      await supabase.from("raw_records")
        .update({ transform_status: "transformed", transformed_at: new Date().toISOString() })
        .eq("dataset_id", dataset.id)
        .eq("transform_status", "pending");

      // Update pipeline
      if (pipelineRunId) {
        await supabase.from("pipeline_runs").update({ transformed_count: rawRowsCleaned, stage: "transform_complete" }).eq("id", pipelineRunId);
      }

      // Quality gate: verify dataset status transition
      const { error: statusErr } = await supabase
        .from("datasets")
        .update({ status: "completed", row_count: inserted, current_version: 1, last_refreshed_at: new Date().toISOString() })
        .eq("id", dataset.id);
      if (statusErr) {
        console.error("[QualityGate] Dataset status update failed:", { dataset_id: dataset.id, org_id: currentOrgId, error: statusErr.message });
      }

      // Auto-create or use current project, attach dataset, and set as active
      let projectId = currentProject?.id;
      if (!projectId) {
        const proj = await createProject(datasetName || file.name.replace(/\.\w+$/, ""));
        projectId = proj.id;
      }
      await attachDataset(projectId, dataset.id);
      await setActiveDataset(projectId, dataset.id);

      // Quality gate: verify metrics count matches expectation
      const { count: verifiedCount } = await supabase
        .from("metrics")
        .select("id", { count: "exact", head: true })
        .eq("dataset_id", dataset.id);

      const countMismatch = verifiedCount !== null && verifiedCount !== inserted;
      if (countMismatch) {
        console.warn("[QualityGate] Metric count mismatch", { expected: inserted, actual: verifiedCount, dataset_id: dataset.id, org_id: currentOrgId });
      }

      // ═══════════════════════════════════════════════════════
      // TIER 3: ANALYTICAL LAYER — Compute aggregates + insights
      // ═══════════════════════════════════════════════════════

      // Fire aggregates + insights + data profiling in parallel (with retry for reliability)
      const [aggResult] = await Promise.allSettled([
        invokeWithRetry("refresh-aggregates", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id, pipeline_run_id: pipelineRunId },
        }),
        invokeWithRetry("generate-insights", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id },
        }),
        invokeWithRetry("data-profiler", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id },
        }),
      ]);

      // Embed new insights into institutional memory (non-blocking)
      embedInsightsBatch(currentOrgId);

      // invokeWithRetry never rejects -- it always resolves { data, error },
      // even after exhausting retries -- so aggResult.status is "fulfilled"
      // whether or not the call actually succeeded. Checking only
      // aggResult.status === "rejected" here meant a real refresh-aggregates
      // failure (aggregated_count stuck at 0) was never detected, and the
      // pipeline got finalized as "complete" below regardless, showing an
      // Analytical stage of 0 next to a "Complete" badge.
      const aggFailed = aggResult.status === "rejected" ? true : !!aggResult.value.error;
      if (aggFailed) {
        const reason = aggResult.status === "rejected" ? aggResult.reason : aggResult.value.error?.message;
        console.warn("[Pipeline] Aggregate refresh failed:", reason);
      }

      // ═══════════════════════════════════════════════════════
      // TIER 4: DECISION LAYER — Auto-generate advisory → decisions
      // ═══════════════════════════════════════════════════════
      try {
        await invokeWithRetry("prescriptive-advisory", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id, role_type: "ceo" },
        });
        await invokeWithRetry("auto-create-decisions", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id },
        });
      } catch (decisionErr) {
        console.warn("[Pipeline] Auto-decision creation failed (non-blocking):", decisionErr);
      }

      // Record lineage: dataset → metrics → aggregates
      const { error: lineage2Err } = await supabase.from("data_lineage").insert([
        {
          organization_id: currentOrgId,
          source_type: "dataset",
          source_id: dataset.id,
          source_name: datasetName,
          target_type: "metrics",
          target_id: dataset.id,
          target_name: `${datasetName} metrics`,
          transformation: "normalize_clean",
          transformation_details: { records_inserted: verifiedCount ?? inserted },
        },
        {
          organization_id: currentOrgId,
          source_type: "metrics",
          source_id: dataset.id,
          source_name: `${datasetName} metrics`,
          target_type: "aggregates",
          target_id: dataset.id,
          target_name: `${datasetName} aggregates`,
          transformation: "refresh_aggregates",
          transformation_details: { period_types: ["monthly", "quarterly", "yearly"] },
        },
      ]);
      if (lineage2Err) console.error("[DataLineage] Post-import lineage failed:", lineage2Err.message, lineage2Err.details);

      // Finalize pipeline run. Only claim the Analytical stage completed if
      // refresh-aggregates actually succeeded -- otherwise the run stays
      // reported at the "aggregating" stage it failed at, with a "failed"
      // status, instead of a false "complete".
      if (pipelineRunId) {
        await supabase.from("pipeline_runs").update(
          aggFailed
            ? {
                status: "failed",
                stage: "aggregating",
                error_message: "Analytical aggregation failed after the raw and clean layers completed successfully.",
                completed_at: new Date().toISOString(),
                duration_ms: Date.now() - pipelineStartedAt,
              }
            : {
                status: "completed",
                stage: "complete",
                completed_at: new Date().toISOString(),
                duration_ms: Date.now() - pipelineStartedAt,
              }
        ).eq("id", pipelineRunId);
      }

      setImportCount(verifiedCount ?? inserted);
      setStep("done");
      toast({
        title: `Imported ${(verifiedCount ?? inserted).toLocaleString()} records successfully!`,
        description: countMismatch
          ? `Note: ${inserted - (verifiedCount ?? 0)} duplicate rows were deduplicated via upsert.`
          : `Data processed through raw → clean → analytical pipeline.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error
        ? err.message
        : (typeof err === "object" && err !== null && "message" in err)
          ? String((err as Record<string, unknown>).message)
          : JSON.stringify(err);
      if (pipelineRunId) {
        await supabase.from("pipeline_runs").update({
          status: "failed",
          stage: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - pipelineStartedAt,
        }).eq("id", pipelineRunId);
      }
      console.error("[ImportPipeline] Fatal error:", { dataset_name: datasetName, org_id: currentOrgId, project_id: currentProject?.id, stage: step, error: message });
      toast({ title: "Import failed", description: message, variant: "destructive" });
      setStep("mapping");
    }
  };
  // Step indicator
  const steps = [
    { key: "upload", label: "Upload" },
    { key: "autodetect", label: "Detect" },
    { key: "mapping", label: "Map" },
    { key: "intelligence", label: "Preview" },
    { key: "importing", label: "Import" },
  ];
  const currentStepIndex = steps.findIndex(s => s.key === step || (step === "validation" && s.key === "intelligence"));

  return (
    <>
        <header className="h-14 border-b border-border/30 flex items-center px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Data Import</h1>
          </div>
        </header>

        {step !== "upload" && step !== "done" && (
          <div className="px-8 py-3 border-b border-border/20 bg-muted/20">
            <div className="flex items-center gap-1 max-w-xl">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    i <= currentStepIndex ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}>
                    {i < currentStepIndex ? <Check className="w-3 h-3" /> : <span className="w-4 text-center">{i + 1}</span>}
                    {s.label}
                  </div>
                  {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <main className="flex-1 p-8 overflow-auto">
          <AnimatePresence mode="wait">
            {/* Step: Upload */}
            {step === "upload" && ingestion.status !== "idle" && ingestion.status !== "done" && (
              <motion.div
                key="upload-progress"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              >
                <IngestionProgressCard
                  fileName={file?.name ?? "dataset"}
                  status={ingestion.status}
                  progress={ingestion.progress}
                  error={ingestion.error}
                  onCancel={ingestion.cancel}
                  onRetry={retryIngestion}
                />
              </motion.div>
            )}
            {step === "upload" && (ingestion.status === "idle" || ingestion.status === "done") && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-border hover:border-primary/40 rounded-xl p-12 flex flex-col items-center justify-center transition-colors cursor-pointer min-h-[400px] bg-card"
                onClick={() => document.getElementById("csv-input")?.click()}
              >
                <Upload className="w-16 h-16 text-muted-foreground mb-4" />
                <h2 className="text-[16px] font-semibold tracking-tight mb-2">Upload Dataset</h2>
                <p className="text-muted-foreground text-sm mb-4">Drag & drop or click to browse</p>
                <p className="text-xs text-muted-foreground">CSV, XLSX, XLS, XLSM, ODS · up to 20MB · up to 50,000 rows in-browser · larger routes to server pipeline</p>
                <input id="csv-input" type="file" accept=".csv,.xlsx,.xls,.xlsm,.ods" className="hidden" onChange={handleFileSelect} />
                <UploadTrustBadges />
              </motion.div>
            )}

            {/* Step: Autodetect */}
            {step === "autodetect" && (
              <motion.div
                key="autodetect"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-1">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight">Dataset Structure Detected</h2>
                        <p className="text-xs text-muted-foreground">
                          {file?.name} · {allRows.length.toLocaleString()} rows · {headers.length} columns
                        </p>
                      </div>
                    </div>

                    {/* Dataset Classification Badge */}
                    {classification && classification.confidence > 40 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-3 rounded-lg border border-primary/20 bg-primary/5"
                      >
                        <div className="flex items-center gap-3">
                          <Database className="w-4 h-4 text-primary shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              Detected domain: <span className="text-primary">{classification.type}</span>
                              {classification.subType && <span className="text-muted-foreground"> · {classification.subType}</span>}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${confidenceColor(classification.confidence)}`}>
                            {Math.round(classification.confidence)}% confidence
                          </Badge>
                        </div>
                        {classification.recommendedWorkflows.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5 ml-7">
                            <span className="text-[10px] text-muted-foreground">Recommended:</span>
                            {classification.recommendedWorkflows.map(w => (
                              <Badge key={w} variant="outline" className="text-[10px] bg-muted/30">{w}</Badge>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Workbook sheet selector — only when an XLSX/ODS contained multiple sheets */}
                    {workbook && workbook.sheets.filter(s => !s.hidden && s.rows.length > 0).length > 1 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-3 rounded-lg border border-border bg-muted/20"
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-primary" />
                            <p className="text-sm font-medium">
                              Workbook: <span className="text-primary">{workbook.workbookName}</span>
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {workbook.sheetCount} sheet{workbook.sheetCount === 1 ? "" : "s"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-2">
                          Select the sheet to import. Hidden sheets are excluded.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {workbook.sheets
                            .filter(s => !s.hidden && s.rows.length > 0)
                            .map(s => (
                              <button
                                key={s.name}
                                type="button"
                                onClick={() => loadWorkbookSheet(workbook, s.name)}
                                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                                  activeSheetName === s.name
                                    ? "bg-primary/15 border-primary/40 text-primary"
                                    : "bg-background border-border hover:border-primary/40"
                                }`}
                              >
                                {s.name}
                                <span className="ml-1.5 text-[10px] text-muted-foreground">
                                  {s.rowCount.toLocaleString()}r · {s.columnCount}c
                                </span>
                              </button>
                            ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Import Mode Toggle */}
                    {valueColumnCount >= 2 && (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="mt-4 p-4 rounded-lg border border-border bg-muted/20"
                      >
                        <p className="text-sm font-medium mb-3 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-primary" /> Import Mode
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setImportMode("single")}
                            className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                              importMode === "single"
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border hover:border-primary/30"
                            }`}
                          >
                            <p className="text-sm font-medium">Single Metric</p>
                            <p className="text-xs text-muted-foreground mt-0.5">One value column mapped to a metric type</p>
                          </button>
                          <button
                            onClick={() => setImportMode("multi")}
                            className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                              importMode === "multi"
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border hover:border-primary/30"
                            }`}
                          >
                            <p className="text-sm font-medium">Multi-Metric Dataset</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Each numeric column becomes a separate metric ({valueColumnCount} detected)
                            </p>
                          </button>
                        </div>
                        {importMode === "multi" && (
                          <p className="text-xs text-primary mt-2 flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            Wide format will be automatically normalized to long format during import.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </CardContent>
                </Card>


                {/* Ingestion Intelligence — surfaced BEFORE mapping rows & sample data */}
                {ingestionIntel && (
                  <MappingIntelligencePanel intelligence={ingestionIntel} relationships={crossSheet} />
                )}

                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-lg font-semibold tracking-tight mb-1">Column Mapping</h2>
                    <p className="text-xs text-muted-foreground mb-4">Detected field types and confidence per column.</p>
                    {/* Column header strip */}
                    <div className="hidden md:grid grid-cols-[1.6fr_1.4fr_1.6fr_1fr_1.1fr] gap-3 px-3 pb-2 mb-1 border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      <div>Column</div>
                      <div>Badges</div>
                      <div>Sample Values</div>
                      <div>Detected Type</div>
                      <div>Confidence</div>
                    </div>
                    <div className="space-y-2">
                      {detectedSchema.map((det) => {
                        const profile = ingestionIntel?.semanticSchema.profiles.find((p) => p.colIdx === det.colIdx);
                        const tags: string[] = [];
                        if (profile?.semanticType === "pii") tags.push("PII");
                        if (profile?.semanticType === "identifier" || profile?.businessRole === "entity_key") {
                          tags.push(profile?.businessRole === "entity_key" ? "Entity" : "Identifier");
                        }
                        if (det.inferredType === "date") tags.push("Date");
                        if (profile?.businessRole === "financial_kpi") tags.push("Currency");
                        if (
                          profile?.businessRole &&
                          ["financial_kpi", "operational_kpi", "customer_kpi", "workforce_kpi", "risk_kpi"].includes(profile.businessRole)
                        ) {
                          tags.push("KPI");
                        }
                        const confBar =
                          det.confidence >= 85 ? "bg-success" : det.confidence >= 65 ? "bg-warning" : "bg-destructive";

                        return (
                          <div
                            key={det.colIdx}
                            className="grid grid-cols-1 md:grid-cols-[1.6fr_1.4fr_1.6fr_1fr_1.1fr] gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 items-center"
                          >
                            {/* Column */}
                            <div className="flex items-center gap-2 min-w-0">
                              {typeIcon(det.inferredType)}
                              <div className="min-w-0">
                                <span className="text-sm font-medium truncate block">
                                  {det.column}
                                  <span className="text-[9px] text-muted-foreground/50 ml-1">#{det.colIdx}</span>
                                </span>
                              </div>
                            </div>

                            {/* Badges */}
                            <div className="flex flex-wrap gap-1">
                              {tags.length === 0 ? (
                                <span className="text-[10px] text-muted-foreground italic">—</span>
                              ) : (
                                tags.map((t) => (
                                  <Badge
                                    key={t}
                                    variant="outline"
                                    className={`text-[10px] ${
                                      t === "PII"
                                        ? "border-destructive/40 text-destructive bg-destructive/5"
                                        : t === "Identifier" || t === "Entity"
                                          ? "border-primary/40 text-primary bg-primary/5"
                                          : t === "Date"
                                            ? "border-warning/40 text-warning bg-warning/5"
                                            : t === "KPI"
                                              ? "border-accent/40 text-accent-foreground bg-accent/10"
                                              : "border-success/40 text-success bg-success/5"
                                    }`}
                                  >
                                    {t}
                                  </Badge>
                                ))
                              )}
                            </div>

                            {/* Sample values */}
                            <div className="flex flex-wrap gap-1 min-w-0">
                              {(det.sampleValues || []).slice(0, 3).map((sv, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border/60 text-muted-foreground truncate max-w-[110px]"
                                >
                                  {sv}
                                </span>
                              ))}
                              {(!det.sampleValues || det.sampleValues.length === 0) && (
                                <span className="text-[10px] text-muted-foreground italic">No samples</span>
                              )}
                            </div>

                            {/* Detected Type */}
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <Badge variant="outline" className={`text-xs w-fit ${confidenceColor(det.confidence)}`}>
                                {det.inferredType === "skip" ? "Not mapped" : det.inferredType}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground line-clamp-1">{det.reason}</span>
                            </div>

                            {/* Confidence with progress bar */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="cursor-help">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`text-xs font-semibold ${confidenceColor(det.confidence)}`}>
                                      {Math.round(det.confidence)}%
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={`h-full ${confBar} transition-all`}
                                      style={{ width: `${Math.max(4, Math.min(100, det.confidence))}%` }}
                                    />
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs text-xs p-3 space-y-1">
                                <p className="font-semibold">Confidence is based on:</p>
                                <ul className="space-y-0.5 text-muted-foreground">
                                  <li>• Column name patterns</li>
                                  <li>• Sample value distribution</li>
                                  <li>• Schema-level heuristics</li>
                                  <li>• Industry ontology match</li>
                                </ul>
                                {det.rulesApplied && det.rulesApplied.length > 0 && (
                                  <div className="pt-1 mt-1 border-t border-border/40">
                                    <p className="font-semibold mb-0.5">Rules applied:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {det.rulesApplied.map((rule, ri) => (
                                        <span key={ri} className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/60">
                                          {rule}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        );
                      })}
                    </div>


                    {/* Year-to-date auto-fix prompt */}
                    {hasYearOnlyDates && !yearAutoFixed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        className="mt-4 p-4 rounded-lg border border-warning/30 bg-warning/5"
                      >
                        <div className="flex items-start gap-3">
                          <Wand2 className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">Year-only dates detected</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Your dataset uses year values (e.g., 1990). We can convert them to full dates automatically.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 font-mono bg-muted/50 px-2 py-1 rounded inline-block">
                              1990 → 1990-01-01
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={applyYearToDateFix} className="shrink-0 gap-1.5">
                            <Zap className="w-3 h-3" /> Convert automatically
                          </Button>
                        </div>
                      </motion.div>
                    )}

                    {yearAutoFixed && (
                      <div className="mt-4 p-3 rounded-lg border border-success/30 bg-success/5 flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-success" />
                        <span className="text-success">Year values converted to full dates.</span>
                      </div>
                    )}

                    {/* Data preview mini-table */}
                    <div className="mt-6">
                      <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Sample Data</p>
                      <div className="overflow-x-auto max-h-48 overflow-y-auto rounded-lg border border-border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              {headers.map((h, idx) => (
                                <th key={idx} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="border-b border-border/50">
                                {row.map((cell, j) => (
                                  <td key={j} className="py-1.5 px-3 text-foreground/80">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </CardContent>
                </Card>


                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("mapping")} className="gap-2">
                    <Eye className="w-4 h-4" /> Adjust Mapping
                  </Button>
                  <Button onClick={runValidation} className="gap-2">
                    Accept & Continue <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step: Manual Mapping Adjustment */}
            {step === "mapping" && (
              <motion.div
                key="mapping"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
                  {ingestionIntel && (
                    <aside className="xl:col-span-2 xl:sticky xl:top-6 space-y-4">
                      <MappingIntelligencePanel intelligence={ingestionIntel} relationships={crossSheet} />
                    </aside>
                  )}
                  <div className={ingestionIntel ? "xl:col-span-3 space-y-6" : "xl:col-span-5 space-y-6"}>
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-lg font-semibold tracking-tight mb-1">Adjust Column Mapping</h2>
                    <p className="text-xs text-muted-foreground mb-4">Fine-tune the auto-detected mapping. At least one Value column is required. Date is optional.</p>

                    {/* Date column warning with auto-fix */}
                    {dateColumnCount > 1 && (
                      <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <p className="text-xs text-destructive flex-1">
                          Multiple date columns detected ({dateColumnCount}). Only one column can be mapped as date.
                        </p>
                        <Button size="sm" variant="outline" onClick={autoSelectBestDate} className="gap-1 text-xs h-7 shrink-0">
                          <Zap className="w-3 h-3" /> Auto-select best date
                        </Button>
                      </div>
                    )}

                    {/* Import mode toggle in mapping */}
                    <div className="mb-6 p-3 rounded-lg border border-border bg-muted/20 flex items-center gap-4">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" /> Import Mode:
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setImportMode("single")}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            importMode === "single"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Single Metric
                        </button>
                        <button
                          onClick={() => setImportMode("multi")}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            importMode === "multi"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Multi-Metric
                        </button>
                      </div>
                      {importMode === "multi" && valueColumnCount > 1 && (
                        <span className="text-xs text-primary">{valueColumnCount} metrics will be normalized</span>
                      )}
                    </div>

                    {importMode === "multi" && valueColumnCount > 1 && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 mb-4">
                        <Layers className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-xs text-primary">
                          <span className="font-semibold">Multi-metric dataset detected</span> — {valueColumnCount} metrics will be normalized into long format. Each "metric" column becomes a separate time series.
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      {headers.map((h, colIdx) => {
                        const currentTarget = mapping[colIdx] || "skip";
                        const det = detectedSchema.find((d) => d.colIdx === colIdx);
                        const conf = det?.confidence ?? 0;
                        const confTone =
                          conf >= 90 ? "text-success border-success/30 bg-success/5"
                            : conf >= 70 ? "text-warning border-warning/30 bg-warning/5"
                              : "text-destructive border-destructive/30 bg-destructive/5";
                        const semantic = ingestionIntel?.semanticSchema.profiles.find((p) => p.colIdx === colIdx);
                        const semBadge = (() => {
                          if (!semantic) return null;
                          const map: Record<string, { label: string; cls: string }> = {
                            identifier: { label: "Identifier", cls: "bg-primary/10 text-primary border-primary/30" },
                            currency: { label: "Currency", cls: "bg-success/10 text-success border-success/30" },
                            percentage: { label: "Percentage", cls: "bg-success/10 text-success border-success/30" },
                            ratio: { label: "Ratio", cls: "bg-success/10 text-success border-success/30" },
                            pii: { label: "PII", cls: "bg-warning/10 text-warning border-warning/30" },
                            date: { label: "Date", cls: "bg-primary/10 text-primary border-primary/30" },
                            location: { label: "Location", cls: "bg-primary/10 text-primary border-primary/30" },
                            boolean: { label: "Boolean", cls: "bg-muted text-foreground border-border" },
                            categorical: { label: "Categorical", cls: "bg-muted text-foreground border-border" },
                            metric: { label: "Metric", cls: "bg-success/10 text-success border-success/30" },
                          };
                          return map[semantic.semanticType] ?? null;
                        })();
                        const displayLabel = (t: string) => {
                          if (t === "value" && importMode === "multi") return "metric";
                          if (t === "region_code") return "region_code (ID/ISO)";
                          return t;
                        };
                        return (
                          <SectionErrorBoundary key={colIdx} sectionName="Data Upload">
                            <div className="flex items-center gap-4">
                              <div className="w-48 shrink-0">
                                <span className="text-sm font-medium truncate block">
                                  {h}
                                  <span className="text-[9px] text-muted-foreground/50 ml-1">#{colIdx}</span>
                                </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {semBadge && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${semBadge.cls}`}>
                                      {semBadge.label}
                                    </span>
                                  )}
                                  {semantic?.reviewRequired && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning/30 bg-warning/5 text-warning">
                                      Review
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-1 mt-1">
                                  {(sampleValuesByColIdx[colIdx] || []).slice(0, 3).map((sv, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground truncate max-w-[80px]">
                                      {sv}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 flex flex-col gap-1">
                                <select
                                  value={currentTarget}
                                  onChange={(e) => setMapping((prev) => ({ ...prev, [colIdx]: e.target.value as ColumnTarget }))}
                                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  {COLUMN_TARGETS.map((t) => (
                                    <option key={t} value={t}>{displayLabel(t)}</option>
                                  ))}
                                </select>
                                {det && currentTarget !== "skip" && (
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${confTone}`}>
                                      {conf}%
                                    </span>
                                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full transition-all ${
                                          conf >= 90 ? "bg-success" : conf >= 70 ? "bg-warning" : "bg-destructive"
                                        }`}
                                        style={{ width: `${Math.max(4, Math.min(100, conf))}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                              {currentTarget !== "skip" && (
                                <Badge variant="outline" className="text-xs">
                                  {currentTarget === "value" && importMode === "multi"
                                    ? <><TrendingUp className="w-3 h-3 mr-1" /> Metric</>
                                    : <><Check className="w-3 h-3 mr-1" /> Mapped</>
                                  }
                                </Badge>
                              )}
                            </div>
                          </SectionErrorBoundary>
                        );
                      })}
                    </div>
                    <div className="mt-6">
                      <label className="block text-sm font-medium mb-1.5">Dataset Name</label>
                      <input
                        value={datasetName}
                        onChange={(e) => setDatasetName(e.target.value.slice(0, 100))}
                        className="w-full max-w-md px-4 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        maxLength={100}
                      />
                    </div>
                    {importMode === "single" && !Object.values(mapping).includes("metric_type") && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium mb-1.5">Default Metric Type</label>
                        <select
                          value={defaultMetricType}
                          onChange={(e) => setDefaultMetricType(e.target.value)}
                          className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                        >
                          {DEFAULT_METRIC_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Button onClick={runValidation} className="gap-2">
                  Validate Data <ShieldCheck className="w-4 h-4" />
                </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step: Validation — Humanized Errors */}
            {step === "validation" && validation && (
              <motion.div
                key="validation"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <AlertTriangle className="w-6 h-6 text-warning" />
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight">Data Issues Found</h2>
                        <p className="text-xs text-muted-foreground">
                          {validation.validRows} of {validation.totalRows} rows valid · {validation.validPoints.toLocaleString()} of {validation.totalPoints.toLocaleString()} data points valid · {validation.errors.length} issue{validation.errors.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(() => {
                        const grouped = new Map<string, HumanizedError[]>();
                        validation.errors.forEach(err => {
                          const existing = grouped.get(err.friendlyTitle) || [];
                          existing.push(err);
                          grouped.set(err.friendlyTitle, existing);
                        });

                        return Array.from(grouped.entries()).map(([title, errs]) => (
                          <div key={title} className="rounded-lg border border-border overflow-hidden">
                            <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-warning" />
                                <span className="text-sm font-medium">{title}</span>
                                <Badge variant="outline" className="text-xs">{errs.length} row{errs.length > 1 ? "s" : ""}</Badge>
                              </div>
                              {errs[0].autoFixable && errs[0].fixType === "year_to_date" && !yearAutoFixed && (
                                <Button size="sm" variant="outline" onClick={applyYearToDateFix} className="gap-1 text-xs h-7">
                                  <Zap className="w-3 h-3" /> Fix automatically
                                </Button>
                              )}
                            </div>
                            <div className="px-4 py-3">
                              <p className="text-xs text-muted-foreground">{errs[0].friendlyDescription}</p>
                              {errs[0].suggestion && (
                                <p className="text-xs text-primary mt-1">{errs[0].suggestion}</p>
                              )}
                              {errs.length > 3 && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  Affects rows: {errs.slice(0, 5).map(e => e.row).join(", ")}{errs.length > 5 ? ` and ${errs.length - 5} more` : ""}
                                </p>
                              )}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("mapping")}>Back to Mapping</Button>
                  {validation.validRows > 0 && (
                    <Button onClick={() => {
                      const intel = generateIntelligence(headers, allRows, mapping, validation, importMode);
                      setIntelligence(intel);
                      const diag = computeDiagnostics(allRows, headers, mapping, detectedSchema);
                      setDiagnostics(diag);
                      setStep("intelligence");
                    }} className="gap-2">
                      Continue with {validation.validPoints.toLocaleString()} valid points <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step: Intelligence Preview */}
            {step === "intelligence" && intelligence && validation && (
              <motion.div
                key="intelligence"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                {/* Dataset Classification */}
                {classification && classification.confidence > 40 && (
                  <Card className="overflow-hidden border-primary/20">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Detected Domain</p>
                          <p className="text-lg font-semibold tracking-tight text-foreground">
                            {classification.type}
                            {classification.subType && <span className="text-sm text-muted-foreground font-normal ml-2">· {classification.subType}</span>}
                          </p>
                        </div>
                        <Badge variant="outline" className={`text-xs ${confidenceColor(classification.confidence)}`}>
                          {Math.round(classification.confidence)}% confidence
                        </Badge>
                      </div>
                      {classification.recommendedWorkflows.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 ml-14">
                          <span className="text-[10px] text-muted-foreground self-center">Recommended workflows:</span>
                          {classification.recommendedWorkflows.map(w => (
                            <Badge key={w} variant="outline" className="text-[10px] bg-primary/5">{w}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Card className="overflow-hidden">
                  <div className="bg-gradient-to-r from-primary/5 to-primary/0 p-6 border-b border-border/30">
                    <div className="flex items-center gap-3 mb-1">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight">Dataset Intelligence</h2>
                        <p className="text-xs text-muted-foreground">{datasetName}</p>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-6">
                    {/* KPI Strip */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{intelligence.validPointCount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Valid data points
                        </p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{intelligence.dateSpan || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Time Span</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{intelligence.regionCount || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Entities</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{intelligence.metricTypes.length || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Metrics</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className={`text-2xl font-bold ${qualityColor(intelligence.qualityScore)}`}>
                          {intelligence.qualityScore}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Quality Score</p>
                        <Badge className={`mt-1 text-[10px] ${
                          intelligence.qualityScore >= 80 ? "bg-success/10 text-success" :
                          intelligence.qualityScore >= 50 ? "bg-warning/10 text-warning" :
                          "bg-destructive/10 text-destructive"
                        } border-none`}>
                          {intelligence.qualityLabel}
                        </Badge>
                      </div>
                    </div>

                    {/* Metrics detected */}
                    {intelligence.metricTypes.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Metrics Detected</p>
                        <div className="flex flex-wrap gap-1.5">
                          {intelligence.metricTypes.map(m => (
                            <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Regions */}
                    {intelligence.regions.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Entities</p>
                        <div className="flex flex-wrap gap-1.5">
                          {intelligence.regions.map(r => (
                            <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                          ))}
                          {intelligence.regionCount > 8 && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">+{intelligence.regionCount - 8} more</Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Signals */}
                    {intelligence.signals.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Signals Detected</p>
                        <div className="space-y-2">
                          {intelligence.signals.map((sig, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
                              <span className="text-lg leading-none mt-0.5">{sig.icon}</span>
                              <div>
                                <p className="text-sm font-medium">{sig.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{sig.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Value range */}
                    {validation.valueRange && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Value range: {validation.valueRange.min.toLocaleString()} → {validation.valueRange.max.toLocaleString()}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Data Diagnostics Panel */}
                {diagnostics && (
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Activity className="w-5 h-5 text-primary" />
                        <h3 className="text-[13px] font-semibold tracking-tight">Data Diagnostics</h3>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                          <p className={`text-lg font-bold ${diagnostics.missingValuesPct > 5 ? "text-warning" : "text-success"}`}>
                            {diagnostics.missingValuesPct}%
                          </p>
                          <p className="text-xs text-muted-foreground">Missing values</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                          <p className={`text-lg font-bold ${diagnostics.outlierCount > 5 ? "text-warning" : "text-success"}`}>
                            {diagnostics.outlierCount}
                          </p>
                          <p className="text-xs text-muted-foreground">Outliers detected</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                          <p className={`text-lg font-bold ${diagnostics.duplicateRows > 0 ? "text-warning" : "text-success"}`}>
                            {diagnostics.duplicateRows}
                          </p>
                          <p className="text-xs text-muted-foreground">Duplicate rows</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                          <p className={`text-lg font-bold ${diagnostics.dateContinuity === "OK" ? "text-success" : diagnostics.dateContinuity === "Gaps detected" ? "text-warning" : "text-muted-foreground"}`}>
                            {diagnostics.dateContinuity}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Date continuity{diagnostics.dateGapCount > 0 ? ` (${diagnostics.dateGapCount} gap${diagnostics.dateGapCount > 1 ? "s" : ""})` : ""}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                          <p className={`text-lg font-bold ${diagnostics.piiRisk.level === "high" ? "text-destructive" : diagnostics.piiRisk.level === "low" ? "text-warning" : "text-success"}`}>
                            {diagnostics.piiRisk.level === "none" ? "None" : diagnostics.piiRisk.level === "low" ? "Low" : "High"}
                          </p>
                          <p className="text-xs text-muted-foreground" title={diagnostics.piiRisk.columns.join(", ")}>
                            PII risk{diagnostics.piiRisk.columns.length > 0 ? ` (${diagnostics.piiRisk.columns.length})` : ""}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Errors summary */}
                {validation.invalidRows > 0 && (
                  <div className="p-3 rounded-lg border border-warning/20 bg-warning/5 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {validation.invalidPoints.toLocaleString()} data point{validation.invalidPoints !== 1 ? "s" : ""} will be skipped.
                      <button onClick={() => setStep("validation")} className="text-primary ml-1 hover:underline">View details</button>
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("mapping")}>Edit Mapping</Button>
                  {validation.validPoints > 0 && (
                    <Button onClick={handleImport} className="gap-2">
                      Import {validation.validPoints.toLocaleString()} Data Points <Check className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step: Importing */}
            {step === "importing" && (
              <motion.div
                key="importing"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="bg-card border border-border p-12 rounded-xl flex flex-col items-center justify-center min-h-[400px]"
              >
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-lg font-semibold tracking-tight">Importing data...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importMode === "multi" ? "Normalizing multi-metric dataset and generating intelligence signals" : "Processing and generating intelligence signals"}
                </p>
              </motion.div>
            )}

            {/* Step: Done */}
            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="bg-card border border-border p-12 rounded-xl flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-success" />
                  </div>
                  <h2 className="text-[16px] font-semibold tracking-tight mb-2">Import Complete</h2>
                  <p className="text-muted-foreground text-sm mb-6">
                    {importCount.toLocaleString()} data points imported
                    {importMode === "multi" ? " (multi-metric normalized)" : ""}
                    {" · "}Intelligence signals generated
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => {
                      setStep("upload"); setFile(null); setRows([]); setAllRows([]); setHeaders([]);
                      setValidation(null); setDetectedSchema([]); setIntelligence(null); setYearAutoFixed(false);
                      setDiagnostics(null); setClassification(null); setImportMode("single");
                      setDrift(null); ingestion.reset();
                    }}>
                      Upload Another
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/dataset-explorer")} className="gap-2">
                      <Eye className="w-4 h-4" /> Explore Dataset
                    </Button>
                    <Button onClick={() => navigate("/dashboard")} className="gap-2">
                      View Dashboard <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>


                <PostUploadSummary
                  rowsImported={importCount || allRows.length}
                  healthScore={diagnostics?.healthScore ?? intelligence?.qualityScore ?? 0}
                  classification={classification}
                  diagnostics={diagnostics}
                  drift={drift}
                  headers={headers}
                  sampleRows={allRows.slice(0, 500)}
                  hasLineage
                />

                {/* Dataset sample preview — user can verify data was imported correctly */}
                {allRows.length > 0 && headers.length > 0 && (
                  <div className="glass-card rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold">Imported Data Sample</h3>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        Showing first {Math.min(10, allRows.length)} of {allRows.length.toLocaleString()} rows
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/50 sticky top-0">
                            {headers.map((h, idx) => (
                              <th key={idx} className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {allRows.slice(0, 10).map((row, i) => (
                            <tr key={i} className="border-b border-border/50">
                              {row.map((cell, j) => (
                                <td key={j} className="py-1.5 px-3 text-foreground/80 whitespace-nowrap">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
    </>
  );
};

export default DataUpload;
