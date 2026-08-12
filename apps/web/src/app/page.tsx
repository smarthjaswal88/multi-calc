import { redirect } from 'next/navigation';

/** The app opens on the user's data, not a landing page. */
export default function RootPage() {
  redirect('/documents');
}
