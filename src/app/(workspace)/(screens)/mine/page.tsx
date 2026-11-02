import { LibraryScreen, type LibrarySearchParams } from "@/app/_components/library-screen";
export const dynamic = "force-dynamic";
export default function MinePage({ searchParams }: { searchParams: LibrarySearchParams }) {
  return <LibraryScreen shelf="mine" searchParams={searchParams} />;
}
