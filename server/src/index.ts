import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes.ts';
import './db.ts';

// 启动时加载仓库根目录的 .env（LLM provider 配置；文件不入库）
const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api', api);

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'JuanerAI Prism server' }));

const port = Number(process.env.PRISM_PORT ?? 8787);
// 内部工作台：只绑定本机回环，避免未鉴权的 mutating 接口暴露到局域网
app.listen(port, '127.0.0.1', () => {
  console.log(`Prism server listening on http://127.0.0.1:${port}`);
});
