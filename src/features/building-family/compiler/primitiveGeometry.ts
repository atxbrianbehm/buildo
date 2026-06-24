export type Vec3 = [number, number, number];

export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}

export interface PrimitiveGeometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  bounds: Bounds3;
}

export interface BoxPrimitiveInput {
  center: Vec3;
  size: Vec3;
}

export interface MeshBatchGeometry {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  uvs: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  bounds: Bounds3;
}

export function emptyBounds(): Bounds3 {
  return {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  };
}

export function expandBounds(bounds: Bounds3, next: Bounds3): Bounds3 {
  return {
    min: [
      Math.min(bounds.min[0], next.min[0]),
      Math.min(bounds.min[1], next.min[1]),
      Math.min(bounds.min[2], next.min[2])
    ],
    max: [
      Math.max(bounds.max[0], next.max[0]),
      Math.max(bounds.max[1], next.max[1]),
      Math.max(bounds.max[2], next.max[2])
    ]
  };
}

export function boundsFromBox(center: Vec3, size: Vec3): Bounds3 {
  return {
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]
  };
}

export function translationMatrix(position: Vec3): number[] {
  return [
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    position[0],
    position[1],
    position[2],
    1
  ];
}

export function buildBoxPrimitive(input: BoxPrimitiveInput): PrimitiveGeometry {
  const [cx, cy, cz] = input.center;
  const [sx, sy, sz] = input.size;
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;

  const faces = [
    {
      normal: [0, 0, 1],
      corners: [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1]
      ]
    },
    {
      normal: [0, 0, -1],
      corners: [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0]
      ]
    },
    {
      normal: [1, 0, 0],
      corners: [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1]
      ]
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0]
      ]
    },
    {
      normal: [0, 1, 0],
      corners: [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0]
      ]
    },
    {
      normal: [0, -1, 0],
      corners: [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1]
      ]
    }
  ] as const;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const face of faces) {
    const vertexOffset = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    bounds: boundsFromBox(input.center, input.size)
  };
}

export function combinePrimitiveGeometry(primitives: PrimitiveGeometry[]): MeshBatchGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let bounds = emptyBounds();

  for (const primitive of primitives) {
    const vertexOffset = positions.length / 3;
    positions.push(...primitive.positions);
    normals.push(...primitive.normals);
    uvs.push(...primitive.uvs);
    indices.push(...primitive.indices.map((index) => index + vertexOffset));
    bounds = expandBounds(bounds, primitive.bounds);
  }

  return {
    positions: new Float32Array(positions) as Float32Array<ArrayBuffer>,
    normals: new Float32Array(normals) as Float32Array<ArrayBuffer>,
    uvs: new Float32Array(uvs) as Float32Array<ArrayBuffer>,
    indices: new Uint32Array(indices) as Uint32Array<ArrayBuffer>,
    bounds
  };
}
