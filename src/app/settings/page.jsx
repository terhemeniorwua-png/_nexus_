"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMutation } from "@/hooks/useResource";
import { AUTH_ENDPOINTS } from "@/lib/api";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import Avatar from "@/components/workspace/Avatar";
import GlobalNav from "@/components/workspace/GlobalNav";
import { CheckIcon } from "@/components/workspace/icons";
import "../workspace.css";

function Field({ label, hint, children, htmlFor }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[11.5px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

function Notice({ tone, children }) {
  if (!children) return null;
  const styles =
    tone === "error"
      ? "border-red-400/25 bg-red-400/10 text-red-300"
      : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  return (
    <p className={`rounded-lg border px-3 py-2 text-[12.5px] ${styles}`} role="status">
      {children}
    </p>
  );
}

const inputClass =
  "ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100 disabled:opacity-60";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { run, loading } = useMutation();

  const [profile, setProfile] = useState({ name: user?.name || "", avatar: user?.avatar || "" });
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  function setProfileField(patch) {
    setProfileSaved(false);
    setProfile((prev) => ({ ...prev, ...patch }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError("");
    setProfileSaved(false);

    const result = await run(AUTH_ENDPOINTS.updateProfile, {
      method: "PATCH",
      body: {
        name: profile.name.trim(),
        avatar: profile.avatar.trim(),
      },
    });

    if (result.error) {
      setProfileError(result.error.message);
      return;
    }

    // The response carries the new user, but every header, avatar and greeting
    // reads it from context, so the session is re-read rather than patched here.
    await refreshUser();
    setProfile((prev) => ({
      name: result.data?.user?.name ?? prev.name,
      avatar: result.data?.user?.avatar ?? prev.avatar,
    }));
    setProfileSaved(true);
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");

    const result = await run(AUTH_ENDPOINTS.changePassword, {
      method: "POST",
      body: {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
        confirmPassword: passwords.confirmPassword,
      },
    });

    if (result.error) {
      setPasswordError(result.error.message);
      return;
    }

    // The fields are cleared whatever the server said: leaving a new password
    // sitting in a form invites it to be submitted twice.
    setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordNotice(result.data?.message || "Password changed.");
  }

  return (
    <ProtectedRoute>
    <div className="ws-canvas relative min-h-dvh text-zinc-200">
      <div className="ws-glow left-[-10%] top-[-15%] h-[380px] w-[380px] bg-blue-600/20" />

      <div className="relative z-10 min-h-dvh">
        <GlobalNav />

        <main className="mx-auto w-full max-w-3xl px-5 py-10 md:px-8">
          <header>
            <h1 className="text-[24px] font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-1 text-[14px] text-zinc-400">
              Your account details and password.
            </p>
          </header>

          <section className="mt-8">
            <div className="ws-card rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <Avatar name={user?.name} avatar={user?.avatar} size={48} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-white">
                    {user?.name || "—"}
                  </p>
                  <p className="truncate font-mono text-[12px] text-zinc-500">
                    {user?.email || "—"}
                  </p>
                </div>
              </div>

              <form onSubmit={saveProfile} className="mt-6 space-y-4">
                <Field label="Full name" htmlFor="settings-name">
                  <input
                    id="settings-name"
                    value={profile.name}
                    onChange={(event) => setProfileField({ name: event.target.value })}
                    maxLength={100}
                    autoComplete="name"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Avatar URL"
                  htmlFor="settings-avatar"
                  hint="Optional. An http(s) image address. Leave empty to use your initials."
                >
                  <input
                    id="settings-avatar"
                    value={profile.avatar}
                    onChange={(event) => setProfileField({ avatar: event.target.value })}
                    maxLength={500}
                    inputMode="url"
                    placeholder="https://cdn.example.com/avatar.png"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Email"
                  htmlFor="settings-email"
                  hint="Your sign-in address. It cannot be changed here, because changing it would need a way to prove the new address belongs to you."
                >
                  <input
                    id="settings-email"
                    value={user?.email || ""}
                    disabled
                    readOnly
                    className={`${inputClass} font-mono`}
                  />
                </Field>

                {profileError ? <Notice tone="error">{profileError}</Notice> : null}
                {profileSaved && !profileError ? (
                  <Notice tone="success">Profile updated.</Notice>
                ) : null}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {profileSaved && !profileError ? <CheckIcon size={14} /> : null}
                    {loading ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section className="mt-6">
            <div className="ws-card rounded-2xl p-6">
              <h2 className="text-[15px] font-semibold text-white">Password</h2>
              <p className="mt-1 text-[13px] text-zinc-400">
                Changing your password signs out your other devices. This device stays signed in.
              </p>

              <form onSubmit={changePassword} className="mt-5 space-y-4">
                <Field label="Current password" htmlFor="settings-current">
                  <input
                    id="settings-current"
                    type="password"
                    value={passwords.currentPassword}
                    onChange={(event) =>
                      setPasswords((prev) => ({ ...prev, currentPassword: event.target.value }))
                    }
                    autoComplete="current-password"
                    className={inputClass}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New password" htmlFor="settings-new">
                    <input
                      id="settings-new"
                      type="password"
                      value={passwords.newPassword}
                      onChange={(event) =>
                        setPasswords((prev) => ({ ...prev, newPassword: event.target.value }))
                      }
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Confirm new password" htmlFor="settings-confirm">
                    <input
                      id="settings-confirm"
                      type="password"
                      value={passwords.confirmPassword}
                      onChange={(event) =>
                        setPasswords((prev) => ({ ...prev, confirmPassword: event.target.value }))
                      }
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </Field>
                </div>

                {passwordError ? <Notice tone="error">{passwordError}</Notice> : null}
                {passwordNotice ? <Notice tone="success">{passwordNotice}</Notice> : null}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {loading ? "Updating…" : "Change password"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
    </ProtectedRoute>
  );
}
