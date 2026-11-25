/* On-device USDZ writer for the packed, triangle-only GLB produced by SlabRenderer. */
(() => {
  'use strict';

  const encoder = new TextEncoder();
  const identifier = name => name.replace(/[^a-zA-Z0-9_]/g, '_');
  const materialPath = material => '/Slab/Materials/' + identifier(material.name);
  const texturePath = image => 'textures/' + identifier(image.name) + '.png';
  const crcTable = Uint32Array.from({length: 256}, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value;
  });

  // USDZ is a stored ZIP. Each file's payload must begin on a 64-byte boundary.
  function packageFiles(entries) {
    const local = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const {name, data} of entries) {
      const filename = encoder.encode(name);
      let padding = (64 - (offset + 30 + filename.length) % 64) % 64;
      if (padding > 0 && padding < 4) padding += 64;
      let crc = 0xffffffff;
      for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 255];
      crc = (crc ^ 0xffffffff) >>> 0;

      const header = new Uint8Array(30 + filename.length + padding);
      const h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true);
      h.setUint16(26, filename.length, true);
      h.setUint16(28, padding, true);
      header.set(filename, 30);
      if (padding) {
        h.setUint16(30 + filename.length, 0x1986, true);
        h.setUint16(32 + filename.length, padding - 4, true);
      }
      const central = new Uint8Array(46 + filename.length);
      const c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true);
      c.setUint16(28, filename.length, true);
      c.setUint32(42, offset, true);
      central.set(filename, 46);
      local.push(header, data);
      directory.push(central);
      offset += header.length + data.length;
      directorySize += central.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    return new Blob([...local, ...directory, end.buffer], {type: 'model/vnd.usdz+zip'});
  }

  function materialText(doc, material) {
    const path = materialPath(material);
    const pbr = material.pbrMetallicRoughness;
    const texture = pbr.baseColorTexture && doc.textures[pbr.baseColorTexture.index];
    const isClear = !!material.extensions?.KHR_materials_transmission;
    const tint = material.extensions?.KHR_materials_volume?.attenuationColor;
    const color = isClear && tint ? tint.map(channel => Math.sqrt(channel)) : (pbr.baseColorFactor || [1, 1, 1]);
    const diffuse = texture ? `color3f inputs:diffuseColor.connect = <${path}/Image.outputs:rgb>`
      : `color3f inputs:diffuseColor = (${color.slice(0, 3).join(',')})`;
    // USD Preview Surface approximates transmission with opacity. Keep the face clear
    // and the bevel's reflected strip tight even in viewers without volume rendering.
    const optical = isClear ? `float inputs:opacity = ${(.055 + .70*pbr.roughnessFactor).toFixed(4)}
            float inputs:ior = ${material.extensions.KHR_materials_ior.ior}
            float inputs:clearcoat = 0.28
            float inputs:clearcoatRoughness = ${pbr.roughnessFactor}` : '';
    return `def Material "${identifier(material.name)}" {
        token outputs:surface.connect = <${path}/Surface.outputs:surface>
        def Shader "Surface" {
            uniform token info:id = "UsdPreviewSurface"
            ${diffuse}
            float inputs:roughness = ${pbr.roughnessFactor}
            float inputs:metallic = ${pbr.metallicFactor}
            ${optical}
            token outputs:surface
        }
        ${texture ? `def Shader "UV" {
            uniform token info:id = "UsdPrimvarReader_float2"
            string inputs:varname = "st"
            float2 outputs:result
        }
        def Shader "Image" {
            uniform token info:id = "UsdUVTexture"
            asset inputs:file = @${texturePath(doc.images[texture.source])}@
            token inputs:sourceColorSpace = "sRGB"
            token inputs:wrapS = "clamp"
            token inputs:wrapT = "clamp"
            float2 inputs:st.connect = <${path}/UV.outputs:result>
            float3 outputs:rgb
        }` : ''}
    }`;
  }

  const decimal = value => Math.round(value * 1e8) / 1e8;
  function meshText(name, primitive, accessor, material) {
    const positions = accessor(primitive.attributes.POSITION);
    const normals = accessor(primitive.attributes.NORMAL);
    const uv = primitive.attributes.TEXCOORD_0 === undefined ? null : accessor(primitive.attributes.TEXCOORD_0);
    const triangles = accessor(primitive.indices);

    // Both optical materials share a vertex buffer in the GLB. Include only the
    // vertices used by this primitive so the USD meshes stay compact.
    const remap = new Int32Array(positions.length / 3).fill(-1);
    const points = [], directions = [], coords = [];
    const indices = new Uint32Array(triangles.length);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < triangles.length; i++) {
      const vertex = triangles[i];
      if (remap[vertex] < 0) {
        remap[vertex] = points.length;
        const j = 3 * vertex;
        const x = decimal(positions[j]), y = decimal(positions[j + 1]), z = decimal(positions[j + 2]);
        points.push(`(${x},${y},${z})`);
        directions.push(`(${decimal(normals[j])},${decimal(normals[j + 1])},${decimal(normals[j + 2])})`);
        for (let axis = 0; axis < 3; axis++) {
          const v = positions[j + axis];
          min[axis] = Math.min(min[axis], v);
          max[axis] = Math.max(max[axis], v);
        }
        // PNG rows in glTF start at the top. USD's st origin is bottom-left.
        if (uv) coords.push(`(${decimal(uv[2 * vertex])},${decimal(1 - uv[2 * vertex + 1])})`);
      }
      indices[i] = remap[vertex];
    }
    return `def Mesh "${name}" (prepend apiSchemas = ["MaterialBindingAPI"]) {
        uniform token subdivisionScheme = "none"
        float3[] extent = [(${min.join(',')}),(${max.join(',')})]
        point3f[] points = [${points.join(',')}]
        normal3f[] normals = [${directions.join(',')}] (interpolation = "vertex")
        int[] faceVertexCounts = [${'3,'.repeat(indices.length / 3 - 1)}3]
        int[] faceVertexIndices = [${indices.join(',')}]
        ${uv ? `texCoord2f[] primvars:st = [${coords.join(',')}] (interpolation = "vertex")` : ''}
        rel material:binding = <${materialPath(material)}>
    }`;
  }

  async function fromGLB(blob) {
    const buffer = await blob.arrayBuffer(), header = new DataView(buffer);
    const jsonLength = header.getUint32(12, true), binaryStart = 28 + jsonLength;
    const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
    function accessor(index) {
      const a = doc.accessors[index], b = doc.bufferViews[a.bufferView];
      const ArrayType = {5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}[a.componentType];
      const components = {SCALAR: 1, VEC2: 2, VEC3: 3}[a.type];
      return new ArrayType(buffer, binaryStart + b.byteOffset, a.count * components);
    }
    const meshes = doc.meshes.map(mesh => {
      const name = identifier(mesh.name);
      if (mesh.primitives.length === 1) {
        const p = mesh.primitives[0];
        return meshText(name, p, accessor, doc.materials[p.material]);
      }
      const parts = mesh.primitives.map(p => {
        const material = doc.materials[p.material];
        return meshText(identifier(material.name), p, accessor, material);
      });
      return `def Xform "${name}" {\n${parts.join('\n')}\n}`;
    });
    const stage = `#usda 1.0
(
    defaultPrim = "Slab"
    metersPerUnit = 1
    upAxis = "Y"
)
def Xform "Slab" {
    def Scope "Materials" {
        ${doc.materials.map(m => materialText(doc, m)).join('\n')}
    }
    ${meshes.join('\n')}
}
`;
    const entries = [{name: 'Slab.usda', data: encoder.encode(stage)}];
    for (const image of doc.images) {
      const b = doc.bufferViews[image.bufferView];
      entries.push({name: texturePath(image), data: new Uint8Array(buffer, binaryStart + b.byteOffset, b.byteLength)});
    }
    return packageFiles(entries);
  }

  window.SlabUSDZ = {fromGLB};
})();
