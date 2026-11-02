/** Transient document capabilities. Never serialized into authored HTML. */
export type DeckRenderChange = {
  slides: readonly string[];
  structure: boolean;
  appearance: boolean;
  customization: boolean;
  progress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
};
declare global {
  interface Document {
    deckPresentation?: {
      state(): { id: string | null; step: number; active: boolean };
      select(id: string, step?: number): boolean;
      move(direction: -1 | 1): void;
      stop(): void;
    };
    deckEditorOpen?: boolean;
    deckReaderCanPause?: boolean;
    deckPauseVideos?:()=>void;
    deckPreviewLogo?: {path:string;url:string};
    deckLoading?: { interacted: boolean; finish(): void };
    deckLayout?: { refresh(): void; settleInitial?(): void; setEditing?(editing: boolean): void; suspend?(): void };
    deckRenderer?: {
      suspend?(): void;
      update(change: DeckRenderChange): Promise<void>;
      release(roots: readonly Element[]): void;
      /** Whether this paper's charts and diagrams are drawn. Older runtimes install
       * the renderer only after every paper is drawn and omit these. */
      isDrawn?(slide: Element): boolean;
      /** Resolves once the paper is drawn, drawing it before the remaining papers. */
      whenDrawn?(slide: Element): Promise<void>;
      /** In the editor's preview the remaining papers wait for this call, made once
       * the editor has shown itself. Elsewhere they are drawn without it. */
      drawRemaining?(): void;
    };
  }
}
