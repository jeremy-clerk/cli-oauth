import chalk from 'chalk';
import { ClientRegistrationRequest, ClientRegistrationResponse } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { discoverOpenIDConfiguration } from './openid-discovery';

const CONFIG_DIR = path.join(homedir(), '.clerk-oauth-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'clients.json');

export async function registerClient(domain: string, appName: string = 'Clerk OAuth CLI'): Promise<ClientRegistrationResponse> {
  const config = await discoverOpenIDConfiguration(domain);
  
  if (!config.registration_endpoint) {
    throw new Error('OAuth provider does not support dynamic client registration');
  }
  
  const registrationEndpoint = config.registration_endpoint;
  
  const registrationRequest: ClientRegistrationRequest = {
    client_name: appName,
    redirect_uris: ['http://localhost:3000/callback'],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'native',
    scope: 'openid profile email'
  };
  
  console.log(chalk.blue('Registering OAuth client...'));
  
  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(registrationRequest)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Client registration failed: ${error}`);
  }
  
  const clientData = await response.json() as ClientRegistrationResponse;
  
  // Save client data locally
  await saveClientData(domain, clientData);
  
  return clientData;
}

async function saveClientData(domain: string, clientData: ClientRegistrationResponse): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    
    let existingData: Record<string, ClientRegistrationResponse> = {};
    
    try {
      const fileContent = await fs.readFile(CONFIG_FILE, 'utf-8');
      existingData = JSON.parse(fileContent);
    } catch (error) {
      // File doesn't exist yet, carry on
    }
    
    existingData[domain] = clientData;
    
    await fs.writeFile(CONFIG_FILE, JSON.stringify(existingData, null, 2));
  } catch (error) {
    console.warn(chalk.yellow('Warning: Could not save client data locally'));
  }
}

export async function loadClientData(domain: string): Promise<ClientRegistrationResponse | null> {
  try {
    const fileContent = await fs.readFile(CONFIG_FILE, 'utf-8');
    const data = JSON.parse(fileContent);
    return data[domain] || null;
  } catch (error) {
    return null;
  }
}

export async function deleteClientData(domain: string): Promise<void> {
  try {
    const fileContent = await fs.readFile(CONFIG_FILE, 'utf-8');
    const data = JSON.parse(fileContent);
    delete data[domain];
    await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    // Ignore errors
  }
}