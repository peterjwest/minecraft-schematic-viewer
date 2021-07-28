import * as THREE from 'three';

function withinBounds(position: THREE.Vector3, dimensions: THREE.Vector3) {
  if (position.x < 0 || position.x >= dimensions.x) {
    return false;
  }
  if (position.y < 0 || position.y >= dimensions.y) {
    return false;
  }
  if (position.z < 0 || position.z >= dimensions.z) {
    return false;
  }
  return true;
}

function getIndex(position: THREE.Vector3, dimensions: THREE.Vector3) {
  return position.x + (position.y + position.z * dimensions.y) * dimensions.x;
}

export default class DimensionMappedArray {
  array: Uint8Array | Uint16Array | Uint32Array;
  dimensions: THREE.Vector3;

  constructor(
    type: Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor,
    dimensions: THREE.Vector3,
  ) {
    this.array = new type(dimensions.x * dimensions.y * dimensions.z);
    this.dimensions = dimensions;
  }

  set(position: THREE.Vector3, value: number) {
    if (!withinBounds(position, this.dimensions)) {
      throw new Error('Position out of bounds');
    }
    this.array[getIndex(position, this.dimensions)] = value;
  }

  get(position: THREE.Vector3) {
    if (!withinBounds(position, this.dimensions)) {
      return undefined;
    }
    return this.array[getIndex(position, this.dimensions)];
  }
}
