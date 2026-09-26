import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../components/Button";
import { MAX_NAME_LENGTH, useAuthStore } from "./authStore";

const inputClass = "min-h-11 w-full rounded-lg bg-black/30 px-3";

export function AccountPage() {
  const { status, account, error } = useAuthStore();

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Account</h1>
        <Link to="/" className="text-sm text-white/70 underline">
          Home
        </Link>
      </header>

      {error && (
        <p className="rounded-xl bg-red-600/90 p-3" role="alert">
          {error}
        </p>
      )}

      {status === "loading" && <p className="text-white/70">Signing you in…</p>}

      {status === "offline" && (
        <p className="rounded-xl bg-felt-800 p-4 text-white/80">
          You&apos;re playing offline, so accounts are unavailable. Games on this device still work.
        </p>
      )}

      {status === "ready" && account && (
        <>
          {/* Keyed so the form resets when a different account signs in. */}
          <NameForm key={account.id} initialName={account.displayName} />
          {account.isGuest ? (
            <>
              <LinkEmailSection />
              <SignInSection />
            </>
          ) : (
            <section className="flex flex-col gap-3 rounded-2xl bg-felt-800 p-4">
              <h2 className="text-lg font-bold">Signed in</h2>
              <p className="text-white/80" data-testid="account-email">
                {account.email}
              </p>
              <Button variant="secondary" onClick={() => void useAuthStore.getState().signOut()}>
                Sign out
              </Button>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function NameForm({ initialName }: { initialName: string }) {
  const rename = useAuthStore((s) => s.rename);
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(await rename(name));
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl bg-felt-800 p-4">
      <label htmlFor="display-name" className="text-lg font-bold">
        Display name
      </label>
      <input
        id="display-name"
        className={inputClass}
        value={name}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
      />
      <Button type="submit" disabled={name.trim() === initialName}>
        Save name
      </Button>
      {saved && (
        <p className="text-sm text-amber-300" role="status">
          Name saved.
        </p>
      )}
    </form>
  );
}

/** Two-step email + code form shared by "save progress" and "sign in". */
function EmailCodeForm({
  idPrefix,
  sendLabel,
  onSend,
  onVerify,
}: {
  idPrefix: string;
  sendLabel: string;
  onSend(email: string): Promise<boolean>;
  onVerify(email: string, code: string): Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  if (!sentTo) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (await onSend(email)) setSentTo(email.trim());
          });
        }}
      >
        <label htmlFor={`${idPrefix}-email`} className="text-sm text-white/80">
          Email
        </label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {sendLabel}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await onVerify(sentTo, code);
        });
      }}
    >
      <label htmlFor={`${idPrefix}-code`} className="text-sm text-white/80">
        6-digit code sent to {sentTo}
      </label>
      <input
        id={`${idPrefix}-code`}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        className={`${inputClass} tracking-[0.5em]`}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <Button type="submit" disabled={busy || code.length !== 6}>
        Confirm code
      </Button>
      <Button variant="secondary" onClick={() => setSentTo(null)}>
        Use a different email
      </Button>
    </form>
  );
}

function LinkEmailSection() {
  const { requestLinkCode, verifyLinkCode } = useAuthStore();
  return (
    <section
      className="flex flex-col gap-3 rounded-2xl bg-felt-800 p-4"
      aria-labelledby="link-heading"
    >
      <h2 id="link-heading" className="text-lg font-bold">
        Save your progress
      </h2>
      <p className="text-sm text-white/70">
        You&apos;re playing as a guest. Add your email to keep your progress and use it on other
        devices.
      </p>
      <EmailCodeForm
        idPrefix="link"
        sendLabel="Send code"
        onSend={requestLinkCode}
        onVerify={verifyLinkCode}
      />
    </section>
  );
}

function SignInSection() {
  const { requestSignInCode, verifySignInCode } = useAuthStore();
  return (
    <section
      className="flex flex-col gap-3 rounded-2xl bg-felt-800 p-4"
      aria-labelledby="signin-heading"
    >
      <h2 id="signin-heading" className="text-lg font-bold">
        Already have an account?
      </h2>
      <p className="text-sm text-white/70">
        Signing in replaces this guest account on this device.
      </p>
      <EmailCodeForm
        idPrefix="signin"
        sendLabel="Send sign-in code"
        onSend={requestSignInCode}
        onVerify={verifySignInCode}
      />
    </section>
  );
}
