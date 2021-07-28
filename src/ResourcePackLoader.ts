import { keyBy, Dictionary } from 'lodash';
import * as zip from '@zip.js/zip.js';
import * as runtypes from 'runtypes';

import { loadRawFile } from './util';

type ResourceType = 'block' | 'blockModel' | 'blockTexture';

const BlockVariant = runtypes.Record({
  model: runtypes.String,
  x: runtypes.Optional(runtypes.Number),
  y: runtypes.Optional(runtypes.Number),
});

export type BlockVariant = runtypes.Static<typeof BlockVariant>;

const PartCondition = runtypes.Optional(runtypes.Union(
  runtypes.Dictionary(runtypes.String, runtypes.String),
  runtypes.Record({ OR: runtypes.Array(runtypes.Dictionary(runtypes.String, runtypes.String)) }),
));

export type PartCondition = runtypes.Static<typeof PartCondition>;


const BlockStateData = runtypes.Union(
  runtypes.Record({
    variants: runtypes.Dictionary(runtypes.Union(
      BlockVariant,
      runtypes.Array(BlockVariant),
    ), runtypes.String),
  }),
  runtypes.Record({
    multipart: runtypes.Array(
      runtypes.Record({
        when: PartCondition,
        apply: runtypes.Union(
          BlockVariant,
          runtypes.Array(BlockVariant),
        ),
      }),
    ),
  }),
);

export type BlockStateData = runtypes.Static<typeof BlockStateData>;

const BlockModelData = runtypes.Record({
  parent: runtypes.Optional(runtypes.String),
  textures: runtypes.Optional(runtypes.Dictionary(runtypes.String, runtypes.String)),
  elements: runtypes.Optional(runtypes.Array(
    runtypes.Record({
      from: runtypes.Tuple(runtypes.Number, runtypes.Number, runtypes.Number),
      to: runtypes.Tuple(runtypes.Number, runtypes.Number, runtypes.Number),
      faces: runtypes.Dictionary(
        runtypes.Record({
          texture: runtypes.String,
          uv: runtypes.Optional(runtypes.Tuple(runtypes.Number, runtypes.Number, runtypes.Number, runtypes.Number)),
          rotation: runtypes.Optional(runtypes.Number),
        }),
        runtypes.String,
      ),
      rotation: runtypes.Optional(runtypes.Record({
        origin: runtypes.Tuple(runtypes.Number, runtypes.Number, runtypes.Number),
        axis: runtypes.Union(runtypes.Literal('x'), runtypes.Literal('y'), runtypes.Literal('z')),
        angle: runtypes.Number,
        rescale: runtypes.Optional(runtypes.Boolean),
      })),
    }),
  )),
});

export type BlockModelData = runtypes.Static<typeof BlockModelData> & { parents: string[] };

const resourceTypes: {[key in ResourceType]: { path: string, extension: string }} = {
  block: { path: 'blockstates', extension: 'json' },
  blockModel: { path: 'models', extension: 'json' },
  blockTexture: { path: 'textures', extension: 'png' },
};

function getUrl(fullname: string, type: ResourceType) {
  // TODO: Don't fix namespace here, throw exception
  const [namespace, name] = fullname.match(/:/) ? fullname.split(/:/) : ['minecraft', fullname];
  return `${namespace}/${resourceTypes[type].path}/${name}.${resourceTypes[type].extension}`;
}

export default class ResourcePackLoader {
  entries: Dictionary<zip.Entry> = {};
  reader: zip.ZipReader;

  blockPromises: Dictionary<Promise<string>> = {};
  blockModelPromises: Dictionary<Promise<string>> = {};
  blockTexturePromises: Dictionary<Promise<Blob>> = {};

  blockData: Dictionary<BlockStateData> = {};
  blockModelData: Dictionary<BlockModelData> = {};
  blockTextureData: Dictionary<Blob> = {};

  async load(url: string) {
    const data = await loadRawFile(url);

    this.reader = new zip.ZipReader(new zip.BlobReader(data));
    this.entries = keyBy(await this.reader.getEntries(), 'filename');
  }

  async unload() {
    await this.reader.close();
  }

  async getBlock(name: string) {
    if (this.blockData[name]) {
      return this.blockData[name];
    }

    const entry = this.entries[getUrl(name, 'block')];

    if (!entry || !entry.getData) {
      throw new Error(`Could not find block data for "${name}" in file ${getUrl(name, 'block')}`);
    }

    const promise = this.blockPromises[name] || entry.getData(new zip.TextWriter());
    this.blockPromises[name] = promise;
    const data = BlockStateData.check(JSON.parse(await promise));
    this.blockData[name] = data;
    return data;
  }

  async getBlockModel(name: string) {
    if (this.blockModelData[name]) {
      return this.blockModelData[name];
    }

    const entry = this.entries[getUrl(name, 'blockModel')];

    if (!entry || !entry.getData) {
      throw new Error(`Could not find block model data for "${name}"`);
    }

    const promise = this.blockModelPromises[name] || entry.getData(new zip.TextWriter());
    this.blockModelPromises[name] = promise;
    const data = BlockModelData.check(JSON.parse(await promise));
    const mappedData: BlockModelData = { ...data, parents: data.parent ? [data.parent] : [] };
    this.blockModelData[name] = mappedData;
    return mappedData;
  }

  async getBlockTexture(name: string): Promise<Blob> {
    if (this.blockTextureData[name]) {
      return this.blockTextureData[name];
    }

    const entry = this.entries[getUrl(name, 'blockTexture')];

    if (!entry || !entry.getData) {
      throw new Error(`Could not load texture ${name}`);
    }

    const promise = this.blockTexturePromises[name] || entry.getData(new zip.BlobWriter());
    this.blockTexturePromises[name] = promise;
    const blob = await promise;
    this.blockTextureData[name] = blob;
    return blob;
  }
}
