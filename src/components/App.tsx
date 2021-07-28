import * as React from 'react';
import { values, Dictionary } from 'lodash';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { Store, AppAction } from '../reducer';
import { connect, ActionProps } from '../connect';
import { arrayBufferToBuffer } from '../util';
import BlockLoader from '../BlockLoader';
import ResourcePackLoader from '../ResourcePackLoader';
import DimensionMappedArray from '../DimensionMappedArray';
import loadSchematic from '../loadSchematic';
import { SOLID_BLOCKS, TRANSPARENT_BLOCKS } from '../constants';

const brokenBlocks = new Set([
  'minecraft:chest',
  'minecraft:white_bed',
  'minecraft:water',
  'minecraft:lava',
  'minecraft:warped_wall_sign',
  'minecraft:bubble_column',
  'minecraft:oak_wall_sign',
  'minecraft:player_head',
  'minecraft:brown_shulker_box',
  'minecraft:red_shulker_box',
  'minecraft:orange_shulker_box',
  'minecraft:yellow_shulker_box',
  'minecraft:lime_shulker_box',
  'minecraft:green_shulker_box',
  'minecraft:cyan_shulker_box',
  'minecraft:blue_shulker_box',
  'minecraft:purple_shulker_box',
  'minecraft:magenta_shulker_box',
  'minecraft:pink_shulker_box',
  'minecraft:white_shulker_box',
  'minecraft:light_gray_shulker_box',
  'minecraft:gray_shulker_box',
  'minecraft:black_shulker_box',
]);

interface AppStoreProps {
  name: string;
}

interface AppProps extends AppStoreProps, ActionProps<AppAction> {}

interface AppState {}

class App extends React.Component<AppProps, AppState> {
  canvas: React.RefObject<HTMLCanvasElement>;
  fileUpload: React.RefObject<HTMLInputElement>;
  scene: THREE.Scene;
  camera: THREE.Camera;
  controls: OrbitControls;
  regions: THREE.Group[] = [];
  blockLoader: BlockLoader;

  constructor(props: AppProps) {
    super(props);
    this.canvas = React.createRef<HTMLCanvasElement>();
    this.fileUpload = React.createRef<HTMLInputElement>();
  }

  selectFile = async () => {
    if (this.fileUpload.current && this.fileUpload.current.files) {
      for (const file of this.fileUpload.current.files) {
        const buffer = arrayBufferToBuffer(await file.arrayBuffer());
        const schematic = await loadSchematic(buffer);

        const size = Math.max(schematic.dimensions.x, schematic.dimensions.y, schematic.dimensions.z);

        this.camera.position.set(0, 0, size * 1.1);
        this.camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 6);
        this.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.regions.map((region) => this.scene.remove(region));
        this.regions = [];

        const failedBlocks = new Set();

        const solidBlocks = new DimensionMappedArray(Uint8Array, schematic.dimensions);
        const transparentBlocks: Dictionary<DimensionMappedArray> = {};
        for (const transparentBlock of TRANSPARENT_BLOCKS) {
          transparentBlocks[transparentBlock] = new DimensionMappedArray(Uint8Array, schematic.dimensions);
        }

        for (const regionBlocks of values(schematic.blocks)) {
          for (const block of regionBlocks) {
            const blockState = schematic.palette[block.paletteKey];
            if (SOLID_BLOCKS.has(blockState.name)) {
              solidBlocks.set(block.position, 1);
            }
            for (const transparentBlock of TRANSPARENT_BLOCKS) {
              if (blockState.name === transparentBlock) {
                transparentBlocks[transparentBlock].set(block.position, 1);
              }
            }
          }
        }

        for (const regionBlocks of values(schematic.blocks)) {
          const region = new THREE.Group();
          region.position.set(-schematic.dimensions.x / 2, schematic.dimensions.y / 2, -schematic.dimensions.z / 2);


          for (const block of regionBlocks) {

            const blockState = schematic.palette[block.paletteKey];
            if (blockState.name === 'minecraft:air') {
              continue;
            }

            if (brokenBlocks.has(blockState.name) || failedBlocks.has(blockState.name)) {
              continue;
            }

            try {
              const blockModel = await this.blockLoader.getBlock(
                block.position,
                blockState,
                solidBlocks,
                transparentBlocks,
              );
              region.add(blockModel);
            } catch (error) {
              failedBlocks.add(blockState.name);
              console.error('FAILED', blockState.name);
              console.error(error);
            }
          }

          this.scene.add(region);
          this.regions.push(region);
        }
      }
    }
  }

  async componentDidMount() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas.current || undefined, antialias: true });
    this.controls = new OrbitControls(this.camera, renderer.domElement);

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(500, 500);

    const ambientLight = new THREE.AmbientLight(0xAAAAAA);
    this.scene.add(ambientLight);

    const light = new THREE.DirectionalLight(0xCCCCCC);
    light.position.set(1, 0.5, 0.7);
    this.scene.add(light);

    this.camera.position.set(0, 0, 3);
    this.camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 6);
    this.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
    this.controls.target.set(0, 0, 0);

    const animate = () => {
      if (this.canvas.current) {
        requestAnimationFrame(animate);
        renderer.render(this.scene, this.camera);
        this.controls.update();
      }
    };

    animate();

    const resourceLoader = new ResourcePackLoader();
    await resourceLoader.load('./default.zip');
    this.blockLoader = new BlockLoader(resourceLoader);
  }

  render() {
    return (
      <div className={'App'}>
        <div className={'App_titlebar'}>
          <h1 className={'App_titlebar_title'}>
            <form>
              <input ref={this.fileUpload} onChange={this.selectFile} type='file'/>
            </form>
            <canvas ref={this.canvas} width='500' height='500'></canvas>
          </h1>
        </div>
      </div>
    );
  }
}

const AppContainer = connect(App, (store: Store): AppStoreProps => {
  return {
    name: store.name || 'Hello',
  };
});

export default AppContainer;

// TODO
// - Convert from litematica to normalised format
// - Replace orbit controls
// - Remove redstone material duplication
// - Shulkers, beds, chests, ender chests
// - Liquids
// - Light blocks
// - Cull block faces:
//   - Tidy up code
//   - Detect block type, ignore non-full blocks
//   - Deal with transparent blocks
//   - Deal with grass blocks / mushroom
