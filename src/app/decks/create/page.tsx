import { redirect } from 'next/navigation';
import { currentIdentity, isMember } from '@/lib/identity/identity';
import { DeckCreate } from './deck-create';

export const dynamic = 'force-dynamic';

export default async function NewDeckPage() {
  const viewer = await currentIdentity();
  if (!isMember(viewer)) redirect('/signin');
  return <DeckCreate account={viewer.email} />;
}
