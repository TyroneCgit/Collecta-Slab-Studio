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
    const textures = [];
    function imageNode(name, reference, colorSpace, normal = false) {
      const texture = doc.textures[reference.index];
      const image = doc.images[texture.source];
      const wrap = doc.samplers[texture.sampler].wrapS === 10497 ? 'repeat' : 'clamp';
      const decode = normal ? `float4 inputs:scale = (2,2,2,1)
            float4 inputs:bias = (-1,-1,-1,0)` : '';
      textures.push(`def Shader "${name}" {
            uniform token info:id = "UsdUVTexture"
            asset inputs:file = @${texturePath(image)}@
            token inputs:sourceColorSpace = "${colorSpace}"
            token inputs:wrapS = "${wrap}"
            token inputs:wrapT = "${wrap}"
            float2 inputs:st.connect = <${path}/UV.outputs:result>
            ${decode}
            float3 outputs:rgb
            float outputs:g
            float outputs:b
        }`);
      return path + '/' + name;
    }
    const isClear = !!material.extensions?.KHR_materials_transmission;
    const tint = material.extensions?.KHR_materials_volume?.attenuationColor;
    const color = isClear && tint ? tint.map(channel => Math.sqrt(channel)) : (pbr.baseColorFactor || [1, 1, 1]);
    const diffuse = pbr.baseColorTexture
      ? `color3f inputs:diffuseColor.connect = <${imageNode('Ink',pbr.baseColorTexture,'sRGB')}.outputs:rgb>`
      : `color3f inputs:diffuseColor = (${color.slice(0, 3).join(',')})`;
    const response = pbr.metallicRoughnessTexture && imageNode('MetalResponse',pbr.metallicRoughnessTexture,'raw');
    const sheen = material.extensions?.KHR_materials_specular?.specularColorTexture;
    const roughness = response ? `float inputs:roughness.connect = <${response}.outputs:g>`
      : `float inputs:roughness = ${pbr.roughnessFactor}`;
    // Preview Surface has no thin-film input. Tint the reflected lobe of the
    // tilted foil microfacets while keeping the diffuse artwork unmodified.
    const reflectance = sheen ? `int inputs:useSpecularWorkflow = 1
            color3f inputs:specularColor.connect = <${imageNode('ReflectedSheen',sheen,'sRGB')}.outputs:rgb>`
      : `float inputs:metallic = ${pbr.metallicFactor}`;
    const bump = material.normalTexture
      ? `normal3f inputs:normal.connect = <${imageNode('Grain',material.normalTexture,'raw',true)}.outputs:rgb>` : '';
    // Apple Preview Surface models glossy transmission with opacity and IOR. On
    // foil, the registered normal and metal/roughness maps provide moving flashes.
    const optical = isClear ? `float inputs:opacity = ${(.035 + .88*pbr.roughnessFactor).toFixed(4)}
            float inputs:ior = ${material.extensions.KHR_materials_ior.ior}
            float inputs:clearcoat = 0.24
            float inputs:clearcoatRoughness = ${pbr.roughnessFactor}` : '';
    return `def Material "${identifier(material.name)}" {
        token outputs:surface.connect = <${path}/Surface.outputs:surface>
        def Shader "Surface" {
            uniform token info:id = "UsdPreviewSurface"
            ${diffuse}
            ${roughness}
            ${reflectance}
            ${bump}
            ${optical}
            token outputs:surface
        }
        ${textures.length ? `def Shader "UV" {
            uniform token info:id = "UsdPrimvarReader_float2"
            string inputs:varname = "st"
            float2 outputs:result
        }
        ${textures.join('\n')}` : ''}
    }`;
  }

  const decimal = value => Math.round(value * 1e8) / 1e8;
  async function usdNormalMap(png) {
    // Flipping st reverses the tangent frame's bitangent. Bake that sign into
    // the PNG so Apple readers can use the standard [-1,1] normal-map decode.
    const bitmap=await createImageBitmap(new Blob([png],{type:'image/png'}));
    const canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');
    context.drawImage(bitmap,0,0);bitmap.close();
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    for(let i=1;i<pixels.data.length;i+=4)pixels.data[i]=255-pixels.data[i];
    context.putImageData(pixels,0,0);
    const output=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The normal map could not be encoded.')),'image/png'));
    return new Uint8Array(await output.arrayBuffer());
  }
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
    const normalImages=new Set(doc.materials.filter(m=>m.normalTexture).map(m=>doc.textures[m.normalTexture.index].source));
    for (const [index,image] of doc.images.entries()) {
      const b = doc.bufferViews[image.bufferView];
      const png=new Uint8Array(buffer,binaryStart+b.byteOffset,b.byteLength);
      entries.push({name:texturePath(image),data:normalImages.has(index)?await usdNormalMap(png):png});
    }
    return packageFiles(entries);
  }

  window.SlabUSDZ = {fromGLB};
})();
