/* 单例 Data Client：真实后端 LiveClient。后端地址默认 http://127.0.0.1:18791，
   可在 localStorage 设 oqqq.baseUrl 覆盖。开发调试切回 mock 时换 MockClient。 */
import { LiveClient } from '../data/live/liveClient';

export const client = new LiveClient();
void (async () => { await client.connect(); })();
