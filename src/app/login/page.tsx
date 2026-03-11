import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Sign in to access your Venaris workspace.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}