import request from 'supertest';
import app from '../server.js';

// NOTE: These tests are placeholders — they require a test database and valid JWTs.

describe('Exercises API', () => {
  it('GET /api/exercises should require auth', async () => {
    const res = await request(app).get('/api/exercises');
    expect(res.status).toBe(401);
  });
});
