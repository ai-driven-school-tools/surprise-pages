import { LibraryScreen, type LibrarySearchParams } from "@/app/_components/library-screen";
export const dynamic = "force-dynamic";
export default function CompanyPages({
  searchParams,
}: {
  searchParams: LibrarySearchParams;
}) {
  return <LibraryScreen shelf="company" searchParams={searchParams} />;
}
