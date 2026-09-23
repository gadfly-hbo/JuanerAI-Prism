// L0 发布包导出：把已批准的平台版本写成 exports/<内容ID>/<平台>/ 目录。
// 所有动态路径分量必须通过 safeJoin 边界校验，防路径穿越。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, run } from '../db.ts';
import { currentState } from './stateMachine.ts';

const EXPORTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'exports');

const safeJoin = (parent: string, child: string) => {
  const target = path.resolve(parent, child);
  if (target !== parent && !target.startsWith(parent + path.sep)) throw new Error(`非法路径分量（${JSON.stringify(child)}）`);
  return target;
};

/** 导出一个内容的发布包。要求人工已批准；每个已批准平台一个目录，返回导出清单。 */
export function exportPublishPackage(id: string): { platform: string; path: string; utm: string }[] {
  if (!/^CNT-\d{4}-\d{4}$/.test(id)) throw new Error('非法的内容 ID');
  const state = currentState(id);
  if (state !== 'HUMAN_APPROVED' && state !== 'SCHEDULED') throw new Error(`状态 ${state} 不能导出发布包（需先人工批准）`);
  const variants = all(`SELECT * FROM channel_variants WHERE content_id = ? AND approved = 1`, id);
  if (variants.length === 0) throw new Error('没有已批准的平台版本');

  const dir = safeJoin(EXPORTS_DIR, id);
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const v of variants) {
    if (!['wechat', 'zhihu', 'xiaohongshu', 'douyin'].includes(v.platform)) {
      throw new Error(`平台标识非法（${JSON.stringify(v.platform)}），拒绝导出`);
    }
    const pdir = safeJoin(dir, v.platform);
    mkdirSync(pdir, { recursive: true });
    const bodyTarget = safeJoin(pdir, 'body.md');
    const manifestTarget = safeJoin(pdir, 'manifest.json');
    writeFileSync(bodyTarget, `# ${v.title}\n\n${v.body}\n\n---\nCTA：${v.cta ?? ''}\n`);
    writeFileSync(manifestTarget, JSON.stringify({
      content_id: id, platform: v.platform, title: v.title, utm: v.utm,
      ai_label: true, exported_at: new Date().toISOString(),
    }, null, 2));
    run(`INSERT INTO publish_packages (content_id, platform, path, utm, status) VALUES (?, ?, ?, ?, 'exported')
         ON CONFLICT(content_id, platform) DO UPDATE SET path=excluded.path, utm=excluded.utm`,
      id, v.platform, pdir, v.utm);
    out.push({ platform: v.platform, path: pdir, utm: v.utm });
  }
  return out;
}
