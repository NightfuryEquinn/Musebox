import { ambientMotion, ambientOverlayOpacity } from './ambient.mjs';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WAVE_COMPONENTS, WAVE_WIDTH, WAVE_HEIGHT } from './waves.mjs';
import { waveColors, type Features, type Settings } from './types';

const WAVE_HEIGHT_SCALE = 2.4;
const WAVE_DEPTH_SCALE = 1.6;
const CAMERA_ELEVATION = THREE.MathUtils.degToRad(12);
const CAMERA_HALF_HEIGHT = 3.3;

export class VisualScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-5.4, 5.4, CAMERA_HALF_HEIGHT, -CAMERA_HALF_HEIGHT, .1, 50);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  smaa = new SMAAPass();
  output = new OutputPass();
  sheet: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  distant: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  haze: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  overlay = new THREE.Scene();
  overlayCamera = new THREE.OrthographicCamera(0, 1920, 1080, 0, .1, 10);
  cover: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  coverTexture?: THREE.Texture;
  labelTexture?: THREE.CanvasTexture;
  labelKey = '';
  private colorKey = '';

  constructor(canvas: HTMLCanvasElement, width = 1920, height = 1080) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor('#090909');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // A low, fixed elevation exposes the crest-to-trough profile of every row.
    // Orthographic projection keeps amplitude equally readable at the back and front.
    this.camera.position.set(0, .25 + 15*Math.sin(CAMERA_ELEVATION), 15*Math.cos(CAMERA_ELEVATION));
    this.camera.lookAt(0, .25, 0);
    this.overlayCamera.position.z = 5;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), .7, .65, .18);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.smaa);
    this.composer.addPass(this.output);

    // Height and analytic derivatives share one evaluation of each wave component.
    const terms = WAVE_COMPONENTS.map((c, i) => `{
      float a=${c.base.toFixed(3)}+${c.gain.toFixed(3)}*clamp(uBands[${i}],0.,1.)*uSensitivity*.5;
      float phase=p.x*${c.x.toFixed(3)}+p.y*${c.y.toFixed(3)}+uTime*${c.speed.toFixed(3)}+${(i*.8).toFixed(3)};
      z+=a*sin(phase); dx+=a*cos(phase)*${c.x.toFixed(3)}; dy+=a*cos(phase)*${c.y.toFixed(3)};
    }`).join('\n');
    const material = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: {
        uOpacity: { value: 1 }, uTime: { value: 0 }, uBands: { value: [0,0,0,0,0,0] }, uSensitivity: { value: 1.2 }, uMood: { value: 1 },
        uLow: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() },
      },
      vertexShader: `
        uniform float uTime, uSensitivity, uMood; uniform float uBands[6];
        varying vec2 vUv; varying vec3 vNormal;
        void main(){
          vec3 p=position; float z=0.,dx=0.,dy=0.; ${terms}
          float ex=max(0.,1.-p.x*p.x/25.),ey=max(0.,1.-p.y*p.y/4.);
          float slopeX=(dx*ex*ey-z*2.*p.x/25.*ey)*uMood;
          float slopeY=(dy*ex*ey-z*ex*p.y/2.)*uMood;
          vNormal=normalize(normalMatrix*vec3(-slopeX*${WAVE_HEIGHT_SCALE.toFixed(2)},1.,slopeY*${(WAVE_HEIGHT_SCALE/WAVE_DEPTH_SCALE).toFixed(2)}));
          float height=z*ex*ey*uMood; vUv=uv;
          // Preserve each row's depth; displacement is genuine vertical amplitude.
          p.z=-p.y*${WAVE_DEPTH_SCALE.toFixed(2)};
          p.y=height*${WAVE_HEIGHT_SCALE.toFixed(2)}+.25;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        }`,
      fragmentShader: `
        uniform float uTime, uOpacity; uniform float uBands[6]; uniform vec3 uLow,uMid,uHigh;
        varying vec2 vUv; varying vec3 vNormal;
        void main(){
          float rows=vUv.y*56.;
          float distanceToLine=abs(fract(rows+.5)-.5);
          float aa=max(fwidth(rows),.0001);
          float line=1.-smoothstep(.045,.045+aa*.85,distanceToLine);
          vec3 color=mix(uLow,uMid,smoothstep(.08,.52,vUv.y));
          color=mix(color,uHigh,smoothstep(.70,1.,vUv.y));
          float edge=smoothstep(0.,.04,vUv.x)*smoothstep(0.,.04,1.-vUv.x)*smoothstep(0.,.05,vUv.y)*smoothstep(0.,.05,1.-vUv.y);
          float light=.65+.35*abs(vNormal.z);
          float detail=.3*uBands[4]+.18*uBands[5]*(.5+.5*sin(uTime*3.+vUv.x*18.));
          vec3 radiance=color*(line*(1.6+detail)*light+.018);
          gl_FragColor=vec4(radiance,edge*(.16+line*.84)*uOpacity);
        }`,
    });
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(WAVE_WIDTH, WAVE_HEIGHT, 256, 96), material);
    this.sheet.frustumCulled = false;
    this.scene.add(this.sheet);
    this.sheet.renderOrder = 3;
    for (let i=0; i<2; i++) {
      const layer = new THREE.Mesh(new THREE.PlaneGeometry(WAVE_WIDTH,WAVE_HEIGHT,128,48), material.clone());
      layer.position.set(0,.4+i*.3,-1.8-i*1.4);
      layer.scale.set(.95-i*.07,.65-i*.1,1);
      layer.renderOrder=2-i;
      layer.frustumCulled=false;
      layer.visible=false;
      this.distant.push(layer); this.scene.add(layer);
    }
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:false,
      uniforms:{uTime:{value:0},uAmount:{value:0},uEnergy:{value:0},uLow:{value:new THREE.Color()},uMid:{value:new THREE.Color()},uHigh:{value:new THREE.Color()}},
      vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.99,1.);}`,
      fragmentShader:`
        varying vec2 vUv; uniform float uTime,uAmount,uEnergy; uniform vec3 uLow,uMid,uHigh;
        void main(){
          vec2 p=vUv; float curve=.52+.065*sin(p.x*5.+uTime*.13)+.035*sin(p.x*9.-uTime*.21);
          float ribbon=exp(-pow((p.y-curve)/.15,2.));
          float halo=exp(-dot((p-vec2(.5,.52))*vec2(1.6,2.1),(p-vec2(.5,.52))*vec2(1.6,2.1))*4.);
          float edge=smoothstep(0.,.22,p.x)*smoothstep(0.,.22,1.-p.x)*smoothstep(0.,.2,p.y)*smoothstep(0.,.2,1.-p.y);
          vec3 color=mix(uLow,uMid,smoothstep(.1,.7,p.x));
          color=mix(color,uHigh,.18+.08*sin(uTime*.17));
          gl_FragColor=vec4(color*.55,edge*(ribbon*.19+halo*.12)*uAmount*(.7+.3*uEnergy));
        }`
    }));
    this.haze.frustumCulled=false; this.haze.renderOrder=0; this.haze.visible=false;
    this.scene.add(this.haze);
    this.cover = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    this.cover.visible = false;
    this.overlay.add(this.cover);
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }));
    this.overlay.add(this.label);
    this.setSize(width, height);
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    // Keep the full displacement envelope visible; resize never follows audio energy.
    const halfHeight = Math.max(CAMERA_HALF_HEIGHT, (WAVE_WIDTH/2+.4)*height/width);
    this.camera.left = -halfHeight*width/height;
    this.camera.right = halfHeight*width/height;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  setCover(image: HTMLImageElement | null) {
    this.coverTexture?.dispose();
    this.cover.visible = !!image;
    this.cover.material.map = null;
    if (image) {
      this.coverTexture = new THREE.Texture(image);
      this.coverTexture.colorSpace = THREE.SRGBColorSpace;
      this.coverTexture.needsUpdate = true;
      this.cover.material.map = this.coverTexture;
      this.cover.userData.aspect = image.naturalWidth/image.naturalHeight;
    }
    this.cover.material.needsUpdate = true;
  }

  render(time: number, settings: Settings, features: Features) {
    const u = this.sheet.material.uniforms;
    const choreography = features.choreography;
    const moods = [.65,.85,1,.7];
    const blend = Math.max(0,Math.min(1,choreography?.mix ?? 1));
    const eased = blend*blend*(3-2*blend);
    u.uMood.value = choreography ? moods[choreography.previous]+(moods[choreography.formation]-moods[choreography.previous])*eased : 1;
    // Main filaments retain the original amplitude, bands and flow speed.
    // Only the atmosphere uses slow motion and smoothed audio envelopes.
    const motion = ambientMotion(time, settings.motion, features.ambientEnergy ?? 0);
    u.uTime.value = time*settings.motion;
    u.uSensitivity.value = settings.sensitivity;
    u.uBands.value = features.bands ?? [0,0,0,0,0,0];
    const colors = waveColors(settings);
    const colorKey = colors.join('|');
    if (colorKey !== this.colorKey) {
      this.colorKey = colorKey;
      u.uLow.value.set(colors[0]); u.uMid.value.set(colors[1]); u.uHigh.value.set(colors[2]);
    }
    const atmosphere = Math.max(0,Math.min(1,settings.atmosphere));
    this.haze.visible = atmosphere>0;
    const h=this.haze.material.uniforms;
    h.uTime.value=motion.phase; h.uAmount.value=atmosphere; h.uEnergy.value=features.ambientEnergy ?? 0;
    for (const name of ['uLow','uMid','uHigh']) h[name].value.copy(u[name].value);
    this.distant.forEach((layer,i)=>{
      layer.visible=atmosphere>0;
      const d=layer.material.uniforms;
      d.uTime.value=motion.phase*(i===0 ? .71 : .43)+9+i*14;
      d.uMood.value=motion.mood; d.uBands.value=features.ambientBands ?? [0,0,0,0,0,0];
      d.uSensitivity.value=settings.sensitivity;
      d.uOpacity.value=atmosphere*(i===0 ? .22 : .12);
      for (const name of ['uLow','uMid','uHigh']) d[name].value.copy(u[name].value);
    });
    const opacity=ambientOverlayOpacity(time,features.duration ?? 0);
    this.cover.material.opacity=opacity; this.label.material.opacity=opacity;
    this.bloom.strength = settings.glow*1.2;
    const size = 110+settings.coverSize*110, aspect = this.cover.userData.aspect || 1;
    const width = size*Math.min(1,aspect), height = size*Math.min(1,1/aspect);
    this.cover.scale.set(width,height,1);
    this.cover.position.set(52+width/2,48+height/2,0);
    const key = JSON.stringify([settings.title,settings.artist,colors[1],document.fonts.status]);
    if (key !== this.labelKey) {
      this.labelKey = key;
      this.labelTexture?.dispose();
      const canvas = document.createElement('canvas'); canvas.width=1440; canvas.height=240;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle='#eeeee5'; ctx.font='italic 80px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(settings.title,0,106,1400);
      ctx.fillStyle=colors[1]; ctx.font='24px "IBM Plex Mono", monospace';
      ctx.fillText(settings.artist.toUpperCase(),4,166,1400);
      this.labelTexture=new THREE.CanvasTexture(canvas); this.labelTexture.colorSpace=THREE.SRGBColorSpace;
      this.label.material.map=this.labelTexture; this.label.material.needsUpdate=true;
    }
    this.label.scale.set(1008,168,1);
    this.label.position.set((this.cover.visible ? 52+width+30 : 52)+504,112,0);
    this.composer.render();
    this.renderer.autoClear=false;
    this.renderer.clearDepth();
    this.renderer.render(this.overlay,this.overlayCamera);
    this.renderer.autoClear=true;
  }

  dispose() {
    for (const mesh of [this.sheet,this.cover,this.label,this.haze,...this.distant]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.coverTexture?.dispose(); this.labelTexture?.dispose();
    this.smaa.dispose(); this.bloom.dispose(); this.output.dispose(); this.composer.dispose(); this.renderer.dispose();
  }
}
