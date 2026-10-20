import 'dotenv/config';
import { createApp } from './app';
import { store } from './store';

// Some hosts inject PORT=0 ("pick any free port"). NetGuard needs a stable,
// predictable port for the Vite proxy, so only accept a positive number.
const envPort = Number(process.env.PORT);
const PORT = Number.isInteger(envPort) && envPort > 0 ? envPort : 4000;

const app = createApp(store);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[netguard] API ready on http://localhost:${PORT}`);
  console.log(`[netguard] Topology: ${store.graph.deviceCount} devices loaded.`);
});
