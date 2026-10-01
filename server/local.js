import 'dotenv/config';
import { createLocalServer } from './http.js';
const server = createLocalServer();
const port = Number(process.env.PORT || 5173);
server.listen(port, '127.0.0.1', () => console.log(`Genius Kids Lab: http://localhost:${port}`));
