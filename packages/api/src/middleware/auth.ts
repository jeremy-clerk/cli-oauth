import { Context, Next } from 'hono';
import { createClerkClient } from '@clerk/backend';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
});

export async function authMiddleware(c: Context, next: Next) {
  try {

    const request = c.req.raw;
    
    // Authenticate the request with OAuth token 
    const requestState = await clerkClient.authenticateRequest(request, {
      acceptsToken: 'oauth_token',
    });
    
    if (!requestState.isAuthenticated) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Extract user info from the token
    const { userId, isAuthenticated, scopes, clientId
     } = requestState.toAuth();
    
    if (!isAuthenticated) {
      return c.json({ error: 'No user ID found in token' }, 401);
    }
    
    c.set('user', {
      sub: userId,
      ...scopes,
      clientId,
    });
    
    await next();
  } catch (error) {
    console.error('Auth error:', error);
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}