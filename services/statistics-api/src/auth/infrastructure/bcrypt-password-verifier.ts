import bcrypt from 'bcryptjs';
import type { PasswordVerifier } from '../domain/ports.js';

export class BcryptPasswordVerifier implements PasswordVerifier {
  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
