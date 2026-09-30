import type { EvidencePackPdfBlock, EvidencePackPdfReadyModel } from "@/lib/evidence-pack-types";

/**
 * Renders the Evidence Pack's PDF-ready block model to an A4 PDF.
 *
 * Deterministic content: every line comes from the block model, which is
 * itself derived only from the Evidence Pack. jsPDF is loaded on demand so the
 * PDF library stays out of the main bundle.
 */

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 10;
const BODY_SIZE = 10;
const LINE_HEIGHT = 5;

const DARK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const PRIMARY: [number, number, number] = [15, 118, 110];

const STATUS_COLORS: Record<string, [number, number, number]> = {
  complete: [22, 101, 52],
  partial: [161, 98, 7],
  unavailable: [153, 27, 27],
  not_applicable: MUTED,
};

// jsPDF's built-in fonts only cover WinAnsi; map common symbols to safe text.
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/✓/g, "[pass]"],
  [/✗/g, "[fail]"],
  [/[—–]/g, "-"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/…/g, "..."],
  [/·/g, "-"],
  [/€/g, "EUR "],
];

export function toPdfSafeText(value: string): string {
  let text = value;
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  // Drop anything else outside Latin-1 rather than render garbage glyphs.
  return text.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

type JsPdf = import("jspdf").jsPDF;

class PdfWriter {
  private y = MARGIN;

  constructor(private readonly doc: JsPdf) {}

  private ensureSpace(height: number) {
    if (this.y + height > FOOTER_Y - 6) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  private lines(text: string, width = CONTENT_WIDTH): string[] {
    return this.doc.splitTextToSize(toPdfSafeText(text), width) as string[];
  }

  private write(text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}) {
    const size = opts.size ?? BODY_SIZE;
    const indent = opts.indent ?? 0;
    this.doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(opts.color ?? DARK));
    const lineHeight = Math.max(LINE_HEIGHT, size * 0.5);
    for (const line of this.lines(text, CONTENT_WIDTH - indent)) {
      this.ensureSpace(lineHeight);
      this.doc.text(line, MARGIN + indent, this.y);
      this.y += lineHeight;
    }
  }

  gap(height: number) {
    this.y += height;
  }

  block(block: EvidencePackPdfBlock) {
    switch (block.type) {
      case "heading":
        if (block.level === 1) {
          this.write(block.text, { size: 18, bold: true, color: PRIMARY });
          this.gap(2);
        } else {
          this.ensureSpace(14);
          this.gap(3);
          this.write(block.text, { size: 13, bold: true });
        }
        break;
      case "status_line": {
        const color = STATUS_COLORS[block.status] ?? MUTED;
        this.write(block.text, { size: 9, bold: true, color });
        break;
      }
      case "paragraph":
        this.write(block.text);
        this.gap(1);
        break;
      case "key_values":
        for (const item of block.items) this.write(`${item.label}: ${item.value}`, { size: 9 });
        this.gap(1);
        break;
      case "list":
        for (const item of block.items) this.write(`- ${item}`, { indent: 3 });
        this.gap(1);
        break;
      case "timeline":
        for (const step of block.steps) {
          const when = step.timestamp ? ` (${step.timestamp})` : "";
          this.write(`${step.label}: ${step.status.replace(/_/g, " ")}${when}`, { size: 9, bold: true, indent: 3 });
          this.write(step.detail, { size: 9, color: MUTED, indent: 6 });
        }
        this.gap(1);
        break;
    }
  }

  footer(hash: string) {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      this.doc.setPage(page);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.doc.setTextColor(...MUTED);
      this.doc.text(toPdfSafeText(`Quantivis Evidence Pack - ${hash}`), MARGIN, FOOTER_Y);
      this.doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: "right" });
    }
  }
}

/** Render the PDF-ready model and return the PDF bytes. */
export async function renderEvidencePackPdf(model: EvidencePackPdfReadyModel): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Evidence Pack ${model.decision_id}`,
    subject: model.schema_version,
    keywords: model.evidence_pack_hash,
    creator: "Quantivis",
  });

  const writer = new PdfWriter(doc);
  for (const block of model.blocks) writer.block(block);
  writer.footer(model.evidence_pack_hash);

  return doc.output("arraybuffer");
}
