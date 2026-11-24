import { useEffect, useRef } from "react"
import * as THREE from "three"

import type { HeaderVibeState } from "@/types/chat"

interface HeaderVibeCanvasProps {
  vibeState: HeaderVibeState
}

interface VibePose {
  camY: number
  lookY: number
  sunY: number
  sunScale: number
  skyColor: THREE.Color
  fogColor: THREE.Color
  fogDensity: number
  groundBounceColor: THREE.Color
  cloudAlpha: number
  grassAlpha: number
  speedBoost: number
}

function createCloudPuffTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")

  if (ctx) {
    const grad = ctx.createRadialGradient(
      size * 0.46,
      size * 0.42,
      size * 0.06,
      size * 0.5,
      size * 0.5,
      size * 0.5
    )
    grad.addColorStop(0, "rgba(255, 255, 255, 0.96)")
    grad.addColorStop(0.38, "rgba(248, 252, 255, 0.78)")
    grad.addColorStop(0.7, "rgba(225, 240, 255, 0.3)")
    grad.addColorStop(1, "rgba(215, 235, 255, 0)")

    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function createSunCoreTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")

  if (ctx) {
    const cx = size * 0.5
    const cy = size * 0.5
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5)
    grad.addColorStop(0, "rgba(255, 255, 245, 1)")
    grad.addColorStop(0.2, "rgba(255, 249, 210, 0.98)")
    grad.addColorStop(0.42, "rgba(255, 230, 145, 0.62)")
    grad.addColorStop(0.7, "rgba(255, 215, 110, 0.16)")
    grad.addColorStop(1, "rgba(255, 215, 110, 0)")

    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function createSunHaloTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")

  if (ctx) {
    const cx = size * 0.5
    const cy = size * 0.5
    const grad = ctx.createRadialGradient(cx, cy, size * 0.04, cx, cy, size * 0.5)
    grad.addColorStop(0, "rgba(255, 248, 215, 0.65)")
    grad.addColorStop(0.32, "rgba(255, 235, 175, 0.3)")
    grad.addColorStop(0.68, "rgba(255, 226, 150, 0.08)")
    grad.addColorStop(1, "rgba(255, 226, 150, 0)")

    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function terrainHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.14) * 0.95 +
    Math.cos(z * 0.11 + x * 0.05) * 0.75 +
    Math.sin(x * 0.31 - z * 0.18) * 0.28
  )
}

export function HeaderVibeCanvas({ vibeState }: HeaderVibeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const targetStateRef = useRef<HeaderVibeState>(vibeState)

  useEffect(() => {
    targetStateRef.current = vibeState
  }, [vibeState])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      })
    } catch {
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.display = "block"
    container.appendChild(renderer.domElement)

    const poses: Record<HeaderVibeState, VibePose> = {
      // Waiting for user input: sun shining between the land below and clouds above
      idle: {
        camY: 5.2,
        lookY: 5.4,
        sunY: 7.4,
        sunScale: 1.0,
        skyColor: new THREE.Color("#6bb5f2"),
        fogColor: new THREE.Color("#d2ecff"),
        fogDensity: 0.015,
        groundBounceColor: new THREE.Color("#63a355"),
        cloudAlpha: 0.92,
        grassAlpha: 1.0,
        speedBoost: 0.65,
      },
      // Local model running: swoop down to meadow, sun glowing over the land horizon
      local: {
        camY: 2.05,
        lookY: 1.65,
        sunY: 5.0,
        sunScale: 1.08,
        skyColor: new THREE.Color("#88cbf6"),
        fogColor: new THREE.Color("#def4ff"),
        fogDensity: 0.019,
        groundBounceColor: new THREE.Color("#5a9a48"),
        cloudAlpha: 0.25,
        grassAlpha: 1.0,
        speedBoost: 1.55,
      },
      // Remote Gemini API running: climb into the sky showing passing clouds and sun
      cloud: {
        camY: 13.4,
        lookY: 15.0,
        sunY: 18.2,
        sunScale: 1.15,
        skyColor: new THREE.Color("#3b82f6"),
        fogColor: new THREE.Color("#bfdbfe"),
        fogDensity: 0.013,
        groundBounceColor: new THREE.Color("#7db7f8"),
        cloudAlpha: 1.0,
        grassAlpha: 0.0,
        speedBoost: 1.65,
      },
    }

    const initialPose = poses[targetStateRef.current]
    const currentBgColor = initialPose.skyColor.clone()
    const currentFogColor = initialPose.fogColor.clone()
    const currentGroundBounce = initialPose.groundBounceColor.clone()

    const scene = new THREE.Scene()
    scene.background = currentBgColor
    const fog = new THREE.FogExp2(
      currentFogColor.getHex(),
      initialPose.fogDensity
    )
    scene.fog = fog

    const camera = new THREE.PerspectiveCamera(52, 4, 0.1, 160)
    camera.position.set(0, initialPose.camY, 8)
    camera.lookAt(0, initialPose.lookY, -24)

    // Lighting
    const hemiLight = new THREE.HemisphereLight(
      "#ffffff",
      currentGroundBounce.getHex(),
      1.35
    )
    scene.add(hemiLight)

    const sunLight = new THREE.DirectionalLight("#fff8e1", 1.3)
    sunLight.position.set(16, 22, 10)
    scene.add(sunLight)

    // =========================================================================
    // SUN (Shines between land & clouds in idle, over horizon in local, in sky in cloud)
    // =========================================================================
    const sunCoreTexture = createSunCoreTexture()
    const sunHaloTexture = createSunHaloTexture()

    const sunHaloMat = new THREE.SpriteMaterial({
      map: sunHaloTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    })
    const sunHalo = new THREE.Sprite(sunHaloMat)
    sunHalo.position.set(10, initialPose.sunY, -58)
    sunHalo.scale.set(36, 36, 1)
    scene.add(sunHalo)

    const sunCoreMat = new THREE.SpriteMaterial({
      map: sunCoreTexture,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      fog: false,
    })
    const sunCore = new THREE.Sprite(sunCoreMat)
    sunCore.position.set(10, initialPose.sunY, -57)
    sunCore.scale.set(12.5, 12.5, 1)
    scene.add(sunCore)

    // =========================================================================
    // LOWER LAYER: GRASSY LANDSCAPE
    // =========================================================================
    const grassGroup = new THREE.Group()
    scene.add(grassGroup)

    const terrainWidth = 92
    const terrainDepth = 104
    const segX = 48
    const segZ = 56
    const terrainGeo = new THREE.PlaneGeometry(
      terrainWidth,
      terrainDepth,
      segX,
      segZ
    )
    terrainGeo.rotateX(-Math.PI / 2)

    const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute
    const vertexCount = posAttr.count
    const colors = new Float32Array(vertexCount * 3)
    const colorAttr = new THREE.BufferAttribute(colors, 3)
    terrainGeo.setAttribute("color", colorAttr)

    const valleyColor = new THREE.Color("#2f7d32")
    const midColor = new THREE.Color("#56ab3a")
    const crestColor = new THREE.Color("#9ad655")
    const tmpColor = new THREE.Color()

    const updateTerrain = (scrollZ: number) => {
      for (let i = 0; i < vertexCount; i++) {
        const x = posAttr.getX(i)
        const z = posAttr.getZ(i)
        const h = terrainHeight(x, z - scrollZ) - 1.15
        posAttr.setY(i, h)

        const norm = THREE.MathUtils.clamp((h + 2.8) / 3.4, 0, 1)
        if (norm < 0.5) {
          tmpColor.lerpColors(valleyColor, midColor, norm * 2)
        } else {
          tmpColor.lerpColors(midColor, crestColor, (norm - 0.5) * 2)
        }
        colors[i * 3] = tmpColor.r
        colors[i * 3 + 1] = tmpColor.g
        colors[i * 3 + 2] = tmpColor.b
      }
      posAttr.needsUpdate = true
      colorAttr.needsUpdate = true
      terrainGeo.computeVertexNormals()
    }

    const terrainMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
    })
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat)
    terrainMesh.position.set(0, 0, -36)
    grassGroup.add(terrainMesh)

    const bladeGeo = new THREE.ConeGeometry(0.08, 0.95, 3, 1)
    bladeGeo.translate(0, 0.475, 0)

    const bladeMat = new THREE.MeshLambertMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 1,
    })

    const BLADE_COUNT = 680
    const grassBlades = new THREE.InstancedMesh(bladeGeo, bladeMat, BLADE_COUNT)
    grassBlades.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    interface BladeData {
      x: number
      z: number
      scaleY: number
      scaleXZ: number
      phase: number
      rotY: number
    }

    const blades: BladeData[] = []
    const bladePalette = [
      new THREE.Color("#4caf38"),
      new THREE.Color("#68c443"),
      new THREE.Color("#88d852"),
      new THREE.Color("#3b8e2e"),
      new THREE.Color("#a8e05f"),
    ]

    for (let i = 0; i < BLADE_COUNT; i++) {
      blades.push({
        x: (Math.random() - 0.5) * 48,
        z: -66 + Math.random() * 74,
        scaleY: 0.65 + Math.random() * 1.15,
        scaleXZ: 0.7 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI,
      })
      grassBlades.setColorAt(i, bladePalette[i % bladePalette.length])
    }
    if (grassBlades.instanceColor) {
      grassBlades.instanceColor.needsUpdate = true
    }
    grassGroup.add(grassBlades)

    const flowerGeo = new THREE.SphereGeometry(0.09, 6, 6)
    const flowerMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 1,
    })
    const FLOWER_COUNT = 95
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FLOWER_COUNT)
    flowers.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    const flowerPalette = [
      new THREE.Color("#fff59d"),
      new THREE.Color("#ffffff"),
      new THREE.Color("#ffe082"),
      new THREE.Color("#ffd1dc"),
    ]
    const flowerData: Array<{
      x: number
      z: number
      scale: number
      phase: number
    }> = []
    for (let i = 0; i < FLOWER_COUNT; i++) {
      flowerData.push({
        x: (Math.random() - 0.5) * 42,
        z: -58 + Math.random() * 66,
        scale: 0.7 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      })
      flowers.setColorAt(i, flowerPalette[i % flowerPalette.length])
    }
    if (flowers.instanceColor) {
      flowers.instanceColor.needsUpdate = true
    }
    grassGroup.add(flowers)

    // =========================================================================
    // UPPER LAYER: PASSING CLOUDS (Floating above the land & sun)
    // =========================================================================
    const cloudGroup = new THREE.Group()
    scene.add(cloudGroup)

    const puffTexture = createCloudPuffTexture()

    interface CloudCluster {
      group: THREE.Group
      speed: number
      baseY: number
      swayPhase: number
      sprites: Array<{ sprite: THREE.Sprite; baseOpacity: number }>
    }

    const cloudClusters: CloudCluster[] = []
    const CLOUD_COUNT = 38

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cluster = new THREE.Group()
      let x = (Math.random() - 0.5) * 56
      if (Math.abs(x) < 4.5 && i % 3 !== 0) {
        x += x >= 0 ? 5.5 : -5.5
      }
      // Clouds live naturally in the upper sky layer (y: 10.5 .. 20.5)
      const y = 10.5 + Math.random() * 10.0
      const z = -98 + Math.random() * 108
      cluster.position.set(x, y, z)

      const puffCount = 3 + Math.floor(Math.random() * 3)
      const clusterScale = 0.85 + Math.random() * 1.15
      const sprites: Array<{ sprite: THREE.Sprite; baseOpacity: number }> = []

      for (let p = 0; p < puffCount; p++) {
        const isLower = p === 0
        const tint = isLower ? "#dceeff" : "#ffffff"
        const baseOpacity = isLower
          ? 0.58 + Math.random() * 0.16
          : 0.74 + Math.random() * 0.2

        const mat = new THREE.SpriteMaterial({
          map: puffTexture,
          color: tint,
          transparent: true,
          opacity: baseOpacity * initialPose.cloudAlpha,
          depthWrite: false,
        })
        const sprite = new THREE.Sprite(mat)
        const px = (p - (puffCount - 1) / 2) * 2.3 * clusterScale
        const py = (isLower ? -0.45 : Math.random() * 0.85) * clusterScale
        const pz = (Math.random() - 0.5) * 1.6
        sprite.position.set(px, py, pz)
        const s = (4.8 + Math.random() * 3.4) * clusterScale
        sprite.scale.set(s * 1.38, s * 0.85, 1)
        cluster.add(sprite)
        sprites.push({ sprite, baseOpacity })
      }

      cloudGroup.add(cluster)
      cloudClusters.push({
        group: cluster,
        speed: 0.75 + Math.random() * 0.7,
        baseY: y,
        swayPhase: Math.random() * Math.PI * 2,
        sprites,
      })
    }

    // Resize handling
    const updateSize = () => {
      const width = Math.max(container.clientWidth, 1)
      const height = Math.max(container.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    updateSize()
    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container)

    // Smoothly interpolated live state
    let curCamY = initialPose.camY
    let curLookY = initialPose.lookY
    let curSunY = initialPose.sunY
    let curSunScale = initialPose.sunScale
    let curFogDensity = initialPose.fogDensity
    let curCloudAlpha = initialPose.cloudAlpha
    let curGrassAlpha = initialPose.grassAlpha
    let curSpeedBoost = initialPose.speedBoost

    let animId = 0
    let lastTime = performance.now()
    let elapsed = 0
    let grassScrollZ = 0
    const dummy = new THREE.Object3D()

    updateTerrain(0)

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate)

      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      elapsed += dt

      const motionScale = reducedMotion ? 0.18 : 1
      const target = poses[targetStateRef.current]
      const lerpFactor = Math.min(1, dt * 2.2)

      curCamY += (target.camY - curCamY) * lerpFactor
      curLookY += (target.lookY - curLookY) * lerpFactor
      curSunY += (target.sunY - curSunY) * lerpFactor
      curSunScale += (target.sunScale - curSunScale) * lerpFactor
      curFogDensity += (target.fogDensity - curFogDensity) * lerpFactor
      curCloudAlpha += (target.cloudAlpha - curCloudAlpha) * lerpFactor
      curGrassAlpha += (target.grassAlpha - curGrassAlpha) * lerpFactor
      curSpeedBoost += (target.speedBoost - curSpeedBoost) * lerpFactor

      currentBgColor.lerp(target.skyColor, lerpFactor)
      currentFogColor.lerp(target.fogColor, lerpFactor)
      currentGroundBounce.lerp(target.groundBounceColor, lerpFactor)

      scene.background = currentBgColor
      fog.color.copy(currentFogColor)
      fog.density = curFogDensity
      hemiLight.groundColor.copy(currentGroundBounce)

      // Update Sun position & gentle breathing glow
      const sunPulse = 1 + Math.sin(elapsed * 1.4) * 0.035 * motionScale
      const sunX = 10 + Math.sin(elapsed * 0.25) * 0.6 * motionScale
      sunHalo.position.set(sunX, curSunY, -58)
      sunCore.position.set(sunX, curSunY, -57)
      sunHalo.scale.set(
        36 * curSunScale * sunPulse,
        36 * curSunScale * sunPulse,
        1
      )
      sunCore.scale.set(
        12.5 * curSunScale,
        12.5 * curSunScale,
        1
      )

      // Camera gliding motion
      camera.position.x = Math.sin(elapsed * 0.45) * 0.35 * motionScale
      camera.position.y = curCamY + Math.sin(elapsed * 0.85) * 0.1 * motionScale
      camera.lookAt(
        Math.sin(elapsed * 0.3) * 0.4 * motionScale,
        curLookY,
        -24
      )

      // Update Grassy Landscape
      grassGroup.visible = curGrassAlpha > 0.01
      if (grassGroup.visible) {
        const grassSpeed = 6.8 * curSpeedBoost * motionScale
        grassScrollZ += dt * grassSpeed
        updateTerrain(grassScrollZ)

        terrainMat.opacity = curGrassAlpha
        bladeMat.opacity = curGrassAlpha
        flowerMat.opacity = curGrassAlpha

        for (let i = 0; i < BLADE_COUNT; i++) {
          const b = blades[i]
          b.z += dt * grassSpeed
          if (b.z > 9) {
            b.z -= 75
            b.x = (Math.random() - 0.5) * 48
          }

          const y = terrainHeight(b.x, b.z - grassScrollZ) - 1.2
          dummy.position.set(b.x, y, b.z)
          dummy.rotation.set(
            Math.sin(elapsed * 2.4 + b.phase) * 0.16 * motionScale,
            b.rotY,
            Math.cos(elapsed * 1.9 + b.phase) * 0.12 * motionScale
          )
          dummy.scale.set(b.scaleXZ, b.scaleY, b.scaleXZ)
          dummy.updateMatrix()
          grassBlades.setMatrixAt(i, dummy.matrix)
        }
        grassBlades.instanceMatrix.needsUpdate = true

        for (let i = 0; i < FLOWER_COUNT; i++) {
          const f = flowerData[i]
          f.z += dt * grassSpeed
          if (f.z > 9) {
            f.z -= 67
            f.x = (Math.random() - 0.5) * 42
          }
          const y = terrainHeight(f.x, f.z - grassScrollZ) - 0.72
          dummy.position.set(
            f.x + Math.sin(elapsed * 2 + f.phase) * 0.05 * motionScale,
            y,
            f.z
          )
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar(f.scale)
          dummy.updateMatrix()
          flowers.setMatrixAt(i, dummy.matrix)
        }
        flowers.instanceMatrix.needsUpdate = true
      }

      // Update Passing Clouds
      cloudGroup.visible = curCloudAlpha > 0.01
      if (cloudGroup.visible) {
        const cloudBaseSpeed = 10.5 * curSpeedBoost * motionScale

        for (let i = 0; i < CLOUD_COUNT; i++) {
          const c = cloudClusters[i]
          c.group.position.z += dt * cloudBaseSpeed * c.speed
          c.group.position.y =
            c.baseY + Math.sin(elapsed * 0.6 + c.swayPhase) * 0.25 * motionScale

          if (c.group.position.z > 13) {
            c.group.position.z = -94 - Math.random() * 14
            let nextX = (Math.random() - 0.5) * 56
            if (Math.abs(nextX) < 4.5 && i % 3 !== 0) {
              nextX += nextX >= 0 ? 5.5 : -5.5
            }
            c.group.position.x = nextX
            c.baseY = 10.5 + Math.random() * 10.0
          }

          const z = c.group.position.z
          const nearFade = THREE.MathUtils.clamp((13 - z) / 8, 0, 1)
          const farFade = THREE.MathUtils.clamp((z + 98) / 22, 0, 1)
          const distanceAlpha = nearFade * farFade

          for (const { sprite, baseOpacity } of c.sprites) {
            ;(sprite.material as THREE.SpriteMaterial).opacity =
              baseOpacity * curCloudAlpha * distanceAlpha
          }
        }
      }

      renderer.render(scene, camera)
    }

    animId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()

      terrainGeo.dispose()
      terrainMat.dispose()
      bladeGeo.dispose()
      bladeMat.dispose()
      flowerGeo.dispose()
      flowerMat.dispose()
      puffTexture.dispose()
      sunCoreTexture.dispose()
      sunHaloTexture.dispose()
      sunCoreMat.dispose()
      sunHaloMat.dispose()

      for (const c of cloudClusters) {
        for (const { sprite } of c.sprites) {
          sprite.material.dispose()
        }
      }

      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
