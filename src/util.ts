import { Buffer } from 'buffer';
import { mean, Dictionary } from 'lodash';

/** Loads a file from a URL */
export function loadRawFile(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = reject;
    xhr.open('GET', url);
    xhr.send();
  });
}

/** Converts an angle from degrees to radians */
export function toRadians(angle: number) {
  return Math.PI * 2 * angle / 360;
}

/** Converts a blob to an image element */
export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  await new Promise((resolve) => image.onload = resolve);
  URL.revokeObjectURL(url);
  return image;
}

/** Checks if an image has transparency */
export async function hasTransparency(blob: Blob): Promise<boolean> {
  const image = await blobToImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context not supported');
  }
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] < 255) return true;
  }
  return false;
}

/** Maps the values of an array asynchronously (in parallel) */
// export async function asyncEach<Input, Output>(
//   data: Input[],
//   iterator: (value: Input) => Promise<Output>,
//   parallelism = 8,
// ): Promise<void> {
//   async function wrapper() {
//     await iterator(data[index]);
//     index++;
//     if (index < data.length) {
//       await wrapper();
//     }
//   }

//   const promises: Array<Promise<void>> = [];
//   let index = 0;
//   while (index < parallelism) {
//     promises.push(wrapper());
//     index++;
//   }
//   await Promise.all(promises);
// }

/** Maps the values of an object asynchronously (in parallel) */
// export async function asyncMapValues<Input, Output>(
//   data: Dictionary<Input>,
//   iterator: (value: Input, key: string) => Promise<Output>,
// ) {
//   const result: Dictionary<Output> = {};
//   const promises: Array<Promise<void>> = [];
//   for (const key in data) {
//     if (data.hasOwnProperty(key)) {
//       const wrapper = async() => {
//         result[key] = await iterator(data[key], key);
//       };
//       promises.push(wrapper());
//     }
//   }
//   await Promise.all(promises);
//   return result;
// }

/** Maps the values of an object asynchronously (in series) */
export async function asyncMapValues<Input, Output>(
  data: Dictionary<Input>,
  iterator: (value: Input, key: string) => Promise<Output>,
) {
  const result: Dictionary<Output> = {};
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      result[key] = await iterator(data[key], key);
    }
  }
  return result;
}

/** Converts an ArrayBuffer to a Buffer */
export function arrayBufferToBuffer(arrayBuffer: ArrayBuffer): Buffer {
  const buffer = Buffer.alloc(arrayBuffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = view[i];
  }
  return buffer;
}

/** Converts an Buffer to an ArrayBuffer  */
export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
}

/** Pick a random element from a list */
export function pickRandom<Type>(array: Type[]): Type {
  return array[Math.floor(Math.random() * array.length)];
}

const times: Dictionary<number[]> = {};

export async function time<Type>(label: string, promise: Promise<Type>) {
  const start = Date.now();
  const result = await promise;
  times[label] = times[label] || [];
  times[label].push(Date.now() - start);
  return result;
}

export function getTime(label: string) {
  return { count: times[label].length, mean: mean(times[label]) };
}

type IntArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array;

// Converts an array of integers to a string by character code
export function intArrayToString(array: IntArray) {
  let result = '';
  for (const value of array) {
    result += String.fromCharCode(value);
  }
  return result;
}

// Get bits of an integer, limited to a length in bits
export function integerToBits(value: number, length: number) {
  const output: number[] = [];
  for (let i = length - 1; i >= 0; i--) {
    output.push((value >>> i) & 1);
  }
  return output;
}

// Convert an array of bits to an integer
export function bitsToInteger(bits: number[] | Uint8Array | Uint16Array | Uint32Array) {
  let value = 0;
  for (let i = 0; i < bits.length; i++) {
    value += bits[i] << (bits.length - 1 - i);
  }
  return value;
}
