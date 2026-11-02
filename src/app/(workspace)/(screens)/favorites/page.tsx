import { LibraryScreen, type LibrarySearchParams } from "@/app/_components/library-screen";
export const dynamic = "force-dynamic";
export default function FavoritePages({
  searchParams,
}: {
  searchParams: LibrarySearchParams;
}) {
  return <LibraryScreen shelf="favorites" searchParams={searchParams} />;
}
