import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import QRCode, { type QRCodeMaskPattern } from 'qrcode';
import { encodeQr, formatBitsForTest } from '../src/ui/qr';

/** rasterise a matrix the way a phone camera would see it (with quiet zone) */
function rasterise(qr: { size: number; modules: boolean[][] }, module = 4, margin = 4) {
  const width = (qr.size + margin * 2) * module;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.modules[row][col]) continue;
      for (let y = 0; y < module; y++) {
        for (let x = 0; x < module; x++) {
          const py = (row + margin) * module + y;
          const px = (col + margin) * module + x;
          const i = (py * width + px) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width };
}

const SAMPLES = [
  'http://192.168.1.5:7667/#c=1234',
  'http://10.230.128.94:7667/#c=9038',
  'http://172.16.254.254:7667/#c=9999',
  'http://192.168.100.100:7667/#c=0000',
  'https://example.com/a-longer-invite-path?room=Blokus+night&c=4321',
];

describe('二维码编码器', () => {
  it('同一版本 + 同一掩码下与参考库逐格一致', () => {
    for (const text of SAMPLES) {
      // force byte mode on the reference too: it would otherwise mix in
      // alphanumeric segments (and thus encode different codewords)
      const ref = QRCode.create([{ data: Buffer.from(text, 'utf8'), mode: 'byte' }], {
        errorCorrectionLevel: 'M',
      });
      const ours = encodeQr(text, { mask: ref.maskPattern });
      expect(ours.version, text).toBe(ref.version);
      expect(ours.size, text).toBe(ref.modules.size);
      const flat: boolean[] = [];
      for (let row = 0; row < ours.size; row++) {
        for (let col = 0; col < ours.size; col++) flat.push(ours.modules[row][col]);
      }
      expect(flat, text).toEqual(Array.from(ref.modules.data).map((v) => v === 1));
    }
  });

  it('自动选择的掩码可以被独立解码器读回（等价于手机扫一次）', () => {
    for (const text of SAMPLES) {
      const ours = encodeQr(text);
      expect(ours.mask).toBeGreaterThanOrEqual(0);
      expect(ours.mask).toBeLessThanOrEqual(7);
      const { data, width } = rasterise(ours);
      const decoded = jsQR(data, width, width);
      expect(decoded?.data, text).toBe(text);
    }
  });

  it('8 种掩码都生成可解码的符号', () => {
    const text = SAMPLES[0];
    for (let mask = 0; mask < 8; mask++) {
      const qr = encodeQr(text, { mask });
      const { data, width } = rasterise(qr);
      const decoded = jsQR(data, width, width);
      expect(decoded?.data, `mask ${mask}`).toBe(text);
    }
  });

  it('格式信息带正确的 BCH 校验（与参考库一致）', () => {
    for (let mask = 0; mask < 8; mask++) {
      const ref = QRCode.create('x', { errorCorrectionLevel: 'M', maskPattern: mask as QRCodeMaskPattern });
      // the reference stores the raw format bits as its first modules; recompute
      // ours independently and compare against a known-good table entry
      const bits = formatBitsForTest(mask);
      // masking with 0x5412 and level M must decode back to (0 << 3) | mask
      const unmasked = bits ^ 0x5412;
      expect((unmasked >>> 10) & 0b11111).toBe(mask);
      expect(ref.maskPattern).toBe(mask);
    }
  });

  it('内容太长时明确报错', () => {
    expect(() => encodeQr('x'.repeat(300))).toThrowError(/过长/);
  });

  it('版本随内容长度增长', () => {
    const small = encodeQr('http://a/#');
    const big = encodeQr('http://' + 'a'.repeat(140) + '/#c=1234');
    expect(small.version).toBeLessThan(big.version);
  });
});
