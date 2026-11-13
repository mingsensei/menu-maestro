import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const server = createApp(config);
server.requestTimeout = 60000;
server.headersTimeout = 15000;
server.listen(config.port, '0.0.0.0', () => console.log(`Menu Maestro API listening on http://localhost:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
