import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  Database,
  FileSpreadsheet,
  Globe,
  Hash,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Tag,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";

import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import UploadTrustBadges from "@/components/security/UploadTrustBadges";
import IngestionProgressCard from "@/components/upload/IngestionProgressCard";
import PostUploadSummary from "@/components/upload/PostUploadSummary";
import MappingIntelligencePanel from "@/components/upload/MappingIntelligencePanel";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useProject } from "@/contexts/ProjectContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useSubscription } from "@/hooks/useSubscription";
import { useChunkedIngestion } from "@/hooks/useChunkedIngestion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { embedInsightsBatch } from "@/lib/decision-lifecycle";
import {
  type ColumnMapping,
  type ColumnTarget,
  type DatasetClassification,
  type DatasetDiagnostics,
  type DatasetIntelligence,
  type DetectedSchema,
  type ImportMode,
  type ValidationResult,
  classifyDataset,
  computeDiagnostics,
  deduplicateMetricSlugs,
  generateIntelligence,
  inferSchema,
  parseCSVText,
  slugifyMetric,
  validateData,
} from "@/lib/data-upload-utils";
import {
  buildIngestionIntelligence,
  type IngestionIntelligenceResult,
} from "@/lib/ingestion-intelligence";
import { toIngestionMetadataSnapshot } from "@/lib/ingestion-metadata";
import { discoverCrossSheetRelationships, type CrossSheetDiscoveryResult } from "@/lib/cross-sheet-discovery";
import {
  buildSnapshot,
  detectDrift,
  type DriftReport,
  type SchemaColumn,
} from "@/lib/schema-evolution";
import {
  type ParsedWorkbook,
  isSupportedDataFile,
  isWorkbookFile,
  parseWorkbookFile,
} from "@/lib/workbook-parser";

type Step = "upload" | "mapping" | "preview" | "importing" | "done";

type PipelineStageFailure = {
  stage: string;
  message: string;
};

const COLUMN_TARGETS: ColumnTarget[] = [
  "date",
  "value",
  "region",
  "region_code",
  "segment",
  "metric_type",
  "skip",
];

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BROWSER_ROWS = 50_000;
const NULL_SOURCE = "00000000-0000-0000-0000-000000000000";

const typeIcon = (type: ColumnTarget) => {
  switch (type) {
    case "date": return <Calendar className="h-3.5 w-3.5" />;
    case "value": return <Hash className="h-3.5 w-3.5" />;
    case "region": return <Globe className="h-3.5 w-3.5" />;
    case "region_code": return <Tag className="h-3.5 w-3.5" />;
    case "metric_type": return <TrendingUp className="h-3.5 w-3.5" />;
    case "segment": return <BarChart3 className="h-3.5 w-3.5" />;
    default: return <X className="h-3.5 w-3.5" />;
  }
};

const normalizeDate = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}[/-]Q[1-4]$/i.test(value)) {
    const year = value.slice(0, 4);
    const quarter = Number(value.slice(-1));
    return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  }
  if (/^\d{4}[/-]\d{2}$/.test(value)) return `${value.replace("/", "-")}-01`;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

const cleanNumeric = (raw: string | undefined): number => {
  if (!raw) return Number.NaN;
  const cleaned = raw
    .replace(/[\s$€£¥₹,]/g, "")
    .replace(/\(([^)]+)\)/, "-$1");
  return Number.parseFloat(cleaned);
};

const safeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "dataset";

const DataUploadHardened = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { currentWorkspaceId } = useWorkspace();
  const { currentProject, createProject, attachDataset, setActiveDataset } = useProject();
  const { subscribed, tier } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const ingestion = useChunkedIngestion();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [detectedSchema, setDetectedSchema] = useState<DetectedSchema[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [importMode, setImportMode] = useState<ImportMode>("single");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [intelligence, setIntelligence] = useState<DatasetIntelligence | null>(null);
  const [diagnostics, setDiagnostics] = useState<DatasetDiagnostics | null>(null);
  const [classification, setClassification] = useState<DatasetClassification | null>(null);
  const [ingestionIntel, setIngestionIntel] = useState<IngestionIntelligenceResult | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);
  const [crossSheet, setCrossSheet] = useState<CrossSheetDiscoveryResult | null>(null);
  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [degradedStages, setDegradedStages] = useState<PipelineStageFailure[]>([]);
  const [importCount, setImportCount] = useState(0);
  const [importedDatasetId, setImportedDatasetId] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const dateColumns = useMemo(
    () => Object.values(mapping).filter((target) => target === "date").length,
    [mapping],
  );
  const valueColumns = useMemo(
    () => Object.values(mapping).filter((target) => target === "value").length,
    [mapping],
  );

  const resetImport = useCallback(() => {
    ingestion.reset();
    setStep("upload");
    setFile(null);
    setDatasetName("");
    setHeaders([]);
    setAllRows([]);
    setDetectedSchema([]);
    setMapping({});
    setImportMode("single");
    setValidation(null);
    setIntelligence(null);
    setDiagnostics(null);
    setClassification(null);
    setIngestionIntel(null);
    setWorkbook(null);
    setActiveSheetName(null);
    setCrossSheet(null);
    setDrift(null);
    setDegradedStages([]);
    setImportCount(0);
    setImportedDatasetId(null);
    lastFileRef.current = null;
  }, [ingestion]);

  const ingestParsed = useCallback((parsedHeaders: string[], parsedRows: string[][], suggestedName?: string) => {
    if (parsedHeaders.length === 0 || parsedRows.length === 0) {
      toast({ title: "No usable data", description: "The selected file contains no readable rows.", variant: "destructive" });
      return;
    }
    if (parsedRows.length > MAX_BROWSER_ROWS) {
      toast({
        title: "Server ingestion required",
        description: `${parsedRows.length.toLocaleString()} rows exceeds the ${MAX_BROWSER_ROWS.toLocaleString()}-row governed browser ceiling. Use Data Connectors for server-side ingestion.`,
        variant: "destructive",
      });
      return;
    }

    const schema = inferSchema(parsedHeaders, parsedRows);
    const autoMapping: ColumnMapping = {};
    for (const detected of schema) autoMapping[detected.colIdx] = detected.inferredType;

    setHeaders(parsedHeaders);
    setAllRows(parsedRows);
    setDetectedSchema(schema);
    setMapping(autoMapping);
    if (suggestedName) setDatasetName(suggestedName);
    setImportMode(schema.filter((column) => column.inferredType === "value").length > 1 ? "multi" : "single");

    try {
      const nextDiagnostics = computeDiagnostics(parsedRows, parsedHeaders, autoMapping, schema);
      setDiagnostics(nextDiagnostics);
      setIngestionIntel(buildIngestionIntelligence({
        headers: parsedHeaders,
        rows: parsedRows,
        schema,
        mapping: autoMapping,
        diagnostics: nextDiagnostics,
      }));
    } catch (error) {
      console.warn("[DataUploadHardened] ingestion intelligence unavailable:", error);
      setIngestionIntel(null);
    }

    try {
      setClassification(classifyDataset(parsedHeaders, autoMapping));
    } catch (error) {
      console.warn("[DataUploadHardened] classification unavailable:", error);
      setClassification(null);
    }

    setValidation(null);
    setIntelligence(null);
    setDegradedStages([]);
    setStep("mapping");
  }, [toast]);

  const loadWorkbookSheet = useCallback((parsedWorkbook: ParsedWorkbook, sheetName: string) => {
    const sheet = parsedWorkbook.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet || sheet.hidden || sheet.rows.length === 0 || sheet.headers.length === 0) {
      toast({ title: "Sheet unavailable", description: `“${sheetName}” contains no importable data.`, variant: "destructive" });
      return;
    }
    setActiveSheetName(sheetName);
    ingestParsed(
      sheet.headers,
      sheet.rows,
      parsedWorkbook.sheetCount > 1 ? `${parsedWorkbook.workbookName} — ${sheet.name}` : parsedWorkbook.workbookName,
    );
  }, [ingestParsed, toast]);

  const parseWorkbook = useCallback(async (selectedFile: File) => {
    try {
      const parsed = await parseWorkbookFile(selectedFile);
      const usableSheets = parsed.sheets.filter((sheet) => !sheet.hidden && sheet.rows.length > 0 && sheet.headers.length > 0);
      if (usableSheets.length === 0) throw new Error("Workbook contains no readable data sheets.");
      setWorkbook(parsed);
      try {
        setCrossSheet(discoverCrossSheetRelationships(parsed));
      } catch (error) {
        console.warn("[DataUploadHardened] cross-sheet discovery unavailable:", error);
        setCrossSheet(null);
      }
      loadWorkbookSheet(parsed, usableSheets[0].name);
    } catch (error) {
      toast({ title: "Could not read workbook", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  }, [loadWorkbookSheet, toast]);

  const acceptFile = useCallback((selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_BYTES) {
      toast({ title: "File too large", description: "Maximum upload size is 20 MB.", variant: "destructive" });
      return;
    }
    if (!isSupportedDataFile(selectedFile.name)) {
      toast({ title: "Unsupported file", description: "Upload CSV, XLSX, XLS, XLSM, or ODS.", variant: "destructive" });
      return;
    }

    setFile(selectedFile);
    lastFileRef.current = selectedFile;
    setWorkbook(null);
    setCrossSheet(null);
    setActiveSheetName(null);
    setDrift(null);

    if (isWorkbookFile(selectedFile.name)) {
      void parseWorkbook(selectedFile);
      return;
    }

    const baseName = selectedFile.name.replace(/\.csv$/i, "");
    setDatasetName(baseName);
    if (selectedFile.size > 1024 * 1024) {
      void ingestion.start(selectedFile).catch((error) => {
        toast({ title: "Ingestion failed to start", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseCSVText(String(event.target?.result ?? ""));
        ingestParsed(parsed.headers, parsed.rows, baseName);
      } catch (error) {
        toast({ title: "Could not parse CSV", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      }
    };
    reader.onerror = () => toast({ title: "Could not read file", variant: "destructive" });
    reader.readAsText(selectedFile);
  }, [ingestParsed, ingestion, parseWorkbook, toast]);

  useEffect(() => {
    if (ingestion.status === "done") {
      if (ingestion.shouldRouteToServer) {
        toast({
          title: "Server ingestion required",
          description: `${(ingestion.progress.totalRowsEstimate ?? 0).toLocaleString()} rows exceeds the governed browser ceiling. Use Data Connectors for server-side ingestion.`,
          variant: "destructive",
        });
      } else if (ingestion.result && file) {
        ingestParsed(
          ingestion.result.headers,
          ingestion.result.rows,
          file.name.replace(/\.csv$/i, ""),
        );
      }
    }
    if (ingestion.status === "error" && ingestion.error) {
      toast({ title: "Ingestion error", description: ingestion.error, variant: "destructive" });
    }
  }, [file, ingestParsed, ingestion.error, ingestion.progress.totalRowsEstimate, ingestion.result, ingestion.shouldRouteToServer, ingestion.status, toast]);

  const retryWorker = useCallback(() => {
    if (!lastFileRef.current) return;
    ingestion.reset();
    acceptFile(lastFileRef.current);
  }, [acceptFile, ingestion]);

  const runValidation = useCallback(() => {
    if (dateColumns !== 1) {
      toast({
        title: dateColumns === 0 ? "Date column required" : "Choose one date column",
        description: dateColumns === 0
          ? "Governed metric ingestion requires one real time dimension. Quantivis will not fabricate synthetic dates."
          : "Exactly one column can define the time dimension.",
        variant: "destructive",
      });
      return;
    }
    if (valueColumns === 0) {
      toast({ title: "Value column required", description: "Map at least one numeric value column.", variant: "destructive" });
      return;
    }

    try {
      const nextValidation = validateData(allRows, headers, mapping, importMode);
      if (nextValidation.validPoints <= 0) {
        setValidation(nextValidation);
        toast({ title: "No valid data points", description: "Correct the mapping or source data before importing.", variant: "destructive" });
        return;
      }
      const nextIntelligence = generateIntelligence(headers, allRows, mapping, nextValidation, importMode);
      const nextDiagnostics = computeDiagnostics(allRows, headers, mapping, detectedSchema);
      setValidation(nextValidation);
      setIntelligence(nextIntelligence);
      setDiagnostics(nextDiagnostics);
      setClassification(classifyDataset(headers, mapping));
      setStep("preview");
    } catch (error) {
      toast({ title: "Validation failed", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  }, [allRows, dateColumns, detectedSchema, headers, importMode, mapping, toast, valueColumns]);

  const handleImport = useCallback(async () => {
    if (!currentOrgId || !currentWorkspaceId || !user || !file || !validation) {
      toast({ title: "Verified import context required", description: "Organization, workspace, user, file, and validation must all be available.", variant: "destructive" });
      return;
    }

    const trimmedName = datasetName.trim();
    if (!trimmedName) {
      toast({ title: "Dataset name required", variant: "destructive" });
      return;
    }

    if (tier === "starter") {
      const { count, error: limitError } = await supabase
        .from("datasets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrgId);
      if (limitError) {
        toast({ title: "Dataset limit could not be verified", description: limitError.message, variant: "destructive" });
        return;
      }
      if ((count ?? 0) >= 1) {
        toast({ title: "Dataset limit reached", description: "Starter plan allows one dataset. Upgrade before importing another.", variant: "destructive" });
        return;
      }
    }
    if (!subscribed && tier !== null) {
      toast({ title: "Subscription expired", description: "Renew your subscription before uploading datasets.", variant: "destructive" });
      return;
    }

    setStep("importing");
    setDegradedStages([]);
    const startedAt = Date.now();
    const deferredFailures: PipelineStageFailure[] = [];
    let pipelineRunId: string | null = null;
    let createdDatasetId: string | null = null;
    let uploadedFilePath: string | null = null;
    let coreDataDurable = false;

    const addFailure = (stage: string, value: unknown) => {
      const message = value instanceof Error
        ? value.message
        : typeof value === "string"
          ? value
          : value && typeof value === "object" && "message" in value
            ? String((value as { message?: unknown }).message ?? "Unknown error")
            : "Unknown error";
      deferredFailures.push({ stage, message });
    };

    const runEdgeStage = async (stage: string, fn: () => Promise<{ data: unknown; error: { message?: string } | null }>) => {
      try {
        const result = await fn();
        if (result.error) {
          addFailure(stage, result.error.message ?? `${stage} failed`);
          return false;
        }
        return true;
      } catch (error) {
        addFailure(stage, error);
        return false;
      }
    };

    try {
      const filePath = `${currentOrgId}/${Date.now()}_${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("datasets").upload(filePath, file);
      if (uploadError) throw new Error(`File upload failed: ${uploadError.message}`);
      uploadedFilePath = filePath;

      const storedMapping: Record<string, ColumnTarget> = {};
      Object.entries(mapping).forEach(([columnIndex, target]) => {
        const index = Number(columnIndex);
        storedMapping[`${index}:${headers[index] || `col_${index}`}`] = target;
      });

      const { data: dataset, error: datasetError } = await supabase
        .from("datasets")
        .insert({
          organization_id: currentOrgId,
          workspace_id: currentWorkspaceId,
          name: trimmedName,
          file_path: filePath,
          uploaded_by: user.id,
          row_count: allRows.length,
          column_mapping: storedMapping,
          status: "processing",
        })
        .select()
        .single();
      if (datasetError || !dataset) throw new Error(datasetError?.message ?? "Dataset creation returned no row.");
      createdDatasetId = dataset.id;

      const ingestionMetadata = ingestionIntel ? toIngestionMetadataSnapshot(ingestionIntel, crossSheet) : {};
      const { data: version, error: versionError } = await supabase
        .from("dataset_versions")
        .insert({
          dataset_id: dataset.id,
          organization_id: currentOrgId,
          workspace_id: currentWorkspaceId,
          version_number: 1,
          file_path: filePath,
          row_count: allRows.length,
          column_mapping: storedMapping,
          change_summary: importMode === "multi" ? `Governed multi-metric import (${valueColumns} metrics)` : "Governed initial upload",
          created_by: user.id,
          is_active: true,
          metadata: ingestionMetadata as never,
        })
        .select("id")
        .single();
      if (versionError || !version) throw new Error(versionError?.message ?? "Dataset version creation returned no row.");

      const { data: pipelineRun, error: pipelineError } = await supabase
        .from("pipeline_runs")
        .insert({
          organization_id: currentOrgId,
          workspace_id: currentWorkspaceId,
          dataset_id: dataset.id,
          run_type: "full",
          status: "running",
          stage: "provenance",
          metadata: { import_mode: importMode, file_name: file.name, truth_contract: "hardened_v1" },
        })
        .select("id")
        .single();
      if (pipelineError || !pipelineRun) throw new Error(pipelineError?.message ?? "Pipeline observability could not be created.");
      pipelineRunId = pipelineRun.id;

      const schemaColumns = Object.entries(storedMapping).map(([key, target]) => ({
        column: key.split(":").slice(1).join(":") || key,
        mappedAs: target,
      }));
      const toSnapshotColumns = (columns: { column: string; mappedAs: string }[]): SchemaColumn[] =>
        columns.map((column) => {
          const detected = detectedSchema.find((candidate) => candidate.column === column.column);
          const role = column.mappedAs as SchemaColumn["role"];
          const type: SchemaColumn["type"] = detected?.inferredType === "date"
            ? "date"
            : detected?.inferredType === "value"
              ? "number"
              : detected
                ? "text"
                : "unknown";
          return { name: column.column, type, role };
        });

      let driftReport: DriftReport | null = null;
      const { data: previousDatasets, error: previousError } = await supabase
        .from("datasets")
        .select("id,current_version,column_mapping")
        .eq("organization_id", currentOrgId)
        .eq("name", trimmedName)
        .neq("id", dataset.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (previousError) {
        addFailure("schema drift comparison", previousError);
      } else if (previousDatasets?.[0]?.column_mapping && typeof previousDatasets[0].column_mapping === "object") {
        const previousColumns = Object.entries(previousDatasets[0].column_mapping as Record<string, string>)
          .map(([key, target]) => ({ column: key.split(":").slice(1).join(":") || key, mappedAs: target }));
        driftReport = detectDrift(
          buildSnapshot(previousDatasets[0].id, previousDatasets[0].current_version ?? 1, toSnapshotColumns(previousColumns)),
          buildSnapshot(dataset.id, 1, toSnapshotColumns(schemaColumns)),
        );
      }
      setDrift(driftReport);

      const driftRows = driftReport?.changes.map((change) => ({
        organization_id: currentOrgId,
        dataset_id: dataset.id,
        change_type: change.changeType,
        column_name: change.columnName,
        old_type: change.oldType ?? null,
        new_type: change.newType ?? null,
        detected_by: user.id,
        metadata: {
          confidence: change.confidence,
          recommendation: change.recommendation,
          old_name: change.oldName,
          old_role: change.oldRole,
          new_role: change.newRole,
        },
      })) ?? [];

      const { error: schemaLogError } = await supabase.from("schema_evolution_log").insert([
        {
          organization_id: currentOrgId,
          dataset_id: dataset.id,
          change_type: "initial_upload",
          detected_by: user.id,
          metadata: {
            columns: schemaColumns,
            row_count: allRows.length,
            import_mode: importMode,
            drift_summary: driftReport ? { total: driftReport.totalChanges, backward_compatible: driftReport.backwardCompatible } : null,
          },
        },
        ...driftRows,
      ]);
      if (schemaLogError) throw new Error(`Schema provenance failed: ${schemaLogError.message}`);

      const { error: initialLineageError } = await supabase.from("data_lineage").insert({
        organization_id: currentOrgId,
        source_type: "file",
        source_id: dataset.id,
        source_name: file.name,
        target_type: "dataset",
        target_id: dataset.id,
        target_name: trimmedName,
        transformation: "governed_file_import",
        transformation_details: { columns_mapped: Object.keys(storedMapping).length, rows: allRows.length, import_mode: importMode },
      });
      if (initialLineageError) throw new Error(`Initial lineage failed: ${initialLineageError.message}`);

      const rawRecords = allRows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row }) => row.some((cell) => Boolean(cell?.trim())))
        .map(({ row, rowIndex }) => ({
          organization_id: currentOrgId,
          workspace_id: currentWorkspaceId,
          dataset_id: dataset.id,
          dataset_version_id: version.id,
          row_index: rowIndex,
          raw_data: Object.fromEntries(headers.map((_, index) => [String(index), row[index] || ""])),
        }));

      let rawInserted = 0;
      for (let offset = 0; offset < rawRecords.length; offset += 500) {
        const batch = rawRecords.slice(offset, offset + 500);
        const { error } = await supabase.from("raw_records").insert(batch);
        if (error) throw new Error(`Raw ingest failed: ${error.message}`);
        rawInserted += batch.length;
      }
      const { error: rawStageError } = await supabase
        .from("pipeline_runs")
        .update({ raw_count: rawInserted, stage: "raw_complete" })
        .eq("id", pipelineRun.id)
        .eq("organization_id", currentOrgId);
      if (rawStageError) throw new Error(`Raw-stage observability failed: ${rawStageError.message}`);

      const findMapped = (target: ColumnTarget) => Object.entries(mapping)
        .filter(([, value]) => value === target)
        .map(([index]) => Number(index));
      const dateIndex = findMapped("date")[0];
      const regionIndex = findMapped("region")[0];
      const regionCodeIndex = findMapped("region_code")[0];
      const segmentIndex = findMapped("segment")[0];
      const metricTypeIndex = findMapped("metric_type")[0];
      const valueIndices = findMapped("value");
      const valueHeaders = valueIndices.map((index) => headers[index] || `col_${index}`);
      const metricSlugs = deduplicateMetricSlugs(valueHeaders.map((header) => slugifyMetric(header)));

      const metrics: Array<{
        organization_id: string;
        workspace_id: string;
        dataset_id: string;
        metric_type: string;
        value: number;
        date: string;
        region: string;
        segment: string;
        source_id: string;
      }> = [];
      let transformedRows = 0;

      for (const row of allRows) {
        if (row.every((cell) => !cell?.trim())) continue;
        const date = normalizeDate(row[dateIndex] ?? "");
        if (!date) continue;
        const region = (regionIndex !== undefined ? row[regionIndex]?.trim() : "")
          || (regionCodeIndex !== undefined ? row[regionCodeIndex]?.trim() : "")
          || "";
        const segment = segmentIndex !== undefined ? row[segmentIndex]?.trim() || "" : "";
        let produced = false;

        if (importMode === "multi" && valueIndices.length > 1) {
          valueIndices.forEach((valueIndex, index) => {
            const value = cleanNumeric(row[valueIndex]);
            if (!Number.isFinite(value) || Math.abs(value) > 1e12) return;
            metrics.push({
              organization_id: currentOrgId,
              workspace_id: currentWorkspaceId,
              dataset_id: dataset.id,
              metric_type: metricSlugs[index],
              value,
              date,
              region,
              segment,
              source_id: NULL_SOURCE,
            });
            produced = true;
          });
        } else {
          const valueIndex = valueIndices[0];
          const value = valueIndex === undefined ? Number.NaN : cleanNumeric(row[valueIndex]);
          if (Number.isFinite(value) && Math.abs(value) <= 1e12) {
            const metricType = metricTypeIndex !== undefined
              ? row[metricTypeIndex]?.trim() || slugifyMetric(valueHeaders[0] || "metric")
              : slugifyMetric(valueHeaders[0] || "metric");
            metrics.push({
              organization_id: currentOrgId,
              workspace_id: currentWorkspaceId,
              dataset_id: dataset.id,
              metric_type: metricType,
              value,
              date,
              region,
              segment,
              source_id: NULL_SOURCE,
            });
            produced = true;
          }
        }
        if (produced) transformedRows += 1;
      }

      const deduped = new Map<string, (typeof metrics)[number]>();
      for (const metric of metrics) {
        deduped.set(`${metric.dataset_id}|${metric.metric_type}|${metric.date}|${metric.region}|${metric.segment}|${metric.source_id}`, metric);
      }
      const uniqueMetrics = [...deduped.values()];
      if (uniqueMetrics.length === 0) throw new Error("Transformation produced zero governed metric rows.");

      let inserted = 0;
      for (let offset = 0; offset < uniqueMetrics.length; offset += 500) {
        const batch = uniqueMetrics.slice(offset, offset + 500);
        const { error } = await supabase
          .from("metrics")
          .upsert(batch, { onConflict: "organization_id,dataset_id,metric_type,date,region,segment,source_id" });
        if (error) throw new Error(`Metric persistence failed: ${error.message}`);
        inserted += batch.length;
      }

      const { error: rawStatusError } = await supabase
        .from("raw_records")
        .update({ transform_status: "transformed", transformed_at: new Date().toISOString() })
        .eq("organization_id", currentOrgId)
        .eq("dataset_id", dataset.id)
        .eq("transform_status", "pending");
      if (rawStatusError) throw new Error(`Raw transformation evidence failed: ${rawStatusError.message}`);

      const { error: cleanStageError } = await supabase
        .from("pipeline_runs")
        .update({ transformed_count: transformedRows, stage: "transform_complete" })
        .eq("id", pipelineRun.id)
        .eq("organization_id", currentOrgId);
      if (cleanStageError) throw new Error(`Clean-stage observability failed: ${cleanStageError.message}`);

      const { count: verifiedCount, error: verifyError } = await supabase
        .from("metrics")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrgId)
        .eq("dataset_id", dataset.id);
      if (verifyError) throw new Error(`Metric verification failed: ${verifyError.message}`);
      if (verifiedCount === null || verifiedCount !== inserted) {
        throw new Error(`Metric verification mismatch: expected ${inserted}, verified ${verifiedCount ?? "unknown"}.`);
      }

      const { error: datasetCompleteError } = await supabase
        .from("datasets")
        .update({
          status: "completed",
          row_count: verifiedCount,
          current_version: 1,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", dataset.id)
        .eq("organization_id", currentOrgId);
      if (datasetCompleteError) throw new Error(`Dataset completion failed: ${datasetCompleteError.message}`);
      coreDataDurable = true;

      try {
        let projectId = currentProject?.id;
        if (!projectId) {
          const project = await createProject(trimmedName);
          projectId = project.id;
        }
        await attachDataset(projectId, dataset.id);
        await setActiveDataset(projectId, dataset.id);
      } catch (error) {
        addFailure("project activation", error);
      }

      const [aggregateOk, insightsOk, profileOk] = await Promise.all([
        runEdgeStage("aggregates", () => invokeWithRetry("refresh-aggregates", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id, pipeline_run_id: pipelineRun.id },
        })),
        runEdgeStage("insights", () => invokeWithRetry("generate-insights", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id },
        })),
        runEdgeStage("data profile", () => invokeWithRetry("data-profiler", {
          body: { organization_id: currentOrgId, dataset_id: dataset.id },
        })),
      ]);

      if (insightsOk) void embedInsightsBatch(currentOrgId);

      const advisoryOk = await runEdgeStage("prescriptive advisory", () => invokeWithRetry("prescriptive-advisory", {
        body: { organization_id: currentOrgId, dataset_id: dataset.id, role_type: "ceo" },
      }));
      const decisionsOk = await runEdgeStage("automatic decisions", () => invokeWithRetry("auto-create-decisions", {
        body: { organization_id: currentOrgId, dataset_id: dataset.id },
      }));

      const lineageRows = [{
        organization_id: currentOrgId,
        source_type: "dataset",
        source_id: dataset.id,
        source_name: trimmedName,
        target_type: "metrics",
        target_id: dataset.id,
        target_name: `${trimmedName} metrics`,
        transformation: "normalize_clean",
        transformation_details: { records_inserted: verifiedCount },
      }];
      if (aggregateOk) {
        lineageRows.push({
          organization_id: currentOrgId,
          source_type: "metrics",
          source_id: dataset.id,
          source_name: `${trimmedName} metrics`,
          target_type: "aggregates",
          target_id: dataset.id,
          target_name: `${trimmedName} aggregates`,
          transformation: "refresh_aggregates",
          transformation_details: { period_types: ["monthly", "quarterly", "yearly"] },
        });
      }
      const { error: finalLineageError } = await supabase.from("data_lineage").insert(lineageRows);
      if (finalLineageError) addFailure("lineage finalization", finalLineageError);

      const finalFailures = [...deferredFailures];
      const finalStatus = finalFailures.length > 0 ? "partial_success" : "completed";
      const finalStage = finalFailures.length > 0 ? "intelligence_partial" : "complete";
      const { error: finalPipelineError } = await supabase
        .from("pipeline_runs")
        .update({
          status: finalStatus,
          stage: finalStage,
          error_count: finalFailures.length,
          error_message: finalFailures.length > 0
            ? finalFailures.map((failure) => `${failure.stage}: ${failure.message}`).join(" | ").slice(0, 4000)
            : null,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          metadata: {
            import_mode: importMode,
            file_name: file.name,
            truth_contract: "hardened_v1",
            core_data_durable: true,
            degraded_stages: finalFailures.map((failure) => failure.stage),
            analytics: { aggregates: aggregateOk, insights: insightsOk, profile: profileOk },
            decisions: { advisory: advisoryOk, automatic_decisions: decisionsOk },
          },
        })
        .eq("id", pipelineRun.id)
        .eq("organization_id", currentOrgId);
      if (finalPipelineError) addFailure("pipeline finalization", finalPipelineError);

      const visibleFailures = [...deferredFailures];
      setDegradedStages(visibleFailures);
      setImportCount(verifiedCount);
      setImportedDatasetId(dataset.id);
      setStep("done");

      if (visibleFailures.length === 0) {
        toast({
          title: `Imported ${verifiedCount.toLocaleString()} governed metrics`,
          description: "Raw, clean, analytical, profiling, advisory, and automatic-decision stages were verified.",
        });
      } else {
        toast({
          title: "Data imported · intelligence partially completed",
          description: `${visibleFailures.length} downstream stage${visibleFailures.length === 1 ? "" : "s"} require attention. The durable data layer remains available.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (pipelineRunId) {
        const { error: pipelineFailureError } = await supabase
          .from("pipeline_runs")
          .update({
            status: "failed",
            stage: "failed",
            error_count: 1,
            error_message: message.slice(0, 4000),
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            metadata: { core_data_durable: coreDataDurable, truth_contract: "hardened_v1" },
          })
          .eq("id", pipelineRunId)
          .eq("organization_id", currentOrgId);
        if (pipelineFailureError) console.error("[DataUploadHardened] could not persist pipeline failure:", pipelineFailureError);
      }
      if (createdDatasetId && !coreDataDurable) {
        const { error: datasetFailureError } = await supabase
          .from("datasets")
          .update({ status: "failed" })
          .eq("id", createdDatasetId)
          .eq("organization_id", currentOrgId);
        if (datasetFailureError) console.error("[DataUploadHardened] could not mark dataset failed:", datasetFailureError);
      }
      if (uploadedFilePath && !createdDatasetId) {
        const { error: cleanupError } = await supabase.storage.from("datasets").remove([uploadedFilePath]);
        if (cleanupError) console.warn("[DataUploadHardened] orphan file cleanup failed:", cleanupError);
      }
      toast({ title: coreDataDurable ? "Data imported but finalization failed" : "Import failed", description: message, variant: "destructive" });
      if (coreDataDurable) {
        setDegradedStages([{ stage: "pipeline finalization", message }]);
        setStep("done");
      } else {
        setStep("mapping");
      }
    }
  }, [
    allRows,
    attachDataset,
    classification,
    createProject,
    crossSheet,
    currentOrgId,
    currentProject?.id,
    currentWorkspaceId,
    datasetName,
    detectedSchema,
    file,
    headers,
    importMode,
    ingestionIntel,
    mapping,
    setActiveDataset,
    subscribed,
    tier,
    toast,
    user,
    validation,
    valueColumns,
  ]);

  const renderUpload = () => {
    if (ingestion.status === "running" || ingestion.status === "error" || ingestion.status === "cancelled") {
      return (
        <IngestionProgressCard
          fileName={file?.name ?? "dataset"}
          status={ingestion.status}
          progress={ingestion.progress}
          error={ingestion.error}
          onCancel={ingestion.cancel}
          onRetry={retryWorker}
        />
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = event.dataTransfer.files[0];
          if (dropped) acceptFile(dropped);
        }}
        onClick={() => document.getElementById("hardened-data-input")?.click()}
        className="min-h-[420px] cursor-pointer rounded-2xl border-2 border-dashed border-border bg-card p-10 flex flex-col items-center justify-center text-center hover:border-primary/40 transition-colors"
      >
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Import governed operational data</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Quantivis preserves raw evidence, validates provenance, writes dataset-scoped metrics, and reports every downstream intelligence stage honestly.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">CSV · XLSX · XLS · XLSM · ODS · up to 20 MB · 50,000 browser rows</p>
        <input
          id="hardened-data-input"
          type="file"
          accept=".csv,.xlsx,.xls,.xlsm,.ods"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) acceptFile(selected);
            event.currentTarget.value = "";
          }}
        />
        <UploadTrustBadges />
      </motion.div>
    );
  };

  const renderMapping = () => (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Map evidence fields</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{file?.name} · {allRows.length.toLocaleString()} rows · {headers.length} columns</p>
            </div>
            {classification && <Badge variant="outline">{classification.type} · {Math.round(classification.confidence)}%</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {workbook && workbook.sheets.filter((sheet) => !sheet.hidden && sheet.rows.length > 0).length > 1 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 mb-2"><FileSpreadsheet className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Workbook sheet</span></div>
              <div className="flex flex-wrap gap-2">
                {workbook.sheets.filter((sheet) => !sheet.hidden && sheet.rows.length > 0).map((sheet) => (
                  <Button key={sheet.name} type="button" size="sm" variant={activeSheetName === sheet.name ? "default" : "outline"} onClick={() => loadWorkbookSheet(workbook, sheet.name)}>
                    {sheet.name} · {sheet.rowCount.toLocaleString()} rows
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium">Dataset name</span>
              <input value={datasetName} maxLength={100} onChange={(event) => setDatasetName(event.target.value.slice(0, 100))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-medium">Import mode</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={importMode === "single" ? "default" : "outline"} onClick={() => setImportMode("single")}>Single metric</Button>
                <Button type="button" size="sm" variant={importMode === "multi" ? "default" : "outline"} onClick={() => setImportMode("multi")} disabled={valueColumns < 2}>Multi-metric</Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3 text-xs text-muted-foreground">
            <ShieldCheck className="inline h-3.5 w-3.5 mr-1 text-primary" />
            One real date column is required. The hardened pipeline never invents synthetic dates to make data fit the model.
          </div>

          <div className="space-y-2">
            {headers.map((header, index) => {
              const target = mapping[index] ?? "skip";
              const detected = detectedSchema.find((candidate) => candidate.colIdx === index);
              return (
                <div key={`${index}:${header}`} className="grid gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 md:grid-cols-[1.4fr_1fr_1.2fr] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">{typeIcon(target)}<span className="truncate">{header}</span></div>
                    <p className="mt-1 text-[11px] text-muted-foreground truncate">{allRows[0]?.[index] || "No sample value"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Auto-detected: <span className="font-medium text-foreground">{detected?.inferredType ?? "unknown"}</span>{detected ? ` · ${Math.round(detected.confidence)}%` : ""}
                  </div>
                  <select value={target} onChange={(event) => setMapping((current) => ({ ...current, [index]: event.target.value as ColumnTarget }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {COLUMN_TARGETS.map((option) => <option key={option} value={option}>{option.replace("_", " ")}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {ingestionIntel && <MappingIntelligencePanel intelligence={ingestionIntel} relationships={crossSheet} />}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={resetImport}>Start over</Button>
        <Button onClick={runValidation} className="gap-2">Validate evidence <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  const renderPreview = () => (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pre-import evidence review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Valid points</p><p className="mt-1 text-2xl font-semibold">{validation?.validPoints.toLocaleString() ?? "—"}</p></div>
            <div className="rounded-xl bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Quality score</p><p className="mt-1 text-2xl font-semibold">{validation?.qualityScore ?? "—"}</p></div>
            <div className="rounded-xl bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Metric types</p><p className="mt-1 text-2xl font-semibold">{intelligence?.metricTypes.length ?? "—"}</p></div>
            <div className="rounded-xl bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Data issues</p><p className="mt-1 text-2xl font-semibold">{validation?.errors.length ?? "—"}</p></div>
          </div>
          {validation && validation.invalidPoints > 0 && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="inline h-4 w-4 mr-2 text-warning" />
              {validation.invalidPoints.toLocaleString()} invalid point{validation.invalidPoints === 1 ? "" : "s"} will not enter the governed metric layer.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep("mapping")}>Edit mapping</Button>
        <Button onClick={() => void handleImport()} className="gap-2"><ShieldCheck className="h-4 w-4" />Commit governed import</Button>
      </div>
    </div>
  );

  const renderImporting = () => (
    <Card>
      <CardContent className="min-h-[420px] p-10 flex flex-col items-center justify-center text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h2 className="mt-5 text-lg font-semibold">Building governed data layers</h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">Raw evidence → normalized metrics → verification → analytics → insights → profile → advisory → governed decisions.</p>
      </CardContent>
    </Card>
  );

  const renderDone = () => {
    const degraded = degradedStages.length > 0;
    return (
      <div className="space-y-5">
        <Card className={degraded ? "border-warning/40" : "border-success/30"}>
          <CardContent className="p-10 text-center">
            <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${degraded ? "bg-warning/10" : "bg-success/10"}`}>
              {degraded ? <AlertTriangle className="h-7 w-7 text-warning" /> : <Check className="h-7 w-7 text-success" />}
            </div>
            <h2 className="mt-4 text-xl font-semibold">{degraded ? "Data imported · intelligence partially completed" : "Governed import complete"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {importCount.toLocaleString()} metric rows were durably verified.{degraded ? " The data layer is available, but no full-intelligence claim is being made." : " All tracked downstream intelligence stages completed without a reported error."}
            </p>

            {degraded && (
              <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-warning/30 bg-warning/5 p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-warning">Stages requiring attention</p>
                <div className="mt-2 space-y-2">
                  {degradedStages.map((failure) => (
                    <div key={`${failure.stage}:${failure.message}`} className="text-xs">
                      <span className="font-semibold text-foreground">{failure.stage}</span>
                      <span className="text-muted-foreground"> — {failure.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={resetImport}>Upload another</Button>
              <Button variant="outline" onClick={() => navigate("/data-catalog")} className="gap-2"><Database className="h-4 w-4" />Open Data Catalog</Button>
              {!degraded && importedDatasetId && <Button onClick={() => navigate("/dashboard")} className="gap-2">Open executive view <ArrowRight className="h-4 w-4" /></Button>}
            </div>
          </CardContent>
        </Card>

        <PostUploadSummary
          rowsImported={importCount}
          healthScore={diagnostics?.healthScore ?? intelligence?.qualityScore ?? 0}
          classification={classification}
          diagnostics={diagnostics}
          drift={drift}
          headers={headers}
          sampleRows={allRows.slice(0, 500)}
          hasLineage
        />
      </div>
    );
  };

  return (
    <SectionErrorBoundary sectionName="Data Import">
      <>
        <header className="h-14 border-b border-border/30 flex items-center px-4 sm:px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight">Data Import</h1>
              <p className="hidden sm:block text-[10px] text-muted-foreground">Evidence-preserving · dataset-scoped · fail-closed</p>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-5 flex flex-wrap gap-2">
              {["upload", "mapping", "preview", "importing", "done"].map((stageName, index) => {
                const order = ["upload", "mapping", "preview", "importing", "done"];
                const activeIndex = order.indexOf(step);
                return (
                  <Badge key={stageName} variant={index <= activeIndex ? "default" : "outline"} className="capitalize">
                    {index < activeIndex ? <Check className="mr-1 h-3 w-3" /> : null}{stageName}
                  </Badge>
                );
              })}
            </div>

            {step === "upload" && renderUpload()}
            {step === "mapping" && renderMapping()}
            {step === "preview" && renderPreview()}
            {step === "importing" && renderImporting()}
            {step === "done" && renderDone()}
          </div>
        </main>
      </>
    </SectionErrorBoundary>
  );
};

export default DataUploadHardened;
