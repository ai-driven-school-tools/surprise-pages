"use client";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "../_components/i18n";
export function ActivityTabs({
  views,
  comments,
}: {
  views: ReactNode;
  comments: ReactNode;
}) {
  const params = useSearchParams(),
    path = usePathname(),
    selected = params.get("tab") === "comments";
  const t = useT();
  return (
    <>
      <nav className="ws-tabs" aria-label={t("workspace.places.activity")}>
        <button
          className="ws-tab"
          aria-current={!selected ? "page" : undefined}
          onClick={() => window.history.replaceState(null, "", path)}
        >
          {t("activity.tabs.viewed")}
        </button>
        <button
          className="ws-tab"
          aria-current={selected ? "page" : undefined}
          onClick={() => window.history.replaceState(null, "", path + "?tab=comments")}
        >
          {t("activity.tabs.comments")}
        </button>
      </nav>
      {selected ? comments : views}
    </>
  );
}
