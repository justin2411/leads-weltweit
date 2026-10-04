/**
 * Linien-Icons für Dashboard und Website (Inhaber 03.10.2026: „Nimm bitte keine Emojis, sondern immer Icons in unserem Stil“).
 * Stil: dünne Linien (1,8 px, absolut), runde Enden, currentColor, keine Füllung, keine eigenen Farben, Größe wie der Text.
 * Quelle: lucide-react (ISC-Lizenz, kostenlos). Funktioniert in Server- und Client-Komponenten.
 * Reine Lib-Module (app/lib/*.ts) speichern nur den Namen (IconName) und bleiben React-frei.
 */
import type { LucideIcon } from "lucide-react";
import {
  Archive, ArrowDown, ArrowRight, ArrowUpWideNarrow, Ban, Bell, Blocks, Brain, Bot, Cable, ChartColumn, Check, ChevronDown, ChevronRight,
  ChevronUp, CircleAlert, CircleCheck, CircleX, ClipboardCheck, Clock, Contact, Copy, CopyX, Database, Delete, Download, Ellipsis,
  Factory, Filter, Flag, Forward, Gift, Globe, GripVertical, HardDrive, Headset, Hourglass, House, Info, Lock, Magnet, Mail, MailX,
  Menu, MessageSquare, Minus, MousePointerClick, Move, Package, Pause, Phone, Pickaxe, Play, Plus, Radar, RefreshCw, Repeat,
  Reply, Search, Send, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Split, Square, Star, Target, TrendingDown,
  TrendingUp, Trash2, TriangleAlert, Undo2, UserRound, Users, Workflow, X,
} from "lucide-react";
import { AppWindow, CircleQuestionMark, Gauge, RectangleEllipsis, Scale, Smartphone, Type, Unlink } from "lucide-react";

const ICONS = {
  // Werke und Stationen
  werk: Factory,
  "lead-werk": Pickaxe,
  "kunden-werk": Magnet,
  kunden: Users,
  kunde: UserRound,
  kaeufer: Target,
  // Kunden-Agent / persönlicher Ansprechpartner (Inhaber 04.10.2026)
  ansprechpartner: Headset,
  proben: Gift,
  antworten: MessageSquare,
  antwort: Reply,
  nachfass: Repeat,
  versand: Send,
  lieferung: Package,
  tagescheck: ClipboardCheck,
  freigabe: ShieldCheck,
  bestand: Archive,
  // Baukasten-Bausteine
  quelle: Database,
  filter: Filter,
  weiche: Split,
  punkte: Star,
  top: ArrowUpWideNarrow,
  dubletten: CopyX,
  statistik: ChartColumn,
  pipeline: Workflow,
  export: Download,
  agent: Bot,
  melden: Bell,
  "an-agent": Forward,
  neu: Sparkles,
  verbinden: Cable,
  ziehen: Move,
  antippen: MousePointerClick,
  griff: GripVertical,
  ruecktaste: Delete,
  kopieren: Copy,
  // Navigation
  jarvis: Radar,
  regler: SlidersHorizontal,
  baukasten: Blocks,
  speicher: HardDrive,
  kontakte: Contact,
  gehirn: Brain,
  // Website (Inhaber 04.10.2026): Themenfeld mit Gesundheit je Bereich, Website-Agenten, Änderungswünschen
  website: AppWindow,
  tempo: Gauge,
  handy: Smartphone,
  recht: Scale,
  formular: RectangleEllipsis,
  text: Type,
  "link-kaputt": Unlink,
  "start-seite": House,
  menue: Menu,
  // Status und Aktionen
  schloss: Lock,
  uhr: Clock,
  warten: Hourglass,
  warnung: TriangleAlert,
  achtung: CircleAlert,
  ok: Check,
  "ok-kreis": CircleCheck,
  fehler: X,
  "fehler-kreis": CircleX,
  schliessen: X,
  start: Play,
  pause: Pause,
  stopp: Square,
  rueckgaengig: Undo2,
  wiederholen: RefreshCw,
  einstellungen: Settings,
  loeschen: Trash2,
  abmeldung: Ban,
  bounce: MailX,
  info: Info,
  mehr: Plus,
  weniger: Minus,
  hoch: ChevronUp,
  runter: ChevronDown,
  weiter: ChevronRight,
  "trend-hoch": TrendingUp,
  "trend-runter": TrendingDown,
  punkte3: Ellipsis,
  // Kontakt und Inhalt
  telefon: Phone,
  mail: Mail,
  stern: Star,
  pfeil: ArrowRight,
  "pfeil-runter": ArrowDown,
  land: Globe,
  flagge: Flag,
  suche: Search,
  frage: CircleQuestionMark,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function isIconName(x: unknown): x is IconName {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(ICONS, x);
}

/** Linien-Icon in Textgröße. Ohne `title` rein dekorativ (aria-hidden), mit `title` als Bild mit Namen. */
export function Icon({ name, size = 18, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  const Cmp = ICONS[name] ?? Info;
  const cls = className ? `ico ${className}` : "ico";
  return title
    ? <Cmp size={size} strokeWidth={1.8} absoluteStrokeWidth className={cls} role="img" aria-label={title}><title>{title}</title></Cmp>
    : <Cmp size={size} strokeWidth={1.8} absoluteStrokeWidth className={cls} aria-hidden="true" focusable="false" />;
}
