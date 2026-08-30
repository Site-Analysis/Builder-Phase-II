// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

import NextAuth from "next-auth"
import Keycloak from "next-auth/providers/keycloak"

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  logger: {
    error: (code, ...message) => { console.error("[auth][error]", code, ...message) },
    warn:  (code)             => { console.warn("[auth][warn]",  code) },
    debug: (code, ...message) => { console.log("[auth][debug]",  code, ...message) },
  },
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) token.accessToken = account.access_token
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined
      session.user.id = token.sub ?? ""
      return session
    },
  },
})

declare module "next-auth" {
  interface Session {
    accessToken?: string
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}
