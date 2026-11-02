import { redirect } from "next/navigation";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { Workspace } from "../_components/workspace";
import { CreateDocument } from "./create-document";
export default async function NewPage() {
  if (!isMember(await currentIdentity())) redirect("/signin");
  return (
    <Workspace>
      <CreateDocument />
    </Workspace>
  );
}
