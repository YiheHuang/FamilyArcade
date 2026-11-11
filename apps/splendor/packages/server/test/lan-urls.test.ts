import { describe, expect, it } from 'vitest';
import { ipScore } from '../src/server.js';

describe('局域网地址排序（家人能用优先）', () => {
  it('家用网段优先：192.168 < 10.x < 172.16-31', () => {
    const ethernet = '以太网';
    expect(ipScore('192.168.1.20', ethernet)).toBeLessThan(ipScore('10.0.0.5', ethernet));
    expect(ipScore('10.0.0.5', ethernet)).toBeLessThan(ipScore('172.20.1.2', ethernet));
    expect(ipScore('172.20.1.2', ethernet)).toBeLessThan(ipScore('203.0.113.7', ethernet));
  });

  it('虚拟网卡（vEthernet/WSL/Docker 等）降权到真实网卡之后', () => {
    expect(ipScore('172.17.96.1', 'vEthernet (Default Switch)')).toBeGreaterThan(ipScore('10.230.132.222', 'WLAN'));
    expect(ipScore('192.168.1.9', 'VirtualBox Host-Only Network')).toBeGreaterThan(ipScore('192.168.1.9', 'WLAN'));
    expect(ipScore('100.78.231.201', 'Tailscale')).toBeGreaterThan(ipScore('192.168.1.9', 'WLAN'));
  });
});
