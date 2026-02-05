import request from 'supertest';
import app from '../server.js';

describe('Exercises API', () => {
  it('GET /api/exercises should require auth', async () => {
    const res = await request(app).get('/api/exercises');
    expect(res.status).toBe(401);
  });
});
