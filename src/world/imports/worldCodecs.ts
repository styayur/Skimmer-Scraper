import { LoadingManager } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import dracoJs from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url&no-inline';
import dracoWasm from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url&no-inline';
import basisJs from 'three/addons/libs/basis/basis_transcoder.js?url&no-inline';
import basisWasm from 'three/addons/libs/basis/basis_transcoder.wasm?url&no-inline';

export type ConfigureWorldTextures = (loader: KTX2Loader) => void;
const basisPath = '/__skimmer_world_basis__/';

export const parseWorldGlb = async (
  data: ArrayBuffer,
  extensions: ReadonlySet<string>,
  configureTextures: ConfigureWorldTextures,
) => {
  const manager = new LoadingManager().setURLModifier(url => {
    if (url === `${basisPath}basis_transcoder.js`) return basisJs;
    if (url === `${basisPath}basis_transcoder.wasm`) return basisWasm;
    if (url === dracoJs || url === dracoWasm || url.startsWith('blob:') || url.startsWith('data:')) return url;
    throw new Error('已阻止导入世界访问外部资源。');
  });
  const loader = new GLTFLoader(manager);
  const draco = extensions.has('KHR_draco_mesh_compression')
    ? new DRACOLoader(manager).setDecoderPath({ js: dracoJs, wasm: dracoWasm }).setWorkerLimit(2) : null;
  const ktx = extensions.has('KHR_texture_basisu')
    ? new KTX2Loader(manager).setTranscoderPath(basisPath).setWorkerLimit(2) : null;
  try {
    if (draco) loader.setDRACOLoader(draco);
    if (ktx) {
      configureTextures(ktx);
      loader.setKTX2Loader(ktx);
    }
    if (extensions.has('EXT_meshopt_compression') || extensions.has('KHR_meshopt_compression')) {
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    return await loader.parseAsync(data, '');
  } finally {
    draco?.dispose();
    ktx?.dispose();
  }
};
