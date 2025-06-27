import open from 'open';
import ora from 'ora';
import chalk from 'chalk';
import { randomBytes } from 'crypto';
import { OAuthOptions, TokenResponse, UserInfo } from './types';
import { discoverOpenIDConfiguration } from './openid-discovery';

export async function startOAuthFlow(options: OAuthOptions): Promise<TokenResponse> {
  const spinner = ora('Discovering OAuth endpoints...').start();
  
  const config = await discoverOpenIDConfiguration(options.domain);
  
  const state = randomBytes(16).toString('hex');
  
  // Use PKCE if no client secret 
  const usePKCE = !options.clientSecret;
  let codeVerifier = '';
  let codeChallenge = '';
  
  if (usePKCE) {
    codeVerifier = randomBytes(32).toString('base64url');
    codeChallenge = await generateCodeChallenge(codeVerifier);
  }
  
  const authUrl = buildAuthorizationUrl(options, config.authorization_endpoint, state, codeChallenge, usePKCE);
  
  spinner.text = 'Opening browser for authentication...';
  
  await open(authUrl);
  
  spinner.text = 'Waiting for authorization...';
  
  const authCode = await waitForCallback(options.redirectUri, state);
  
  spinner.text = 'Exchanging code for tokens...';
  
  const tokens = await exchangeCodeForToken(options, config.token_endpoint, authCode, codeVerifier);
  
  spinner.succeed('Authentication complete!');
  
  return tokens;
}

function buildAuthorizationUrl(options: OAuthOptions, authorizationEndpoint: string, state: string, codeChallenge: string, usePKCE: boolean): string {
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    state,
    scope: 'profile email'
  };
  
  if (usePKCE && codeChallenge) {
    params.code_challenge = codeChallenge;
    params.code_challenge_method = 'S256';
  }
  
  const searchParams = new URLSearchParams(params);
  return `${authorizationEndpoint}?${searchParams.toString()}`;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function waitForCallback(redirectUri: string, expectedState: string): Promise<string> {
  const url = new URL(redirectUri);
  const port = url.port || '3000';
  
  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port: Number(port),
      fetch(req) {
        const reqUrl = new URL(req.url);
        
        if (reqUrl.pathname === url.pathname) {
          const code = reqUrl.searchParams.get('code');
          const state = reqUrl.searchParams.get('state');
          const error = reqUrl.searchParams.get('error');
          
          if (error) {
            server.stop();
            reject(new Error(`Authorization error: ${error}`));
            return new Response('Authorization failed. You can close this window.', { status: 400 });
          }
          
          if (state !== expectedState) {
            server.stop();
            reject(new Error('State mismatch - possible CSRF attack'));
            return new Response('State mismatch. You can close this window.', { status: 400 });
          }
          
          if (code) {
            server.stop();
            resolve(code);
            return new Response('Authorization successful! You can close this window.', { status: 200 });
          }
        }
        
        return new Response('Not found', { status: 404 });
      },
    });
    
    setTimeout(() => {
      server.stop();
      reject(new Error('Authorization timeout'));
    }, 300000); // 5 minute timeout
  });
}

async function exchangeCodeForToken(
  options: OAuthOptions,
  tokenEndpoint: string,
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  
  const params: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
  };
  
  if (options.clientSecret) {
    params.client_secret = options.clientSecret;
  } else if (codeVerifier) {
    params.code_verifier = codeVerifier;
  }
  
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString()
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  return response.json();
}

export async function fetchUserInfo(domain: string, accessToken: string): Promise<UserInfo> {
  const config = await discoverOpenIDConfiguration(domain);
  
  const response = await fetch(config.userinfo_endpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch user info: ${error}`);
  }
  
  return response.json();
}