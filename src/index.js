import { ShaderMaterial, CylinderBufferGeometry, DirectionalLight, Fog, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator, Scene, TextureLoader, UnsignedByteType, Vector2, Vector3, WebGLRenderer } from 'three'
import {
    GLTFLoader
} from 'three/examples/jsm/loaders/GLTFLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'

var renderer, scene, camera, controls
var composer, scenePass, bloomComposer, bloomPass, laserPass, laserUniforms
var mesh, material, uniforms, blackMat

const throughVert = `
varying vec2 vUv;
void main()	{
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const mergeBloomFrag = `
uniform sampler2D bloomMap;
uniform sampler2D tDiffuse;
uniform float time;
varying vec2 vUv;

void main()	{
    vec3 bloom = texture2D(bloomMap, vUv).rgb;
    vec3 col = texture2D(tDiffuse, vUv).rgb;
	gl_FragColor = vec4(bloom + col, 1.0);
}
`

// 激光
var laserMeshArr
var laserConfigs = [
    { origin: new Vector3(-20, -30, 20), target: new Vector3(-1, 0, -3).normalize(), freq: 1.0, amp: 1.0, dist: 4, targetDist: 2, ease: 0.1 },
    { origin: new Vector3(40, -40, 20), target: new Vector3(-1, 4, 3).normalize(), freq: 2.0, amp: 1.5, dist: 3, targetDist: 3, ease: 0.06 },
    { origin: new Vector3(-10, -8, 20), target: new Vector3(2, 1, -0.5).normalize(), freq: 1.5, amp: 1.0, dist: 3, targetDist: 3, ease: 0.1 },
    { origin: new Vector3(-20, 7, -5), target: new Vector3(0, 0.4, -1).normalize(), freq: 0.8, amp: 0.8, dist: 2, targetDist: 2, ease: 0.05 },
    { origin: new Vector3(-15, -3, 10), target: new Vector3(0, 1, 0).normalize(), freq: 1.0, amp: 1.3, dist: 3.5, targetDist: 2, ease: 0.1 },
    { origin: new Vector3(15, -4, 20), target: new Vector3(0, -5, -4).normalize(), freq: 1.8, amp: 1.1, dist: 3.5, targetDist: 3.5, ease: 0.05 },
    { origin: new Vector3(3, -15, -10), target: new Vector3(-1.5, 0, 3).normalize(), freq: 1.75, amp: 1.2, dist: 4, targetDist: 3, ease: 0.1 },
]


function init () {
    renderer = new WebGLRenderer({
        canvas: document.getElementById('main_canvas'),
        antialias: true
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)

    scene = new Scene()
    scene.fog = new Fog(0x0, 6.0, 16.0)

    let dirLight0 = new DirectionalLight( 0xffffff, 0.5 );
    dirLight0.position.set( 3, 2, 5.5 );
    let dirLight1 = new DirectionalLight( 0xccccff, 0.3 );
    dirLight1.position.set( - 1, 0.75, - 0.5 );
    scene.add( dirLight1 );
    scene.add( dirLight0 );

    camera = new PerspectiveCamera( 30, window.innerWidth / window.innerHeight, 1, 100 )
    camera.position.set( 0, 0, 6 )
    controls = new OrbitControls( camera, renderer.domElement )
    controls.target = new Vector3()
    controls.enableDamping = true

    blackMat = new MeshBasicMaterial({color: 0})

    addLasers()
    loadModel()
    initComposer()

    window.addEventListener('resize', onWindowReisze)
}

function anim(time) {
    const t = time * 0.001
    controls.update()
    updateLasers(t);

    
    if (mesh) {
        mesh.material = blackMat
        bloomComposer.render();
        mesh.material = material
    }
    composer.render();
    requestAnimationFrame(anim)
}

function onWindowReisze() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

function initComposer() {
    bloomComposer = new EffectComposer(renderer)
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass( new Vector2( window.innerWidth, window.innerHeight ).multiplyScalar(window.devicePixelRatio), 3, 0.6, 0.0);
    bloomComposer.addPass(bloomPass);

    composer = new EffectComposer(renderer)
    scenePass = new RenderPass(scene, camera)
    composer.addPass(scenePass);
    laserUniforms = {
        bloomMap: {value: bloomComposer.readBuffer.texture},
        tDiffuse: {value: null}
    }
    laserPass = new ShaderPass(new ShaderMaterial({
        vertexShader: throughVert,
        fragmentShader: mergeBloomFrag,
        uniforms: laserUniforms
    }))
    composer.addPass(laserPass)
}

function loadModel() {
    new GLTFLoader().load('/model/monkey.glb', (gltf) => {
        gltf.scene.traverse((child) => {
            if (child instanceof Mesh) {
                mesh = child
            }
        })
        material = new MeshStandardMaterial({
            metalness: 1,
            roughness: 1,
            color: 0x8099aa,
            flatShading: false,
            roughnessMap: new TextureLoader().load('textures/roughness.jpg'),
        })
        
        material.onBeforeCompile = (shader) => {
            uniforms = shader.uniforms;
            shader.uniforms.time = {value: 0.0}
            shader.uniforms.laserOrigin0 = {value: new Vector3()}
            shader.uniforms.laserDir0 = {value: new Vector3()}
            shader.uniforms.laserOrigin1 = {value: new Vector3()}
            shader.uniforms.laserDir1 = {value: new Vector3()}
            shader.uniforms.laserOrigin2 = {value: new Vector3()}
            shader.uniforms.laserDir2 = {value: new Vector3()}
            shader.uniforms.laserOrigin3 = {value: new Vector3()}
            shader.uniforms.laserDir3 = {value: new Vector3()}
            shader.uniforms.laserOrigin4 = {value: new Vector3()}
            shader.uniforms.laserDir4 = {value: new Vector3()}
            shader.uniforms.laserOrigin5 = {value: new Vector3()}
            shader.uniforms.laserDir5 = {value: new Vector3()}
            shader.uniforms.laserOrigin6 = {value: new Vector3()}
            shader.uniforms.laserDir6 = {value: new Vector3()}

            shader.vertexShader = `
                varying vec3 vWorldPosition;
                varying vec3 vEyeDir;
                varying vec3 vWorldNormal;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace('#include <displacementmap_vertex>', `
                vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vEyeDir = normalize(vWorldPosition - cameraPosition);
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            `)

            shader.fragmentShader = `
                uniform float time;
                uniform vec3 laserOrigin0;
                uniform vec3 laserDir0;
                uniform vec3 laserOrigin1;
                uniform vec3 laserDir1;
                uniform vec3 laserOrigin2;
                uniform vec3 laserDir2;
                uniform vec3 laserOrigin3;
                uniform vec3 laserDir3;
                uniform vec3 laserOrigin4;
                uniform vec3 laserDir4;
                uniform vec3 laserOrigin5;
                uniform vec3 laserDir5;
                uniform vec3 laserOrigin6;
                uniform vec3 laserDir6;
                varying vec3 vWorldPosition;
                varying vec3 vEyeDir;
                varying vec3 vWorldNormal;
                float twoLineDist(vec3 o0, vec3 d0, vec3 o1, vec3 d1) {
                    vec3 n = cross(d0, d1);
                    return dot(n, (o0 - o1)) / length(n);
                }
                float linePointDist(vec3 o0, vec3 d0, vec3 p) {
                    vec3 n = cross(d0, p-o0);
                    return length(n) / length(d0);
                }
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <encodings_fragment>`,
                `#include <encodings_fragment>

                vec3 o0 = vWorldPosition;
                vec3 d0 = normalize(reflect(vEyeDir, vWorldNormal));

                float d = 1.0;
                d *= clamp(abs(twoLineDist(o0, d0, laserOrigin0, laserDir0)) * linePointDist(laserOrigin0, laserDir0, vWorldPosition), 0.0, 1.0);
                d *= clamp(abs(twoLineDist(o0, d0, laserOrigin1, laserDir1)) * linePointDist(laserOrigin1, laserDir1, vWorldPosition), 0.0, 1.0);
                d *= clamp(abs(twoLineDist(o0, d0, laserOrigin2, laserDir2)) * linePointDist(laserOrigin2, laserDir2, vWorldPosition), 0.0, 1.0);
                d *= clamp(abs(twoLineDist(o0, d0, laserOrigin3, laserDir3)) * linePointDist(laserOrigin3, laserDir3, vWorldPosition), 0.0, 1.0);
                d *= clamp(abs(twoLineDist(o0, d0, laserOrigin4, laserDir4)) * linePointDist(laserOrigin4, laserDir4, vWorldPosition), 0.0, 1.0);
                d *= clamp(abs(twoLineDist(o0, d0, laserOrigin5, laserDir5)) * linePointDist(laserOrigin5, laserDir5, vWorldPosition), 0.0, 1.0);
                d *= clamp(abs(twoLineDist(o0, d0, laserOrigin6, laserDir6)) * linePointDist(laserOrigin6, laserDir6, vWorldPosition), 0.0, 1.0);
                d = 1.0 - d;
                d = pow(d, 128.0);
                gl_FragColor.rgb += vec3(0.0, 1.0, 0.0) * d * 1.0;
                `
            )
        }
        // Env map
        const pmremGenerator = new PMREMGenerator( renderer );
        pmremGenerator.compileEquirectangularShader();
        new RGBELoader()
            .setDataType( UnsignedByteType )
            .setPath( '/textures/equirectangular/' )
            .load( 'studio.hdr',  ( hdrEquirect ) => {
                var hdrCubeRenderTarget = pmremGenerator.fromEquirectangular( hdrEquirect );
                pmremGenerator.dispose();
                material.envMap = hdrCubeRenderTarget.texture
                hdrEquirect.dispose();
            });

        mesh.material = material
        scene.add(mesh)
    })
}

function addLasers() {
    const radius = 0.002, height = 400
    const geometry = new CylinderBufferGeometry( radius, radius, height, 10 )
    let positions = geometry.attributes.position.array
    for (let i = 0 ;  i < positions.length ;  i+=3) {
        let x = positions[i], y =positions[i+1], z = positions[i+2]
        positions[i] = x
        positions[i+1] = z
        positions[i+2] = y + height/2
    }
    const material = new MeshBasicMaterial( {
        color: 0x00ff00,
    } )

    laserMeshArr = []
    for (let i = 0 ; i < laserConfigs.length ; i++) {
        const pos = laserConfigs[i].origin
        let laser = new Mesh(geometry, material)
        laser.renderOrder = 10
        laser.position.copy(pos)
        laser.lookAt(laserConfigs[i].target)

        laserMeshArr.push(laser)
        scene.add(laser)
    }
}

function updateLasers(time) {
    time *= 2.0
    for (let i = 0 ; i < laserMeshArr.length ; i++) {
        const laser = laserMeshArr[i];
        const freq = laserConfigs[i].freq
        const amp = laserConfigs[i].amp
        let t = time * freq * 0.5;
        laserConfigs[i].dist += (laserConfigs[i].targetDist - laserConfigs[i].dist) * laserConfigs[i].ease
        let target = laserConfigs[i].target.clone().multiplyScalar(laserConfigs[i].dist)
        laser.lookAt(target.add(new Vector3(Math.sin(t), Math.cos(t), Math.sin(t + i)).multiplyScalar(amp*1.0))) // 0.15

        if (uniforms) {
            uniforms[`laserOrigin${i}`].value = laser.position
            uniforms[`laserDir${i}`].value = target.clone().sub(laser.position).normalize()
        }
    }
}

init()
anim(0)