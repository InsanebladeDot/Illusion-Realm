/**
 * Stealth PNG 数据流的按位读取器。
 *
 * 怎么做：一个自增游标 + `readBit` / `readBits`，供 `stealthExif` 还原像素里的数据。
 */
export class DataReader {
  private data: number[];
  private index = 0;

  constructor(data: number[]) {
    this.data = data;
  }

  readBit(): number {
    return this.data[this.index++];
  }

  readNBits(n: number): number[] {
    const bits: number[] = [];
    for (let i = 0; i < n; i++) {
      bits.push(this.readBit());
    }
    return bits;
  }

  readByte(): number {
    let byte = 0;
    for (let i = 0; i < 8; i++) {
      byte |= this.readBit() << (7 - i);
    }
    return byte;
  }

  readNBytes(n: number): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < n; i++) {
      bytes.push(this.readByte());
    }
    return bytes;
  }

  readInt32(): number {
    const bytes = this.readNBytes(4);
    return new DataView(new Uint8Array(bytes).buffer).getInt32(0, false);
  }
}
