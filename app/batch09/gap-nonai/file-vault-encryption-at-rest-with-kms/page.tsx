import { redirect } from 'next/navigation';

export default function FileVaultEncryptionAtRestWithKmsPage() {
  redirect('/operations?tab=enterprise');
}
