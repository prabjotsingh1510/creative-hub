import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  inactive: "This account is deactivated.",
  invalid_link: "That link is invalid or has expired. Ask the admin to send a new invite.",
};

// Server-rendered shell: the form is in the first HTML response (fast first paint), hydrated afterwards.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center p-4">
      <LoginForm initialError={(error && MESSAGES[error]) || null} />
    </main>
  );
}
