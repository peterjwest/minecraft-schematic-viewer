import { Vector3, BufferGeometry, Float32BufferAttribute } from 'three';

type Axis = 'x' | 'y' | 'z';

export default class CustomBoxGeometry extends BufferGeometry {
  parameters: {
    width: number;
    height: number;
    depth: number;
  };

  constructor(width = 1, height = 1, depth = 1, hasFace: boolean[]) {
    super();

    this.type = 'BoxGeometry';

    this.parameters = {
      width: width,
      height: height,
      depth: depth,
    };

    const indices: number[] = [];
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    let numberOfVertices = 0;
    let groupStart = 0;

    const buildPlane = (
      u: Axis, v: Axis, w: Axis,
      udir: number, vdir: number,
      width: number, height: number, depth: number,
      materialIndex: number,
    ) => {
      const widthHalf = width / 2;
      const heightHalf = height / 2;
      const depthHalf = depth / 2;

      let vertexCounter = 0;
      let groupCount = 0;

      const vector = new Vector3();

      for (let iy = 0; iy < 2; iy++) {
        const y = iy * height - heightHalf;

        for (let ix = 0; ix < 2; ix++) {
          const x = ix * width - widthHalf;

          vector[u] = x * udir;
          vector[v] = y * vdir;
          vector[w] = depthHalf;

          vertices.push(vector.x, vector.y, vector.z);

          vector[u] = 0;
          vector[v] = 0;
          vector[w] = depth > 0 ? 1 : - 1;

          normals.push(vector.x, vector.y, vector.z);

          uvs.push(ix);
          uvs.push(1 - iy);

          vertexCounter += 1;
        }
      }

      for (let iy = 0; iy < 1; iy++) {
        for (let ix = 0; ix < 1; ix++) {
          const a = numberOfVertices + ix + iy * 2;
          const b = numberOfVertices + ix + (iy + 1) * 2;
          const c = numberOfVertices + (ix + 1) + (iy + 1) * 2;
          const d = numberOfVertices + (ix + 1) + iy * 2;

          indices.push(a, b, d);
          indices.push(b, c, d);

          groupCount += 6;
        }
      }

      this.addGroup(groupStart, groupCount, materialIndex);

      groupStart += groupCount;

      numberOfVertices += vertexCounter;
    };

    if (hasFace[0]) {
      buildPlane('z', 'y', 'x', - 1, - 1, depth, height, width, 0); // px
    }
    if (hasFace[1]) {
      buildPlane('z', 'y', 'x', 1, - 1, depth, height, - width, 1); // nx
    }
    if (hasFace[2]) {
      buildPlane('x', 'z', 'y', 1, 1, width, depth, height, 2); // py
    }
    if (hasFace[3]) {
      buildPlane('x', 'z', 'y', 1, - 1, width, depth, - height, 3); // ny
    }
    if (hasFace[4]) {
      buildPlane('x', 'y', 'z', 1, - 1, width, height, depth, 4); // pz
    }
    if (hasFace[5]) {
      buildPlane('x', 'y', 'z', - 1, - 1, width, height, - depth, 5); // nz
    }

    this.setIndex(indices);
    this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    this.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    this.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  }
}
