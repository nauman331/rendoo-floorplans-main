export type ProjectLevel = 'woningtype' | 'verdieping' | 'project';
export type OutputType = '2d-basic' | '2d-luxe' | '3d-shoebox' | '3d-dollhouse';

/**
 * Stages the user walks through.
 *
 *  niveau      — Step 1/4: pick woningtype / verdieping / project (only
 *                woningtype is enabled in this iteration)
 *  stijl       — Step 2/4: pick 2D Basic vs 2D Luxe, then pick a favourite example
 *  branding    — Step 3/4: brand colours / logo (Basic only, auto-skipped for Luxe)
 *  input       — Step 4/4: plan upload + unit list
 *  analyzing   — background analyse is running
 *  validatie   — confirm detected unit types
 *  resultaat   — generated plan shown with feedback iteration (max 5)
 *  exported    — user downloaded / finished
 */
export type ProjectStatus =
  | 'niveau'
  | 'stijl'
  | 'branding'
  | 'input'
  | 'analyzing'
  | 'validatie'
  | 'resultaat'
  | 'exported';

/** The step number shown in the "Stap X/4" indicator during the input phase. */
export type InputStep = 1 | 2 | 3 | 4;

export interface Project {
  id: string;
  name: string;
  createdAt: Date;
  /** true until the user completes all three input steps */
  isDraft: boolean;
  level: ProjectLevel | null;
  outputCategory: '2d' | '3d' | null;
  outputType: OutputType | null;
  /** Id of the chosen example image from the gallery (e.g. "04-c30301"). */
  exampleId: string | null;
  /** Branding preferences (2D Basic only). */
  branding: Branding | null;
  files: UploadedFile[];
  analysis: FloorplanAnalysis | null;
  status: ProjectStatus;
  /** Feedback iterations on the generated plan. Max 5. */
  feedback: FeedbackRound[];
  /** Edits applied to the renderer — derived from feedback rounds. */
  edits: PlanEdit[];
}

export interface Branding {
  /** Hex colour, e.g. "#2E5E3A". If null / empty, default to black & white. */
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  /** Data URL or uploaded file id of the logo. */
  logoDataUrl: string | null;
  /** Free-text notes on brand personality. */
  notes: string | null;
}

export interface FeedbackRound {
  id: string;
  createdAt: string; // ISO timestamp, serialisable for persistence
  /** Free-text description of what should change. */
  text: string;
  /**
   * Optional annotated shape on the plan. Coordinates are stored as
   * fractions of the rendered image (0..1) so we don't need the
   * original pixel dimensions when re-rendering.
   *
   * Two shapes are supported:
   *   - circle:    cx, cy, r              (r is fraction of min(w,h))
   *   - rectangle: cx, cy, w, h           (w/h are fractions of width/height)
   */
  annotation?: AnnotationShape;
  /** Optional "pick from library" answer — furniture item id. */
  libraryPick?: string;
}

export type AnnotationShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; cx: number; cy: number; w: number; h: number };

/**
 * A single edit that the renderer applies on top of its auto-placed
 * furniture. Each edit is scoped to an annotation area on the plan
 * (the orange shape the user drew) so multiple edits can coexist
 * without stomping each other.
 *
 *  - 'add'      → place `newItem` somewhere inside `area`
 *  - 'remove'   → drop any furniture whose center sits inside `area`,
 *                 or only those matching `targetItem` when set
 *  - 'replace'  → remove first, then add
 */
export interface PlanEdit {
  id: string;
  createdAt: string;
  /** Which feedback round produced this edit (for the history list). */
  feedbackId: string;
  area: AnnotationShape;
  action: 'add' | 'remove' | 'replace';
  /** Which furniture id to remove (optional — defaults to "anything in the area"). */
  targetItem?: string;
  /** Which furniture id to add (required for add/replace). */
  newItem?: string;
  /** Original feedback text — kept for the history panel. */
  source: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: 'dwg' | 'dxf' | 'pdf';
  url: string;
  rasterUrl?: string;
}

export interface FloorplanAnalysis {
  totalUnits: number;
  uniqueTypes: number;
  mirroredTypes: number;
  floors: FloorInfo[];
  units: DetectedUnit[];
  source?: 'gpt4_vision';
  aiModel?: string;
  pipelineStatus?: 'complete' | 'error';
  pipelineError?: string;
}

export interface FloorInfo {
  index: number;
  label: string;
}

export type UnitClassification = 'hoofdtype' | 'gespiegeld' | 'variant';

export interface DetectedUnit {
  id: string;
  label: string;
  typeGroup: string;
  classification: UnitClassification;
  isMirrored: boolean;
  mirrorOf?: string;
  variantOf?: string;
  floor: number;
  polygon: Point[];
  area: number;
  rooms: DetectedRoom[];
  confidence: number;
}

export interface DetectedRoom {
  type: string;
  label: string;
  polygon: Point[];
  area: number;
  dimensions: { width: number; height: number };
}

export interface Point {
  x: number;
  y: number;
}

export interface FloorplanStyle {
  id: string;
  name: string;
  category: '2d-basic' | '2d-luxe';
  description: string;
  previewImage: string;
  wallColor: string;
  wallWidth: number;
  floorColors: Record<string, string>;
  fontFamily: string;
  showFurniture: boolean;
}

export interface StyleExample {
  id: string;
  image: string;
  label: string;
  caption?: string;
}

export interface FurnitureItem {
  id: string;
  name: string;
  category: 'woonkamer' | 'eetkamer' | 'slaapkamer' | 'badkamer' | 'keuken';
  svgPath: string;
  width: number;
  height: number;
}

export interface WallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface PlacedFurniture extends FurnitureItem {
  instanceId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

/**
 * Correction log — every human edit made in PlanCanvas.
 * Non-negotiable for V2 ML training dataset.
 * Structured tracking of operator corrections (geometry, classification, furniture).
 */
export interface CorrectionLog {
  id: string;
  projectId: string;
  fileId: string;
  correctionType: 'polygon_edit' | 'unit_classification' | 'furniture_placement';
  unitId: string;
  beforePolygon: Point[] | null;
  afterPolygon: Point[] | null;
  beforeClassification: string | null;
  afterClassification: string | null;
  beforeArea: number | null;
  afterArea: number | null;
  operatorNotes: string | null;
  aiConfidence: number | null;
  correctionConfidence: number;
  aiSource: string; // 'gpt4_vision' | 'geometry_normaliser' | 'claude_vision'
  moodId: string | null;
  inputFileType: 'dwg' | 'dxf' | 'pdf';
  createdBy: string;
  createdAt: Date;
  editedAt?: Date;
  mlLabelVerified: boolean;
  mlLabelNotes: string | null;
}

/**
 * Operator statistics — tracks quality metrics per operator.
 * Used for operator performance monitoring.
 */
export interface OperatorStats {
  id: string;
  operatorName: string;
  totalCorrections: number;
  avgCorrectionConfidence: number;
  correctionsPerProject: number;
  lastActive: Date;
}
