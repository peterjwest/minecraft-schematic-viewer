import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils';
import { flatten, Dictionary } from 'lodash';

import { toRadians, hasTransparency, asyncMapValues, integerToBits, bitsToInteger } from './util';
import CustomBoxGeometry from './CustomBoxGeometry';
import ResourcePackLoader, { BlockStateData, BlockModelData, BlockVariant, PartCondition } from './ResourcePackLoader';
import DimensionMappedArray from './DimensionMappedArray';
import { propertyString, BlockState } from './loadSchematic';
import { SOLID_BLOCKS, TRANSPARENT_BLOCKS } from './constants';

const greenTintedTextures = new Set([
  'minecraft:block/acacia_leaves',
  'minecraft:block/attached_melon_stem',
  'minecraft:block/attached_pumpkin_stem',
  'minecraft:block/birch_leaves',
  'minecraft:block/dark_oak_leaves',
  'minecraft:block/fern',
  'minecraft:block/grass_block_side_overlay',
  'minecraft:block/grass_block_top',
  'minecraft:block/grass',
  'minecraft:block/jungle_leaves',
  'minecraft:block/large_fern_bottom',
  'minecraft:block/large_fern_top',
  'minecraft:block/lily_pad',
  'minecraft:block/melon_stem',
  'minecraft:block/oak_leaves',
  'minecraft:block/pumpkin_stem',
  'minecraft:block/spruce_leaves',
  'minecraft:block/tall_grass_bottom',
  'minecraft:block/tall_grass_top',
  'minecraft:block/vine',
]);

const occludedCubeGeometries: Dictionary<CustomBoxGeometry> = {};
const geometryCombinations = Math.pow(2, 6);
for (let i = 0; i < geometryCombinations; i++) {
  occludedCubeGeometries[i] = new CustomBoxGeometry(1, 1, 1, integerToBits(i, 6).map((bit) => !bit));
}

enum Axis {
  X = 0,
  Y = 1,
  Z = 2,
}

const colours = {
  white: 0xFFFFFF,
  green: 0x91BD59,
  red: 0xFE0000,
};

export interface TextureData {
  bitmap: ImageBitmap;
  transparent: boolean;
  greenTinted: boolean;
  rotation?: number;
}

const axisVectors = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const halfBlock = new THREE.Vector3(0.5, 0.5, 0.5);

function getPlaneCoords(
  axis: Axis,
  position: { to: [number, number, number], from: [number, number, number] },
): { to: [number, number], from: [number, number] } {
  if (axis === Axis.Y) {
    return { to: [position.to[0], position.to[2]], from: [position.from[0], position.from[2]] };
  }
  if (axis === Axis.Z) {
    return { to: [position.to[0], 16 - position.from[1]], from: [position.from[0], 16 - position.to[1]] };
  }
  return { to: [position.to[2], 16 - position.from[1]], from: [position.from[2], 16 - position.to[1]] };
}

function getTexture(
  face: { texture: string, uv?: [number, number, number, number], rotation?: number },
  coords: { from: [number, number], to: [number, number] },
  textures: Dictionary<TextureData>,
) {
  const textureName = face.texture.slice(1);
  const textureData = textures[textureName];

  if (!textureData) {
    throw new Error(`Texture missing ${textureName}`);
  }

  const texture = new THREE.Texture();
  texture.image = textureData.bitmap;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  const uv = face.uv || [...coords.from, ...coords.to];

  texture.offset.set(uv[0] / 16, uv[3] / 16);
  texture.repeat.set(
    (uv[2] - uv[0]) / 16,
    -(uv[3] - uv[1]) / 16,
  );

  if (face.rotation) {
    texture.rotation = -toRadians(face.rotation);

    if (face.rotation === 90) {
      texture.offset.set(uv[2] / 16, uv[3] / 16);
    }

    if (face.rotation === 270) {
      texture.offset.set(uv[0] / 16, uv[1] / 16);
    }

    if (face.rotation === 180) {
      texture.offset.set(uv[2] / 16, uv[1] / 16);
    }
  }

  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.needsUpdate = true;

  return new THREE.MeshLambertMaterial({
    map: texture,
    transparent: textureData.transparent,
    depthWrite: !textureData.transparent,
    color: textureData.greenTinted ? colours.green : colours.white,
  });
}

function conditionMatches(conditionProperty: string, property: string | undefined) {
  return property && conditionProperty.split('|').includes(property);
}

function partMatches(condition: PartCondition | undefined, blockState: BlockState) {
  if (!condition) return true;

  if ('OR' in condition) {
    if (Array.isArray(condition.OR)) {
      for (const subCondition of condition.OR) {
        if (partMatches(subCondition, blockState)) {
          return true;
        }
      }
    }
    return false;
  }

  for (const property in condition) {
    if (!conditionMatches(condition[property], blockState.properties[property])) {
      return false;
    }
  }

  return true;
}

function getBlockParts(blockStateData: BlockStateData, blockState: BlockState) {
  if ('variants' in blockStateData) {
    const filterProperties = new Set(flatten(
      Object.keys(blockStateData.variants).map((variant) => variant.match(/[^,]+(?==)/g) || []),
    ));

    const variant = propertyString(blockState.properties, filterProperties);
    const variantData = blockStateData.variants[variant];
    return [Array.isArray(variantData) ? variantData[0] : variantData];
  }

  const parts = blockStateData.multipart.filter((part) => partMatches(part.when, blockState));
  return flatten(parts.map((part) => Array.isArray(part.apply) ? part.apply : [part.apply]));
}


function dereferenceTexture(reference: string, textureNames: Dictionary<string>) {
  let textureName = reference;
  while (textureName[0] === '#') {
    textureName = textureName[0] === '#' ? textureNames[textureName.slice(1)] : textureName;
  }
  return textureName;
}

function normaliseName(name: string, namespace: string) {
  return name.match(/:/) ? name : `${namespace}:${name}`;
}

export default class BlockLoader {
  resourceLoader: ResourcePackLoader;
  blockModelData: Dictionary<BlockModelData> = {};
  blockModels: Dictionary<THREE.Object3D> = {};
  textures: Dictionary<TextureData> = {};

  constructor(resourceLoader: ResourcePackLoader) {
    this.resourceLoader = resourceLoader;
  }

  async getBlockModelData(name: string): Promise<BlockModelData> {
    if (this.blockModelData[name]) {
      return this.blockModelData[name];
    }

    let data = await this.resourceLoader.getBlockModel(name);
    data.parents = [];

    while (data.parent) {
      const parentData = await this.resourceLoader.getBlockModel(data.parent);
      data = {
        ...parentData,
        ...data,
        parent: parentData.parent,
        parents: [...data.parents, data.parent],
        textures: { ...parentData.textures, ...data.textures },
      };
    }
    this.blockModelData[name] = data;
    return data;
  }

  async getBlockParts(blockState: BlockState): Promise<BlockVariant[]> {
    return getBlockParts(await this.resourceLoader.getBlock(blockState.name), blockState);
  }

  async getBlock(
    position: THREE.Vector3,
    blockState: BlockState,
    solidBlocks: DimensionMappedArray,
    transparentBlocks: Dictionary<DimensionMappedArray>,
  ): Promise<THREE.Object3D> {
    const parts = await this.getBlockParts(blockState);

    const blockModel = new THREE.Object3D();
    for (const part of parts) {
      const modelData = await this.getBlockModelData(part.model);

      const blockPart = await this.getBlockModel(part.model, modelData) as THREE.Mesh;
      blockPart.rotateOnAxis(axisVectors.y, Math.PI - toRadians(part.y || 0));
      blockPart.rotateOnAxis(axisVectors.x, -toRadians(part.x || 0));

      // TODO: Make better
      const faces = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
      ];

      faces.forEach((face) => {
        face.applyQuaternion(blockPart.quaternion);
        face.round();
        face.y = -face.y;
      });

      if (SOLID_BLOCKS.has(blockState.name)) {
        const adjacents = faces.map((face) => solidBlocks.get(face.add(position)) || 0);
        blockPart.geometry = occludedCubeGeometries[bitsToInteger(adjacents)];
      }
      if (TRANSPARENT_BLOCKS.has(blockState.name)) {
        const adjacents = faces.map((face) => transparentBlocks[blockState.name].get(face.add(position)) || 0);
        blockPart.geometry = occludedCubeGeometries[bitsToInteger(adjacents)];
      }

      blockModel.add(blockPart);
    }

    // TODO: Make this less bad
    if (blockState.name === 'minecraft:redstone_wire') {
      const power = parseInt(blockState.properties.power, 10);
      const red = (power * 10 + (power > 0 ? 30 : 0) + 60) / 256;
      for (const mesh of blockModel.children as THREE.Mesh[]) {
        mesh.material = (mesh.material as THREE.MeshLambertMaterial[]).map((material) => {
          if (material) {
            const newMaterial = material.clone() as THREE.MeshLambertMaterial;
            newMaterial.color.setRGB(red, 0, 0);
            return newMaterial;
          }
          return undefined;
        }) as THREE.MeshLambertMaterial[];
      }
    }

    blockModel.position.set(position.x, -position.y, position.z);

    return blockModel;
  }

  async getBlockTextures(modelData: BlockModelData): Promise<Dictionary<TextureData>> {
    const textureNames = modelData.textures || {};
    return asyncMapValues(textureNames, async (reference: string) => {
      const textureName = normaliseName(dereferenceTexture(reference, textureNames), 'minecraft');

      if (this.textures[textureName]) {
        return this.textures[textureName];
      }

      const blob = await this.resourceLoader.getBlockTexture(textureName);

      // Get the full bitmap to get dimensions and crop animation frames
      const bitmap = await createImageBitmap(blob);
      const size = Math.min(bitmap.width, bitmap.height);

      const textureData: TextureData = {
        bitmap: await createImageBitmap(blob, 0, 0, size, size),
        transparent: await hasTransparency(blob),
        greenTinted: greenTintedTextures.has(textureName),
      };
      this.textures[textureName] = textureData;
      return textureData;
    });
  }

  async getBlockModel(name: string, modelData: BlockModelData): Promise<THREE.Object3D> {
    if (this.blockModels[name]) {
      return this.blockModels[name].clone();
    }

    const textures = await this.getBlockTextures(modelData);

    const meshes: THREE.Mesh[] = [];

    if (!modelData.elements) {
      throw new Error(`No geometry for block "${name}"`);
    }

    for (const element of modelData.elements) {
      const faces = [
        { data: element.faces.east, axis: Axis.X },
        { data: element.faces.west, axis: Axis.X },
        { data: element.faces.up, axis: Axis.Y },
        { data: element.faces.down, axis: Axis.Y },
        { data: element.faces.south, axis: Axis.Z },
        { data: element.faces.north, axis: Axis.Z },
      ];

      // This is a hack to ensure the scale of a box is never zero, which breaks lighting
      if (element.from[0] === element.to[0]) {
        element.to[0] += 0.01;
      }
      if (element.from[1] === element.to[1]) {
        element.to[1] += 0.01;
      }
      if (element.from[2] === element.to[2]) {
        element.to[2] += 0.01;
      }

      const hasMaterial = faces.map((face) => Boolean(face.data));
      const box = new CustomBoxGeometry(1, 1, 1, hasMaterial);

      const materials = (
        faces.map((face) => face.data ? getTexture(face.data, getPlaneCoords(face.axis, element), textures) : undefined)
      );

      const mesh = new THREE.Mesh(box, materials as THREE.MeshLambertMaterial[]);

      mesh.scale.set(
        (element.to[0] - element.from[0]) / 16,
        (element.to[1] - element.from[1]) / 16,
        (element.to[2] - element.from[2]) / 16,
      );
      mesh.position.set(
        element.from[0] / 16 + mesh.scale.x / 2,
        element.from[1] / 16 + mesh.scale.y / 2,
        element.from[2] / 16 + mesh.scale.z / 2,
      );

      if (element.rotation) {
        const angle = toRadians(element.rotation.angle);
        const axis = element.rotation.axis as ('x' | 'y' | 'z');
        const axisVector = axisVectors[axis];
        const translation = (
          mesh.position.clone()
          .sub(new THREE.Vector3(...element.rotation.origin).multiplyScalar(1 / 16))
        );
        mesh.position.sub(translation);
        translation.applyAxisAngle(axisVector, angle);
        mesh.rotateOnAxis(axisVector, angle);
        mesh.position.add(translation);

        if (element.rotation.rescale) {
          if (axis !== 'x') {
            mesh.scale.x = mesh.scale.x / Math.cos(angle);
          }
          if (axis !== 'y') {
            mesh.scale.y = mesh.scale.y / Math.cos(angle);
          }
          if (axis !== 'z') {
            mesh.scale.z = mesh.scale.z / Math.cos(angle);
          }
        }
      }

      // Move mesh so it's centered in the block
      mesh.position.sub(halfBlock);
      mesh.updateMatrix();

      meshes.push(mesh);
    }

    let startOffset = 0;
    let materialOffset = 0;

    let groups: Array<{ start: number, count: number, materialIndex: number }> = [];

    for (const mesh of meshes) {
      mesh.geometry.applyMatrix4(mesh.matrix);
      groups = groups.concat(mesh.geometry.groups.map((group) => {
        return {
          start: group.start + startOffset,
          count: group.count,
          materialIndex: (group.materialIndex || 0) + materialOffset,
        };
      }));
      startOffset += (mesh.geometry.index as THREE.BufferAttribute).count;
      materialOffset += (mesh.material as THREE.Material[]).length;
    }

    const geometry = BufferGeometryUtils.mergeBufferGeometries(
      meshes.map((mesh: THREE.Mesh) => mesh.geometry),
      true,
    );
    geometry.clearGroups();
    for (const group of groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    const materials = flatten(meshes.map((child: THREE.Mesh) => child.material));
    const block = new THREE.Mesh(geometry, materials);

    this.blockModels[name] = block;
    return block.clone();
  }
}
