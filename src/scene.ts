import { WAVE_COMPONENTS, WAVE_WIDTH, WAVE_HEIGHT, MAX_DISPLACEMENT } from './waves.mjs';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { type Features, type Settings } from './types';

export class VisualScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  smaa = new SMAAPass();
  sheet!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  overlay = new THREE.Scene();
  overlayCamera = new THREE.PerspectiveCamera(38,16/9,.1,100);

  group = new THREE.Group();

  particles: THREE.Points;
  particleTexture: THREE.CanvasTexture;
  cover: THREE.Mesh;
  label: THREE.Mesh;
  coverTexture?: THREE.Texture;
  labelTexture?: THREE.CanvasTexture;
  labelKey = '';
  private currentPreset = '';
  constructor(canvas: HTMLCanvasElement, width = 1280, height = 720) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false);
    this.renderer.setClearColor('#090a10'); this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.frameCamera();
    this.group.position.set(0,.3,0);this.group.rotation.set(0,0,-.08);this.scene.add(this.group);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.6, 0.18);
    this.composer.addPass(this.bloom); this.composer.addPass(this.smaa); this.composer.addPass(new OutputPass());
    const positions = new Float32Array(1800 * 3);
    let seed = 137;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < positions.length; i += 3) { positions[i] = (random() - .5) * 18; positions[i + 1] = (random() - .5) * 10; positions[i + 2] = (random() - .5) * 10 - 2; }
    const particleGeometry = new THREE.BufferGeometry(); particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const sprite=document.createElement('canvas');sprite.width=sprite.height=64;const ctx=sprite.getContext('2d')!;
    const gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.3,'rgba(255,255,255,.9)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);this.particleTexture=new THREE.CanvasTexture(sprite);
    this.particles = new THREE.Points(particleGeometry,new THREE.PointsMaterial({color:'#a99bd4',map:this.particleTexture,size:4*height/1080,sizeAttenuation:false,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));
    this.particles.position.set(0,.3,0);this.particles.scale.setScalar(1.4);this.scene.add(this.particles);
    this.cover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    this.cover.visible = false; this.overlay.add(this.cover);
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(2.8, .7), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.overlay.add(this.label);this.overlayCamera.position.set(0,0,8.8);

  }
  setSize(width: number, height: number) { this.renderer.setSize(width, height, false); this.composer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.frameCamera(); this.overlayCamera.aspect=width/height;this.overlayCamera.updateProjectionMatrix(); }
  private frameCamera() {
    // Framing depends only on viewport aspect and the maximum wave envelope, never audio time.
    const halfFov=THREE.MathUtils.degToRad(this.camera.fov/2);
    const distance=(Math.hypot(WAVE_WIDTH/2,WAVE_HEIGHT/2,MAX_DISPLACEMENT)+.25)/Math.sin(Math.min(halfFov,Math.atan(Math.tan(halfFov)*this.camera.aspect)))*1.08;
    this.camera.position.set(0,.3,distance);
    this.camera.lookAt(0,.3,0);
  }
  setCover(image: HTMLImageElement | null) {
    this.coverTexture?.dispose(); this.cover.visible = !!image;
    if (!image) return;
    this.coverTexture = new THREE.Texture(image); this.coverTexture.colorSpace = THREE.SRGBColorSpace; this.coverTexture.needsUpdate = true;
    const material = this.cover.material as THREE.MeshBasicMaterial; material.map = this.coverTexture; material.needsUpdate = true;
    this.cover.userData.aspect = image.naturalWidth / image.naturalHeight;
  }
  private build(preset: string) {
    if(this.sheet){this.group.remove(this.sheet);this.sheet.geometry.dispose();this.sheet.material.dispose();}
    const terms=WAVE_COMPONENTS.map((c,i)=>`z+=(${c.base.toFixed(3)}+${c.gain.toFixed(3)}*clamp(uBands[${i}],0.,1.)*clamp(uSensitivity,0.,2.)/2.)*sin(p.x*${c.x.toFixed(3)}+p.y*${c.y.toFixed(3)}+uTime*${c.speed.toFixed(3)}+${(i*.8).toFixed(3)});`).join('');
    const material=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{uTime:{value:0},uBands:{value:[0,0,0,0,0,0]},uSensitivity:{value:1.2},uMood:{value:1}},
      vertexShader:`uniform float uTime;uniform float uBands[6];uniform float uSensitivity;uniform float uMood;varying vec3 vNormal;varying vec3 vEye;varying vec2 vUv;varying float vHeight;
      float heightAt(vec2 p){float z=0.;${terms}return z*uMood*max(0.,1.-pow(p.x/5.,2.))*max(0.,1.-pow(p.y/2.,2.));}
      void main(){vec3 p=position;p.z=heightAt(p.xy);float e=.002;float dx=(heightAt(p.xy+vec2(e,0.))-heightAt(p.xy-vec2(e,0.)))/(2.*e);float dy=(heightAt(p.xy+vec2(0.,e))-heightAt(p.xy-vec2(0.,e)))/(2.*e);vNormal=normalize(normalMatrix*vec3(-dx,-dy,1.));vec4 view=modelViewMatrix*vec4(p,1.);vEye=normalize(-view.xyz);vUv=uv;vHeight=p.z;gl_Position=projectionMatrix*view;}`,
      fragmentShader:`uniform float uTime;uniform float uBands[6];varying vec3 vNormal;varying vec3 vEye;varying vec2 vUv;varying float vHeight;
      void main(){vec3 n=normalize(vNormal);float facing=abs(dot(n,normalize(vEye)));float rim=pow(1.-facing,2.);float light=pow(max(0.,dot(n,normalize(vec3(-.4,.6,1.)))),8.);float folds=.5+.5*sin(vUv.x*22.+vHeight*3.-uTime*.3);float filaments=pow(.5+.5*sin(vUv.x*65.+vUv.y*9.+vHeight*4.+uTime*.6),8.);vec3 mint=vec3(.35,1.,.74),cyan=vec3(.13,.65,.95),violet=vec3(.62,.27,1.);vec3 color=mix(mint,cyan,smoothstep(0.,.6,vUv.x));color=mix(color,violet,smoothstep(.4,1.,vUv.x));float shimmer=uBands[5]*(.5+.5*sin(uTime*3.+vUv.x*18.))*.18;float edge=smoothstep(0.,.09,vUv.x)*smoothstep(0.,.09,1.-vUv.x)*smoothstep(0.,.16,vUv.y)*smoothstep(0.,.16,1.-vUv.y);vec3 c=color*(.22+folds*.3+rim*.8+light*.65+filaments*(.12+uBands[4]*.4)+shimmer);gl_FragColor=vec4(c,edge*(.48+light*.18+rim*.18));}`});
    this.sheet=new THREE.Mesh(new THREE.PlaneGeometry(WAVE_WIDTH,WAVE_HEIGHT,256,96),material);this.sheet.frustumCulled=false;this.group.add(this.sheet);this.currentPreset=preset;
  }
  render(time: number, settings: Settings, features: Features, demo = false) {
    if (settings.preset !== this.currentPreset) this.build(settings.preset);
    const t = time * settings.motion;
    const choreography=features.choreography || {formation:Math.floor(time/8)%4,previous:(Math.floor(time/8)+3)%4,mix:Math.min(1,(time%8)/2),energy:.3,events:[]};

    const bands=features.bands ?? [0,1,2,3,4,5].map(i=>demo ? .2+.15*Math.sin(time*(.4+i*.07)+i) : 0);
    const moods=[.65,.85,1.,.7],blendMood=Math.max(0,Math.min(1,choreography.mix)),easedMood=blendMood*blendMood*(3-2*blendMood);
    this.sheet.material.uniforms.uMood.value=moods[choreography.previous]+(moods[choreography.formation]-moods[choreography.previous])*easedMood;
    this.sheet.material.uniforms.uBands.value=bands;
    this.sheet.material.uniforms.uTime.value=t;
    this.sheet.material.uniforms.uSensitivity.value=settings.sensitivity;
    this.bloom.strength=settings.glow*.9;
    this.particles.geometry.setDrawRange(0, Math.floor(1800 * settings.particles));
    (this.particles.material as THREE.PointsMaterial).opacity = .12 + features.high * .5;
    (this.particles.material as THREE.PointsMaterial).size=4*this.renderer.domElement.height/1080;

    this.particles.rotation.y = t * .012;
    const size = .65 + settings.coverSize * .8, aspect = this.cover.userData.aspect || 1;
    this.cover.scale.set(size * Math.min(1, aspect), size * Math.min(1, 1 / aspect), 1);
    this.cover.position.set(-3.1, -1.35, .3);
    this.cover.rotation.y = .09;
    const title = settings.title || (demo ? 'A NEW DIMENSION' : '');
    const artist = settings.artist || (demo ? 'YOUR SOUND. REIMAGINED.' : '');
    const key = `${title}|${artist}`;
    if (key !== this.labelKey) {
      this.labelKey = key; this.labelTexture?.dispose();
      const canvas = document.createElement('canvas'); canvas.width = 1120; canvas.height = 280;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#f1edf9'; ctx.font = '500 48px Arial'; ctx.fillText(title.slice(0, 70), 0, 90, 1080);
      ctx.fillStyle = '#a5a0b4'; ctx.font = '28px Arial'; ctx.fillText(artist.slice(0, 70), 0, 155, 1080);
      this.labelTexture = new THREE.CanvasTexture(canvas); this.labelTexture.colorSpace = THREE.SRGBColorSpace;
      const material = this.label.material as THREE.MeshBasicMaterial; material.map = this.labelTexture; material.needsUpdate = true;
    }
    this.label.position.set(-2.4, this.cover.visible ? -2.32 : -1.85, .32);
    this.composer.render();
    this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.overlay,this.overlayCamera);this.renderer.autoClear=true;
  }
  dispose() {
    [...this.overlay.children].forEach(o=>this.scene.add(o)); this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) { o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } });
    this.particleTexture.dispose(); this.coverTexture?.dispose(); this.labelTexture?.dispose(); this.smaa.dispose(); this.bloom.dispose(); this.composer.dispose(); this.renderer.dispose();
  }
}
