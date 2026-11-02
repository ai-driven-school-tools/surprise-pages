import {
  Search,
  Star,
  Ellipsis,
  Copy,
  X,
  Plus,
  House,
  Folder,
  Clock3,
  Building2,
  Settings,
  ShieldCheck,
  UserRound,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  SlidersHorizontal,
  Presentation,
  FileText,
  PanelsTopLeft,
  CircleHelp,
  LockKeyhole,
  Globe2,
  Pencil,
  Share2,
  ArrowUpRight,
  Link2,
  Trash2,
  Eye,
  EyeOff,
  Monitor,
  Sun,
  Moon,
  Laptop,
  Palette,
  LogOut,
  Check,
  ArrowLeft,
  MessageSquare,
  BookOpen,
  Play,
  Pause,
  Download,
  RefreshCw,
  Keyboard,
  CircleArrowUp,
} from "lucide-react";
/**
 * One semantic name for every icon used by the service UI.
 *
 * 大きさは 2 段だけ: 16px（既定。ボタン・目次・メニュー・行の種類）と 14px（small。12px の字に添える印）。
 * 線の太さは 1.5。14px の字と並べたときに、字の線より太く見えない値。
 */
const icons = {
  search: Search,
  favorite: Star,
  more: Ellipsis,
  copy: Copy,
  close: X,
  create: Plus,
  home: House,
  files: Folder,
  activity: Clock3,
  company: Building2,
  settings: Settings,
  admin: ShieldCheck,
  account: UserRound,
  sidebar: PanelLeft,
  previous: ChevronLeft,
  next: ChevronRight,
  expand: ChevronDown,
  sort: ArrowUpDown,
  filter: SlidersHorizontal,
  deck: Presentation,
  document: FileText,
  page: PanelsTopLeft,
  unknown: CircleHelp,
  restricted: LockKeyhole,
  public: Globe2,
  edit: Pencil,
  share: Share2,
  open: ArrowUpRight,
  link: Link2,
  delete: Trash2,
  show: Eye,
  hide: EyeOff,
  system: Monitor,
  light: Sun,
  dark: Moon,
  devices: Laptop,
  theme: Palette,
  logout: LogOut,
  check: Check,
  back: ArrowLeft,
  comments: MessageSquare,
  guide: BookOpen,
  play: Play,
  pause: Pause,
  download: Download,
  regenerate: RefreshCw,
  keyboard: Keyboard,
  /** デスクトップアプリの新しい版（アップデート）。ファイルを落とす download とは別の概念なので、同じ絵を当てない */
  update: CircleArrowUp,
  /** 登録した GitHub のリポジトリ。自分の資料のフォルダ（files）とは別の概念 */
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  small = false,
  filled = false,
}: {
  name: IconName;
  small?: boolean;
  filled?: boolean;
}) {
  const Shape = icons[name];
  return (
    <Shape
      aria-hidden="true"
      className={small ? "size-3.5 shrink-0" : "size-4 shrink-0"}
      strokeWidth={1.5}
      fill={filled ? "currentColor" : "none"}
    />
  );
}
