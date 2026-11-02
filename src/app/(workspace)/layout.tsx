import type { ReactNode } from "react";
import { Workspace } from "@/app/_components/workspace";

/**
 * Keep navigation mounted while each screen loads its own data.
 * 待ちの表示（loading.tsx）は置かない。届くまで前の画面を残し、押したリンクに印を立てる（src/app/_components/back-link.tsx の LinkPending）。待ちの表示を置くと、React は中身が届いても 300ms は差し替えない。
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
