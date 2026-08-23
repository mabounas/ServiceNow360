import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import type { AccountStatus } from '@prisma/client';

const COOKIE = 'sn360_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error('AUTH_SECRET manquant ou trop court (32 caractères recommandés).');
  }
  return new TextEncoder().encode(value);
}

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string, remember = false) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(remember ? '30d' : '7d')
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: remember ? MAX_AGE * 4 : MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  isAdmin: boolean;
  status: AccountStatus;
};

/** Utilisateur courant, ou null. Ne lève jamais. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret());
    const userId = payload.sub;
    if (typeof userId !== 'string') return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        isAdmin: true,
        status: true,
      },
    });
    if (!user || user.status === 'DISABLED') return null;
    return user;
  } catch {
    return null;
  }
}

/** Utilisateur courant obligatoire — lève une erreur exploitée par les routes API. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, 'Authentification requise.');
  return user;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
