import { AuthForm } from '@/components/auth/auth-form';

export const metadata = { title: 'Create an account · Pricing Calculator' };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
