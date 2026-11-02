"use client";
import {
  useId,
  useRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon, type IconName } from "./icons";
import { ariaKeyShortcuts, shortcutById, type ShortcutId } from "../../lib/workspace/keyboard-shortcuts";
import { ShortcutKeys, useApplePlatform, useShortcut } from "./shortcuts";
import { useT } from "./i18n";

export function IconButton({
  label,
  icon,
  filled,
  shortcut,
  hint,
  children,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: string;
  /** 吹き出しの字。読み上げの名前（label）が長い説明を含むとき、見えている人には短い動詞だけを出す（省くと label）。 */
  hint?: string;
  icon: IconName;
  filled?: boolean;
  /** 同じ操作の近道。吹き出しに名前と並べてキーの札を出し、読み上げにも伝える（押して効くかは画面が useShortcut で結ぶ）。 */
  shortcut?: ShortcutId;
  children?: ReactNode;
}) {
  const apple = useApplePlatform();
  const keys = shortcut !== undefined && apple !== null ? ariaKeyShortcuts(shortcutById(shortcut), apple) : null;
  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            {...props}
            type={props.type ?? "button"}
            aria-label={label}
            aria-keyshortcuts={keys ?? undefined}
            className={`ws-icon-button ${props.className ?? ""}`}
          >
            <Icon name={icon} filled={filled ?? false} />
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={4} className="ws-tooltip">
            {hint ?? label}
            {shortcut !== undefined ? <ShortcutKeys id={shortcut} first /> : null}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
export function ActionMenu({
  children,
  label,
  icon = "more",
  trigger,
  side = "bottom",
  align = "end",
  open,
  onOpenChange,
  returnFocus = true,
}: {
  children: ReactNode;
  /** 省くと「その他の操作」。 */
  label?: string;
  icon?: IconName;
  /** 絵のボタンの代わりに開く口（押せる部品 1 つ。名乗りの行のように、字ごと押して開くもの）。 */
  trigger?: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** 開閉を外から持つとき（行の右クリックで開くなど）。省くと部品が自分で持つ。 */
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
  /**
   * 閉じたとき、開いた口へ焦点を戻すか（既定は戻す。キーボードで開いた人が元の場所に戻れる）。
   * 偽にするのは、口が見えない受け皿（右クリックで開くメニュー）のとき——見えない部品に焦点を置き去りにしない。
   */
  returnFocus?: boolean;
}) {
  const t = useT();
  // 渡されたものだけ渡す（デスクトップアプリの型検査は「省略可の項目に undefined を渡す」を断る）
  const controlled: Pick<ComponentProps<typeof Dropdown.Root>, "open" | "onOpenChange"> = {};
  if (open !== undefined) controlled.open = open;
  if (onOpenChange !== undefined) controlled.onOpenChange = onOpenChange;
  const closing: Pick<ComponentProps<typeof Dropdown.Content>, "onCloseAutoFocus"> = returnFocus
    ? {}
    : { onCloseAutoFocus: (event) => event.preventDefault() };
  return (
    <Dropdown.Root {...controlled}>
      <Dropdown.Trigger asChild>
        {trigger ?? <IconButton label={label ?? t("common.moreActions")} icon={icon} />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content side={side} align={align} sideOffset={4} className="ws-menu" {...closing}>
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function MenuAction({
  children,
  icon,
  href,
  onSelect,
  selected,
  danger,
  shortcut,
  keyboardOnly,
}: {
  children: ReactNode;
  /** 省くと字だけの行になる（並び替えのように、選択肢どうしを絵で見分けないもの）。 */
  icon?: IconName;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  /** 消す操作。字と絵を赤にする（DESIGN.md 9 章「消す操作」）。 */
  danger?: boolean;
  /** 同じ操作の近道。行の右端にキーの札を出す（吹き出しと同じ札）。 */
  shortcut?: ShortcutId;
  /** キーボードの無い画面（指で触る機械）では出さない行（キーボードショートカットの一覧など）。 */
  keyboardOnly?: boolean;
}) {
  const className = keyboardOnly ? "ws-menu-item ws-keyboard-only" : "ws-menu-item";
  const content = (
    <>
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
      {shortcut !== undefined ? <ShortcutKeys id={shortcut} first /> : null}
      {selected ? <Icon name="check" /> : null}
    </>
  );
  return href ? (
    <Dropdown.Item asChild className={className}>
      <a href={href}>{content}</a>
    </Dropdown.Item>
  ) : (
    <Dropdown.Item
      className={className}
      data-danger={danger || undefined}
      {...(onSelect ? { onSelect } : {})}
    >
      {content}
    </Dropdown.Item>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  returnFocus,
  drawer = false,
  children,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description?: string;
  returnFocus?: RefObject<HTMLElement | null>;
  /** 左端から出す引き出しにする（狭い画面の目次）。題は読み上げにだけ伝え、閉じるのは外側・Escape・項目を選ぶこと。 */
  drawer?: boolean;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  const descriptionId = useId();
  const t = useT();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ws-overlay" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            trigger.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            // 引き出しは入れ物に焦点を置く（項目に置くと、開いただけでその項目の吹き出しが出る）
            if (drawer && event.currentTarget instanceof HTMLElement) {
              event.preventDefault();
              event.currentTarget.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const element = returnFocus?.current ?? trigger.current;
            requestAnimationFrame(() => {
              if (element?.isConnected) element.focus();
            });
          }}
          className={drawer ? "ws-drawer" : "ws-dialog"}
          aria-describedby={description ? descriptionId : undefined}
        >
          {drawer ? (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          ) : (
            <div className="ws-dialog-heading">
              <Dialog.Title className="ws-dialog-title">{title}</Dialog.Title>
              <Dialog.Close className="ws-icon-button" aria-label={t("common.close")}>
                <Icon name="close" />
              </Dialog.Close>
            </div>
          )}
          {description ? (
            <Dialog.Description
              id={descriptionId}
              className="ws-dialog-description"
            >
              {description}
            </Dialog.Description>
          ) : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
/**
 * 消す前の確認。消す操作はどの画面でもこれ 1 つを通す（DESIGN.md 9 章「消す操作」）。
 *
 * 題は「何をするか」、説明は「何が消えて、戻せるか」。実行は赤い字のボタン 1 つで、
 * 必ず「やめる」の右に置く。行や節をその場で確認文に化けさせない（同じ操作が画面ごとに違う形になる）。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirm,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  /** 実行のボタンの字。省くと「消す」。 */
  confirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
      title={title}
      description={description}
    >
      <div className="ws-dialog-actions">
        <button type="button" className="ws-button" onClick={onCancel}>
          {t("common.dismiss")}
        </button>
        <button type="button" className="ws-button ws-danger" onClick={onConfirm}>
          {confirm ?? t("common.delete")}
        </button>
      </div>
    </Modal>
  );
}
/**
 * 選択欄。矢印はブラウザ任せにせず自前で描く（OS ごとに形と位置が違い、隣の打ち込み口とそろわない）。
 * className は入れ物に付く（幅や余白は置く側が決める）。
 * 名前は必須: aria-label で直に渡すか、見出し（<label htmlFor>）と結ぶ id を渡す。名前の無い選択欄は、
 * 読み上げにも AI の操作にも「何を選ぶ欄か」が伝わらない。
 */
export function Select({
  className,
  children,
  ...props
}: ComponentProps<"select"> & ({ "aria-label": string } | { id: string })) {
  return (
    <span className={`ws-select ${className ?? ""}`}>
      <select {...props} className="ws-field">
        {children}
      </select>
      <Icon name="expand" small />
    </span>
  );
}
/** 探す欄。消すボタンは、字が入っていて onClear を渡したときだけ欄の右端に出す。 */
export function SearchField({
  label,
  onClear,
  ...props
}: Omit<ComponentProps<"input">, "aria-label" | "className" | "ref"> & {
  label: string;
  onClear?: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const apple = useApplePlatform();
  const t = useT();
  // 「/」で欄へ移る。入っている字は選んでおく（打てばそのまま探し直せる）
  const reachable = useShortcut("search", () => {
    input.current?.focus();
    input.current?.select();
  });
  return (
    <div className="ws-search">
      <Icon name="search" />
      <input
        {...props}
        ref={input}
        className="ws-field"
        aria-label={label}
        aria-keyshortcuts={reachable && apple !== null ? (ariaKeyShortcuts(shortcutById("search"), apple) ?? undefined) : undefined}
      />
      {/* 欄が空で焦点が無いときだけ、右端に「/」の札を出す（隠すのは CSS。打ち始めたら消える） */}
      {reachable && !props.value ? (
        <span className="ws-search-hint" aria-hidden="true">
          <ShortcutKeys id="search" />
        </span>
      ) : null}
      {onClear && props.value ? (
        <button
          type="button"
          aria-label={t("common.clearSearch")}
          onClick={() => {
            onClear();
            // 押したボタンは消えるので、焦点を欄へ戻す（戻さないと画面の頭まで落ちる）
            input.current?.focus();
          }}
        >
          <Icon name="close" small />
        </button>
      ) : null}
    </div>
  );
}
