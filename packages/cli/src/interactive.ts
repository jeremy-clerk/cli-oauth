#!/usr/bin/env bun

import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { startOAuthFlow, fetchUserInfo } from './oauth';
import { registerClient, loadClientData, deleteClientData } from './client-registration';
import { saveToken, loadToken, clearToken } from './auth-storage';
import { api } from './api-client';

async function checkAuth(): Promise<boolean> {
  const token = await loadToken();
  return token !== null;
}

async function displayWelcome() {
  console.clear();
  console.log(chalk.bold.cyan('\n Clerk Tasks CLI\n'));
  
  const isAuthenticated = await checkAuth();
  if (isAuthenticated) {
    try {
      const token = await loadToken();
      const userInfo = await fetchUserInfo(token!.domain, token!.access_token);
      console.log(chalk.gray(`Logged in as: ${userInfo.email || userInfo.sub}`));
    } catch (error) {
      console.log(chalk.yellow('Session expired. Please login again.'));
      await clearToken();
    }
  } else {
    console.log(chalk.gray('Not authenticated'));
  }
  console.log('');
}

async function handleLogin() {
  // Check if we have client creds
  const envClientId = process.env.CLERK_OAUTH_CLIENT_ID;
  const envClientSecret = process.env.CLERK_OAUTH_CLIENT_SECRET;
  
  const domain = await input({
    message: 'Enter your Clerk domain:',
    default: process.env.CLERK_OAUTH_DOMAIN,
    validate: (value) => value ? true : 'Domain is required',
  });

  let clientData: any;
  
  // If we have client ID in env, use it 
  if (envClientId) {
    console.log(chalk.gray('Using client credentials from environment'));
    clientData = {
      client_id: envClientId,
      client_secret: envClientSecret
    };
  } else {
    // Try to load existing client data from dynamic registration
    clientData = await loadClientData(domain);
    
    if (!clientData) {
      console.log(chalk.yellow('No client ID found. Using dynamic registration...'));
      const spinner = ora('Registering OAuth client...').start();
      try {
        clientData = await registerClient(domain);
        spinner.succeed('Client registered successfully!');
      } catch (error: any) {
        spinner.fail('Dynamic registration failed');
        console.error(chalk.red(error.message));
        
        // Fallback to manual entry
        const useManual = await confirm({
          message: 'Would you like to enter a client ID manually?',
          default: true,
        });
        
        if (useManual) {
          const clientId = await input({
            message: 'Enter your OAuth Client ID:',
            validate: (value) => value ? true : 'Client ID is required',
          });
          
          clientData = { client_id: clientId } as any;
        } else {
          return;
        }
      }
    } else {
      console.log(chalk.gray('Using saved client configuration'));
    }
  }

  const spinner = ora('Starting OAuth flow...').start();
  try {
    const clientSecret = process.env.CLERK_OAUTH_CLIENT_SECRET || clientData.client_secret;
    
    const result = await startOAuthFlow({
      clientId: clientData.client_id,
      clientSecret: clientSecret,
      domain: domain,
      redirectUri: process.env.CLERK_OAUTH_REDIRECT_URI || 'http://localhost:3000/callback'
    });
    
    spinner.stop();
    if (clientSecret) {
      console.log(chalk.gray('Using client credentials flow'));
    } else {
      console.log(chalk.gray('Using PKCE flow'));
    }
    
    await saveToken(domain, result);
    console.log(chalk.green(' Authentication successful!'));
  } catch (error: any) {
    spinner.fail('Authentication failed');
    console.error(chalk.red(error.message));
  }
}

async function handleTaskList() {
  const spinner = ora('Fetching tasks...').start();
  try {
    const tasks = await api.tasks.list();
    spinner.stop();
    
    if (tasks.length === 0) {
      console.log(chalk.gray('\nNo tasks found.\n'));
      return;
    }
    
    console.log(chalk.bold('\nYour Tasks:\n'));
    tasks.forEach((task: any, index: number) => {
      const status = task.completed ? chalk.green('') : chalk.gray('');
      console.log(`${status} ${index + 1}. ${chalk.bold(task.title)}`);
      if (task.description) {
        console.log(`     ${chalk.gray(task.description)}`);
      }
      console.log(`     ${chalk.dim(`ID: ${task.id.slice(0, 8)}...`)}`);
      console.log('');
    });
  } catch (error: any) {
    spinner.fail('Failed to fetch tasks');
    console.error(chalk.red(error.message));
  }
}

async function handleTaskCreate() {
  const title = await input({
    message: 'Task title:',
    validate: (value) => value ? true : 'Title is required',
  });
  
  const description = await input({
    message: 'Task description (optional):',
  });
  
  const spinner = ora('Creating task...').start();
  try {
    const task = await api.tasks.create({
      title,
      description: description || undefined,
    });
    spinner.succeed(`Task created: ${task.title}`);
  } catch (error: any) {
    spinner.fail('Failed to create task');
    console.error(chalk.red(error.message));
  }
}

async function handleTaskComplete() {
  const spinner = ora('Fetching tasks...').start();
  try {
    const tasks = await api.tasks.list();
    spinner.stop();
    
    const incompleteTasks = tasks.filter((t: any) => !t.completed);
    
    if (incompleteTasks.length === 0) {
      console.log(chalk.gray('\nNo incomplete tasks found.\n'));
      return;
    }
    
    const choices = incompleteTasks.map((task: any) => ({
      name: task.title,
      value: task.id,
      description: task.description,
    }));
    
    const taskId = await select({
      message: 'Select task to complete:',
      choices,
    });
    
    const updateSpinner = ora('Marking as complete...').start();
    await api.tasks.update(taskId as string, { completed: true });
    updateSpinner.succeed('Task completed!');
  } catch (error: any) {
    spinner.fail('Failed');
    console.error(chalk.red(error.message));
  }
}

async function handleTaskDelete() {
  const spinner = ora('Fetching tasks...').start();
  try {
    const tasks = await api.tasks.list();
    spinner.stop();
    
    if (tasks.length === 0) {
      console.log(chalk.gray('\nNo tasks found.\n'));
      return;
    }
    
    const choices = tasks.map((task: any) => ({
      name: `${task.completed ? '' : ''} ${task.title}`,
      value: task.id,
      description: task.description,
    }));
    
    const taskId = await select({
      message: 'Select task to delete:',
      choices,
    });
    
    const confirmDelete = await confirm({
      message: 'Are you sure you want to delete this task?',
      default: false,
    });
    
    if (confirmDelete) {
      const deleteSpinner = ora('Deleting task...').start();
      await api.tasks.delete(taskId as string);
      deleteSpinner.succeed('Task deleted!');
    }
  } catch (error: any) {
    spinner.fail('Failed');
    console.error(chalk.red(error.message));
  }
}

async function handleClearClients() {
  const domains = await input({
    message: 'Enter domain to clear (or "all" for all domains):',
    validate: (value) => value ? true : 'Domain is required',
  });
  
  if (domains === 'all') {
    const confirmClear = await confirm({
      message: 'Are you sure you want to clear ALL saved OAuth clients?',
      default: false,
    });
    
    if (confirmClear) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const os = await import('os');
        const configFile = path.join(os.homedir(), '.clerk-oauth-cli', 'clients.json');
        await fs.writeFile(configFile, '{}');
        console.log(chalk.green(' All client registrations cleared'));
      } catch (error) {
        console.log(chalk.yellow('No client registrations found'));
      }
    }
  } else {
    await deleteClientData(domains);
    console.log(chalk.green(` Client registration for ${domains} cleared`));
  }
}

async function mainMenu() {
  while (true) {
    await displayWelcome();
    
    const isAuthenticated = await checkAuth();
    
    const choices = isAuthenticated ? [
      { name: ' List tasks', value: 'list' },
      { name: ' Create task', value: 'create' },
      { name: ' Complete task', value: 'complete' },
      { name: ' Delete task', value: 'delete' },
      { name: ' Who am I', value: 'whoami' },
      { name: ' Clear saved OAuth clients', value: 'clear-clients' },
      { name: ' Logout', value: 'logout' },
      { name: ' Exit', value: 'exit' },
    ] : [
      { name: ' Login', value: 'login' },
      { name: ' Clear saved OAuth clients', value: 'clear-clients' },
      { name: ' Exit', value: 'exit' },
    ];
    
    const action = await select({
      message: 'What would you like to do?',
      choices,
    });
    
    console.log(''); 
    
    switch (action) {
      case 'login':
        await handleLogin();
        break;
        
      case 'list':
        await handleTaskList();
        break;
        
      case 'create':
        await handleTaskCreate();
        break;
        
      case 'complete':
        await handleTaskComplete();
        break;
        
      case 'delete':
        await handleTaskDelete();
        break;
        
      case 'whoami':
        try {
          const token = await loadToken();
          const userInfo = await fetchUserInfo(token!.domain, token!.access_token);
          console.log(chalk.bold('\nCurrent User:'));
          console.log(chalk.gray('  User ID:'), userInfo.sub);
          if (userInfo.email) console.log(chalk.gray('  Email:'), userInfo.email);
          if (userInfo.name) console.log(chalk.gray('  Name:'), userInfo.name);
          console.log('');
        } catch (error: any) {
          console.error(chalk.red('Failed to fetch user info:'), error.message);
        }
        break;
        
      case 'logout':
        await clearToken();
        console.log(chalk.green(' Logged out successfully\n'));
        break;
        
      case 'clear-clients':
        await handleClearClients();
        break;
        
      case 'exit':
        console.log(chalk.gray('Goodbye!\n'));
        process.exit(0);
    }
    
    if (action !== 'exit') {
      await input({ message: 'Press Enter to continue...' });
    }
  }
}

export { mainMenu };

if (import.meta.main) {
  mainMenu().catch(console.error);
}