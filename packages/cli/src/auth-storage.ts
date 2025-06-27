import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { TokenResponse } from './types';

const CONFIG_DIR = path.join(homedir(), '.clerk-oauth-cli');
const TOKEN_FILE = path.join(CONFIG_DIR, 'tokens.json');

export interface StoredToken extends TokenResponse {
  domain: string;
  stored_at: string;
}

export async function saveToken(domain: string, token: TokenResponse): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    
    const storedToken: StoredToken = {
      ...token,
      domain,
      stored_at: new Date().toISOString(),
    };
    
    await fs.writeFile(TOKEN_FILE, JSON.stringify(storedToken, null, 2));
  } catch (error) {
    console.error('Failed to save token:', error);
  }
}

export async function loadToken(): Promise<StoredToken | null> {
  try {
    const content = await fs.readFile(TOKEN_FILE, 'utf-8');
    const token = JSON.parse(content) as StoredToken;
    
    // Check if token is expired (simple check based on expires_in)
    const storedAt = new Date(token.stored_at).getTime();
    const now = Date.now();
    const expiresIn = token.expires_in * 1000; // Convert to ms
    
    if (now - storedAt > expiresIn) {
      await clearToken();
      return null;
    }
    
    return token;
  } catch (error) {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch (error) {
    // If no file, carry on
  }
}