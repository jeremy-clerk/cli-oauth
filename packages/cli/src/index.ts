#!/usr/bin/env bun

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { startOAuthFlow, fetchUserInfo } from './oauth';
import { registerClient, loadClientData, deleteClientData } from './client-registration';
import { saveToken, loadToken, clearToken } from './auth-storage';
import { api } from './api-client';

const program = new Command();

program
  .name('clerk-tasks')
  .description('Task management CLI with Clerk OAuth')
  .version('1.0.0');

program
  .command('interactive', { isDefault: true })
  .description('Start interactive mode')
  .action(async () => {
    const { mainMenu } = await import('./interactive');
    await mainMenu();
  });

program
  .command('login')
  .description('Authenticate using Clerk OAuth (PKCE or client credentials)')
  .option('-c, --client-id <id>', 'OAuth client ID (or set CLERK_OAUTH_CLIENT_ID)')
  .option('-s, --client-secret <secret>', 'OAuth client secret (or set CLERK_OAUTH_CLIENT_SECRET)')
  .option('-r, --redirect-uri <uri>', 'OAuth redirect URI', process.env.CLERK_OAUTH_REDIRECT_URI || 'http://localhost:3000/callback')
  .option('-d, --domain <domain>', 'Clerk domain (or set CLERK_OAUTH_DOMAIN)')
  .action(async (options) => {
    try {
      const config = {
        clientId: options.clientId || process.env.CLERK_OAUTH_CLIENT_ID,
        clientSecret: options.clientSecret || process.env.CLERK_OAUTH_CLIENT_SECRET,
        domain: options.domain || process.env.CLERK_OAUTH_DOMAIN,
        redirectUri: options.redirectUri
      };

      if (!config.clientId || !config.domain) {
        console.error(chalk.red('Error: Client ID and Domain are required'));
        console.log(chalk.yellow('Set them via CLI options or environment variables:'));
        console.log(chalk.gray('  CLERK_OAUTH_CLIENT_ID'));
        console.log(chalk.gray('  CLERK_OAUTH_DOMAIN'));
        process.exit(1);
      }

      const result = await startOAuthFlow(config);
      
      await saveToken(config.domain, result);
      
      console.log(chalk.green('✓ Authentication successful!'));
      console.log(chalk.gray('Token saved for future API calls'));
    } catch (error: any) {
      console.error(chalk.red('Authentication failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('register')
  .description('Register a new OAuth client dynamically')
  .option('-d, --domain <domain>', 'Clerk domain (or set CLERK_OAUTH_DOMAIN)')
  .option('-n, --name <name>', 'Application name', 'Clerk OAuth CLI')
  .action(async (options) => {
    try {
      const domain = options.domain || process.env.CLERK_OAUTH_DOMAIN;
      
      if (!domain) {
        console.error(chalk.red('Error: Domain is required'));
        console.log(chalk.yellow('Set it via CLI option or CLERK_OAUTH_DOMAIN environment variable'));
        process.exit(1);
      }
      
      const clientData = await registerClient(domain, options.name);
      
      console.log(chalk.green('✓ Client registered successfully!'));
      console.log(chalk.blue('Client ID:'), clientData.client_id);
      console.log(chalk.gray(`Configuration saved to ~/.clerk-oauth-cli/clients.json`));
      console.log();
      console.log(chalk.yellow('You can now login with:'));
      console.log(chalk.gray(`  clerk-oauth login -d ${domain}`));
    } catch (error: any) {
      console.error(chalk.red('Registration failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('login-auto')
  .description('Authenticate using environment credentials, saved, or dynamically registered client')
  .option('-d, --domain <domain>', 'Clerk domain (or set CLERK_OAUTH_DOMAIN)')
  .option('-r, --redirect-uri <uri>', 'OAuth redirect URI', process.env.CLERK_OAUTH_REDIRECT_URI || 'http://localhost:3000/callback')
  .action(async (options) => {
    try {
      const domain = options.domain || process.env.CLERK_OAUTH_DOMAIN;
      const envClientId = process.env.CLERK_OAUTH_CLIENT_ID;
      const envClientSecret = process.env.CLERK_OAUTH_CLIENT_SECRET;
      
      if (!domain) {
        console.error(chalk.red('Error: Domain is required'));
        console.log(chalk.yellow('Set it via CLI option or CLERK_OAUTH_DOMAIN environment variable'));
        process.exit(1);
      }
      
      let clientData;
      
      if (envClientId) {
        console.log(chalk.gray('Using client credentials from environment'));
        clientData = {
          client_id: envClientId,
          client_secret: envClientSecret
        };
      } else {
        clientData = await loadClientData(domain);
        
        if (!clientData) {
          console.log(chalk.yellow('No client credentials found. Registering new client...'));
          clientData = await registerClient(domain);
          console.log(chalk.green('✓ Client registered successfully!'));
        } else {
          console.log(chalk.gray('Using saved client registration'));
        }
      }
      
      const config = {
        clientId: clientData.client_id,
        clientSecret: clientData.client_secret,
        domain: domain,
        redirectUri: options.redirectUri
      };
      
      const result = await startOAuthFlow(config);
      
      await saveToken(config.domain, result);
      
      console.log(chalk.green('✓ Authentication successful!'));
      console.log(chalk.gray('Token saved for future API calls'));
    } catch (error: any) {
      console.error(chalk.red('Authentication failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('unregister')
  .description('Remove saved client registration')
  .option('-d, --domain <domain>', 'Clerk domain')
  .action(async (options) => {
    try {
      if (!options.domain) {
        console.error(chalk.red('Error: Domain is required'));
        process.exit(1);
      }
      
      await deleteClientData(options.domain);
      console.log(chalk.green('✓ Client registration removed'));
    } catch (error: any) {
      console.error(chalk.red('Failed to remove registration:'), error.message);
      process.exit(1);
    }
  });

const tasks = program.command('tasks').description('Manage tasks');

tasks
  .command('list')
  .description('List all tasks')
  .action(async () => {
    const spinner = ora('Fetching tasks...').start();
    try {
      const tasks = await api.tasks.list();
      spinner.stop();
      
      if (tasks.length === 0) {
        console.log(chalk.gray('No tasks found. Create one with "clerk-tasks tasks create"'));
        return;
      }
      
      console.log(chalk.bold('\nYour Tasks:\n'));
      tasks.forEach((task: any) => {
        const status = task.completed ? chalk.green('✓') : chalk.gray('○');
        console.log(`${status} ${chalk.bold(task.title)} ${chalk.gray(`(${task.id.slice(0, 8)}...)`)}`)
        if (task.description) {
          console.log(`  ${chalk.gray(task.description)}`);
        }
      });
    } catch (error: any) {
      spinner.fail('Failed to fetch tasks');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

tasks
  .command('create <title>')
  .description('Create a new task')
  .option('-d, --description <desc>', 'Task description')
  .action(async (title, options) => {
    const spinner = ora('Creating task...').start();
    try {
      const task = await api.tasks.create({
        title,
        description: options.description,
      });
      spinner.succeed('Task created');
      console.log(chalk.gray(`Task ID: ${task.id}`));
    } catch (error: any) {
      spinner.fail('Failed to create task');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

tasks
  .command('complete <id>')
  .description('Mark a task as completed')
  .action(async (id) => {
    const spinner = ora('Updating task...').start();
    try {
      await api.tasks.update(id, { completed: true });
      spinner.succeed('Task marked as completed');
    } catch (error: any) {
      spinner.fail('Failed to update task');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

tasks
  .command('delete <id>')
  .description('Delete a task')
  .action(async (id) => {
    const spinner = ora('Deleting task...').start();
    try {
      await api.tasks.delete(id);
      spinner.succeed('Task deleted');
    } catch (error: any) {
      spinner.fail('Failed to delete task');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Clear stored authentication')
  .action(async () => {
    await clearToken();
    console.log(chalk.green('✓ Logged out successfully'));
  });

program
  .command('whoami')
  .description('Display current user information')
  .action(async () => {
    try {
      const token = await loadToken();
      if (!token) {
        console.log(chalk.gray('Not authenticated. Run "clerk-tasks login" first.'));
        return;
      }
      
      const userInfo = await fetchUserInfo(token.domain, token.access_token);
      console.log(chalk.bold('\nCurrent User:'));
      console.log(chalk.gray('  User ID:'), userInfo.sub);
      if (userInfo.email) console.log(chalk.gray('  Email:'), userInfo.email);
      if (userInfo.name) console.log(chalk.gray('  Name:'), userInfo.name);
    } catch (error: any) {
      console.error(chalk.red('Failed to fetch user info:'), error.message);
      process.exit(1);
    }
  });

program.parse();