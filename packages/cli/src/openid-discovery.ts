import { OpenIDConfiguration } from './types';

const configCache = new Map<string, { config: OpenIDConfiguration; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function discoverOpenIDConfiguration(domain: string): Promise<OpenIDConfiguration> {
  const cached = configCache.get(domain);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.config;
  }

  try {
    const wellKnownUrl = `https://${domain}/.well-known/openid-configuration`;
    const response = await fetch(wellKnownUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenID configuration: ${response.status}`);
    }
    
    const config: OpenIDConfiguration = await response.json();
    
    const requiredFields = ['issuer', 'authorization_endpoint', 'token_endpoint', 'userinfo_endpoint'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required field in OpenID configuration: ${field}`);
      }
    }
    
    configCache.set(domain, { config, timestamp: Date.now() });
    
    return config
  } catch (error) {
    console.warn('Failed to discover OpenID configuration, using defaults:', error);
    return getDefaultClerkConfiguration(domain);
  }
}

function getDefaultClerkConfiguration(domain: string): OpenIDConfiguration {
  return {
    issuer: `https://${domain}`,
    authorization_endpoint: `https://${domain}/oauth/authorize`,
    token_endpoint: `https://${domain}/oauth/token`,
    userinfo_endpoint: `https://${domain}/oauth/userinfo`,
    jwks_uri: `https://${domain}/.well-known/jwks.json`,
    registration_endpoint: `https://${domain}/oauth/register`,
    scopes_supported: ['openid', 'profile', 'email'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none']
  };
}

export function clearConfigCache(domain?: string) {
  if (domain) {
    configCache.delete(domain);
  } else {
    configCache.clear();
  }
}