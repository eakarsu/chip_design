import { redirect } from 'next/navigation';

export default function EnterpriseSsoSamlPage() {
  redirect('/operations?tab=enterprise');
}
