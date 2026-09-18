import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

async function authenticateCredentials({ email, password }) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.user) return null;

    return {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
    };
  } catch {
    return null;
  }
}

const providers = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email address", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      return authenticateCredentials(credentials);
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id;
      return session;
    },
  },
  providers,
});

export const { GET, POST } = handlers;