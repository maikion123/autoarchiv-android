// Centralized auth checking without component context

export async function checkAuthStatus(): Promise<{ authenticated: boolean; email?: string }> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });

    if (!res.ok) {
      return { authenticated: false };
    }

    const data = await res.json();
    return { authenticated: true, email: data.email };
  } catch (err) {
    console.error("[Auth] checkAuthStatus error:", err);
    return { authenticated: false };
  }
}
