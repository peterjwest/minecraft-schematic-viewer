import { parse } from 'prismarine-nbt';
import { mapValues, toPairs, Dictionary } from 'lodash';
import * as runtypes from 'runtypes';
import * as THREE from 'three';

import { bitsToInteger } from './util';

const Vector = runtypes.Record({
  value: runtypes.Record({
    x: runtypes.Record({
      value: runtypes.Number,
    }),
    y: runtypes.Record({
      value: runtypes.Number,
    }),
    z: runtypes.Record({
      value: runtypes.Number,
    }),
  }),
});

const SchematicBlock = runtypes.Record({
  Name: runtypes.Record({
    value: runtypes.String,
  }),
  Properties: runtypes.Optional(runtypes.Record({
    value: runtypes.Dictionary(runtypes.Record({
      value: runtypes.String,
    }), runtypes.String),
  })),
});

const SchematicRegion = runtypes.Record({
  value: runtypes.Record({
    BlockStates: runtypes.Record({
      value: runtypes.Array(runtypes.Array(runtypes.Number)),
    }),
    BlockStatePalette: runtypes.Record({
      value: runtypes.Record({
        value: runtypes.Array(SchematicBlock),
      }),
    }),
    Size: Vector,
    Position: Vector,
  }),
});

const SchematicData = runtypes.Record({
  value: runtypes.Record({
    Regions: runtypes.Record({
      value: runtypes.Dictionary(SchematicRegion, runtypes.String),
    }),
    Metadata: runtypes.Record({
      value: runtypes.Record({
        EnclosingSize: Vector,
      }),
    }),
  }),
});

export interface Schematic {
  dimensions: THREE.Vector3;
  blocks: Dictionary<Block[]>;
  palette: Dictionary<BlockState>;
}

export interface BlockState {
  name: string;
  properties: Dictionary<string>;
}

export interface Block {
  position: THREE.Vector3;
  paletteKey: string;
}

/** Get a deterministic string from a dictionary of properties */
export function propertyString(properties: Dictionary<string>, filterProperties?: Set<string>) {
  return (
    toPairs(properties)
    .filter(([name]) => !filterProperties || filterProperties.has(name))
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join(',')
  );
}

export function variantString(name: string, properties: Dictionary<string>) {
  return `${name}/${propertyString(properties)}`;
}

export default async function loadSchematic(buffer: Buffer): Promise<Schematic> {
  const data = SchematicData.check((await parse(buffer)).parsed);
  const regions = data.value.Regions.value;

  const palette: Dictionary<BlockState> = {};

  const blocks = mapValues(regions, (region) => {
    const values = region.value.BlockStates.value.reverse();

    const regionPalette = region.value.BlockStatePalette.value.value.map((entry) => {
      return {
        name: entry.Name.value,
        properties: entry.Properties ? mapValues(entry.Properties.value, (item) => item.value) : {},
      };
    });

    regionPalette.forEach((entry) => {
      palette[variantString(entry.name, entry.properties)] = entry;
    });

    const paletteBits = Math.max(Math.ceil(Math.log2(regionPalette.length)), 2);

    const dimensions = new THREE.Vector3(
      Math.abs(region.value.Size.value.x.value),
      Math.abs(region.value.Size.value.y.value),
      Math.abs(region.value.Size.value.z.value),
    );

    const bits = new Uint8Array(values.length * 64);
    let bitIndex = 0;
    for (const pair of values) {
      for (let pairIndex = 0; pairIndex < 2; pairIndex++) {
        for (let offset = 31; offset >= 0; offset--) {
          bits[bitIndex++] = pair[pairIndex] >> offset & 1;
        }
      }
    }

    const blockCount = dimensions.x * dimensions.y * dimensions.z;
    const offset = bits.length - paletteBits * blockCount;
    const blockIndexes = [];
    for (let bitIndex = offset; bitIndex < bits.length; bitIndex += paletteBits) {
      blockIndexes.push(bitsToInteger(bits.slice(bitIndex, bitIndex + paletteBits)));
    }

    const blocks = blockIndexes.map((blockIndex, index) => {
      const x = index % dimensions.x;
      const z = Math.floor(index / dimensions.x) % dimensions.z;
      const y = Math.floor(index / dimensions.x / dimensions.z) % dimensions.y;
      const data = regionPalette[blockIndex];

      return {
        position: new THREE.Vector3(x, y, z),
        paletteKey: variantString(data.name, data.properties),
      };
    });

    return blocks;
  });

  const size = data.value.Metadata.value.EnclosingSize.value;
  const dimensions = new THREE.Vector3(size.x.value, size.y.value, size.z.value);

  return { dimensions, blocks, palette };
}
