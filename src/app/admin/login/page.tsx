import { getCurrentBar } from "@/lib/tenant";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const bar = await getCurrentBar();
  return (
    <main className="admin login">
      <div className="panel">
        <p className="eyebrow">Owner sign in</p>
        <h1>{bar?.name ?? "Bar admin"}</h1>
        <LoginForm />
      </div>
    </main>
  );
}
