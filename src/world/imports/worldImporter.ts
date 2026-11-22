import { Vector3 } from 'three';
import { ImportedWorldAdapter } from './importedWorldAdapter';
import { ImportedMotion } from './importedMotion';
import { analyzeWorldScene, disposeWorldScenes, type AnalyzedWorldScene } from './sceneAnalyzer';
import type { ConfigureWorldTextures } from './worldCodecs';
import { inspectWorldGlb } from './worldGlbPreflight';
import { validateWorldOptions, WORLD_IMPORT_LIMITS as limits, type WorldImportOptions, type WorldManifest } from './worldManifest';

export interface ImportVariantRequest {
  fingerprint?: string;
  variant: number;
  exact?: boolean;
}

export class WorldImporter {
  public async read(file: File): Promise<ArrayBuffer> {
    if (!file.name.toLowerCase().endsWith('.glb') || file.size < 20) throw new Error('请选择有效的 .glb 世界文件。');
    if (file.size > limits.bytes) throw new Error('世界文件须小于或等于 128 MB。');
    return file.arrayBuffer();
  }

  public async load(
    data: ArrayBuffer, name: string, options: WorldImportOptions, configureTextures: ConfigureWorldTextures,
    request?: ImportVariantRequest,
  ): Promise<ImportedWorldAdapter> {
    validateWorldOptions(options);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    const fingerprint = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (request?.fingerprint && request.fingerprint !== fingerprint) {
      throw new Error('此 GLB 与种子不匹配，请选择原始 GLB 文件。');
    }
    const inspected = inspectWorldGlb(data);
    try {
      return await this.build(data, name, options, configureTextures, inspected, fingerprint, request?.variant);
    } catch (error) {
      if (!request?.variant || request.exact) throw error;
      // Use a fresh scene after releasing the rejected layout and its indexes.
      return this.build(data, name, options, configureTextures, inspected, fingerprint);
    }
  }

  private async build(
    data: ArrayBuffer, name: string, options: WorldImportOptions, configureTextures: ConfigureWorldTextures,
    inspected: ReturnType<typeof inspectWorldGlb>, fingerprint: string, variant?: number,
  ): Promise<ImportedWorldAdapter> {
    const { parseWorldGlb } = await import('./worldCodecs');
    const gltf = await parseWorldGlb(data, inspected.extensions, configureTextures);
    let analyzed: AnalyzedWorldScene | null = null;
    let motion: ImportedMotion | null = null;
    let world: ImportedWorldAdapter | null = null;
    try {
      motion = new ImportedMotion(gltf.scene, gltf.animations, options.motion);
      analyzed = analyzeWorldScene(gltf.scene, options, motion, variant ? { fingerprint, seed: variant } : undefined);
      const { x, y, z } = analyzed.bounds.getSize(new Vector3());
      const manifest: WorldManifest = {
        id: fingerprint,
        name: (name.replace(/\.glb$/i, '').trim() || '本地世界').slice(0, 64),
        bytes: data.byteLength,
        nodes: analyzed.nodes,
        triangles: analyzed.triangles,
        collisionTriangles: analyzed.collisionTriangles,
        materials: analyzed.materials,
        textures: analyzed.textures,
        texturePixels: inspected.texturePixels,
        bounds: { x, y, z },
        animations: motion.clips,
        meshRoles: analyzed.meshRoles,
        options: structuredClone(options),
        ...(analyzed.variant && variant ? { variant: { seed: variant, ...analyzed.variant } } : {}),
      };
      world = new ImportedWorldAdapter(manifest, analyzed, gltf.scenes, motion);
      world.getDefaultSpawn();
      return world;
    } catch (error) {
      if (world) world.dispose();
      else {
        motion?.dispose();
        analyzed?.surfaces?.dispose();
        analyzed?.obstacles?.dispose();
        for (const mesh of analyzed?.dynamic ?? []) mesh.geometry.dispose();
        disposeWorldScenes(gltf.scenes);
      }
      throw error;
    }
  }
}
