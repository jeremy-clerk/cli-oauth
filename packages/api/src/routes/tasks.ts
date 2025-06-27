import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { getDb } from '../db/init';
import { Task, CreateTaskInput, UpdateTaskInput, JWTPayload } from '../types';

export const taskRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

taskRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = await getDb();
  
  const tasks = await db.all<Task[]>(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
    user.sub
  );
  
  await db.close();
  return c.json(tasks);
});

taskRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const taskId = c.req.param('id');
  const db = await getDb();
  
  const task = await db.get<Task>(
    'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
    taskId,
    user.sub
  );
  
  await db.close();
  
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  
  return c.json(task);
});

taskRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<CreateTaskInput>();
  
  if (!body.title) {
    return c.json({ error: 'Title is required' }, 400);
  }
  
  const db = await getDb();
  const task: Task = {
    id: randomUUID(),
    user_id: user.sub,
    title: body.title,
    description: body.description || '',
    completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  await db.run(
    `INSERT INTO tasks (id, user_id, title, description, completed, created_at, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    task.id,
    task.user_id,
    task.title,
    task.description,
    task.completed ? 1 : 0,
    task.created_at,
    task.updated_at
  );
  
  await db.close();
  return c.json(task, 201);
});

taskRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const taskId = c.req.param('id');
  const body = await c.req.json<UpdateTaskInput>();
  
  const db = await getDb();
  
  const existingTask = await db.get<Task>(
    'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
    taskId,
    user.sub
  );
  
  if (!existingTask) {
    await db.close();
    return c.json({ error: 'Task not found' }, 404);
  }
  
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];
  
  if (body.title !== undefined) {
    updates.push('title = ?');
    values.push(body.title);
  }
  
  if (body.description !== undefined) {
    updates.push('description = ?');
    values.push(body.description);
  }
  
  if (body.completed !== undefined) {
    updates.push('completed = ?');
    values.push(body.completed ? 1 : 0);
  }
  
  values.push(taskId, user.sub);
  
  await db.run(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    ...values
  );
  
  const updatedTask = await db.get<Task>(
    'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
    taskId,
    user.sub
  );
  
  await db.close();
  return c.json(updatedTask);
});

taskRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const taskId = c.req.param('id');
  const db = await getDb();
  
  const result = await db.run(
    'DELETE FROM tasks WHERE id = ? AND user_id = ?',
    taskId,
    user.sub
  );
  
  await db.close();
  
  if (result.changes === 0) {
    return c.json({ error: 'Task not found' }, 404);
  }
  
  return c.json({ message: 'Task deleted successfully' });
});