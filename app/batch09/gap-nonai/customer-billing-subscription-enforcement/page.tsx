import { redirect } from 'next/navigation';

export default function CustomerBillingSubscriptionEnforcementPage() {
  redirect('/operations?tab=enterprise');
}
