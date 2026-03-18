import { useRef, useEffect, useCallback } from 'react'

const STYLES = ['particles', 'waves', 'abstract']

export { STYLES as VISUALIZER_STYLES }

export default function Visualizer({ style = 'particles', progressMs = 0, accentColor = 'rgb(250,60,80)', isPlaying = false }) {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const particlesRef = useRef([])
  const timeRef = useRef(0)

  const parseColor = (c) => {
    const m = c.match(/\d+/g)
    return m ? m.map(Number) : [250, 60, 80]
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w, h
    const resize = () => {
      w = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1)
      h = canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1)
    }
    resize()
    window.addEventListener('resize', resize)

    // Init particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 60; i++) {
        particlesRef.current.push({
          x: Math.random() * 2000,
          y: Math.random() * 2000,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          r: Math.random() * 3 + 1,
          phase: Math.random() * Math.PI * 2,
        })
      }
    }

    const draw = () => {
      timeRef.current += 0.016
      const t = timeRef.current
      const [cr, cg, cb] = parseColor(accentColor)
      ctx.clearRect(0, 0, w, h)

      // Simulated beat based on progressMs
      const beat = Math.sin(progressMs * 0.003) * 0.3 + 0.7

      if (style === 'particles') {
        particlesRef.current.forEach(p => {
          if (isPlaying) {
            p.x += p.vx * beat * 2
            p.y += p.vy * beat * 2
          }
          if (p.x < 0) p.x = w / (window.devicePixelRatio || 1)
          if (p.x > w / (window.devicePixelRatio || 1)) p.x = 0
          if (p.y < 0) p.y = h / (window.devicePixelRatio || 1)
          if (p.y > h / (window.devicePixelRatio || 1)) p.y = 0

          const pulse = Math.sin(t * 2 + p.phase) * 0.5 + 0.5
          const radius = (p.r + pulse * 2 * beat) * (window.devicePixelRatio || 1)
          const alpha = 0.15 + pulse * 0.15 * beat

          ctx.beginPath()
          ctx.arc(p.x * (window.devicePixelRatio || 1), p.y * (window.devicePixelRatio || 1), radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`
          ctx.fill()

          // glow
          ctx.beginPath()
          ctx.arc(p.x * (window.devicePixelRatio || 1), p.y * (window.devicePixelRatio || 1), radius * 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha * 0.15})`
          ctx.fill()
        })
      } else if (style === 'waves') {
        const freq = 0.003 + beat * 0.002
        const amp = h * 0.08 * beat
        for (let wave = 0; wave < 3; wave++) {
          ctx.beginPath()
          const yBase = h * (0.3 + wave * 0.2)
          const alpha = 0.08 - wave * 0.02
          for (let x = 0; x <= w; x += 2) {
            const y = yBase + Math.sin(x * freq + t * (1.5 + wave * 0.5) + wave) * amp * (1 - wave * 0.25)
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`
          ctx.lineWidth = 2 * (window.devicePixelRatio || 1)
          ctx.stroke()
        }
      } else if (style === 'abstract') {
        const cx = w / 2, cy = h / 2
        for (let s = 0; s < 4; s++) {
          const rot = t * 0.3 * (s % 2 === 0 ? 1 : -1) + s * Math.PI / 4
          const size = (80 + s * 30 + Math.sin(t + s) * 20) * beat * (window.devicePixelRatio || 1)
          const sides = s + 3
          const alpha = 0.06 + Math.sin(t * 0.5 + s) * 0.03

          ctx.beginPath()
          for (let i = 0; i <= sides; i++) {
            const a = rot + (i / sides) * Math.PI * 2
            const px = cx + Math.cos(a) * size
            const py = cy + Math.sin(a) * size
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.closePath()
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`
          ctx.lineWidth = 1.5 * (window.devicePixelRatio || 1)
          ctx.shadowColor = `rgba(${cr},${cg},${cb},${alpha * 2})`
          ctx.shadowBlur = 20
          ctx.stroke()
          ctx.shadowBlur = 0
        }
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [style, accentColor, isPlaying, progressMs])

  return (
    <canvas
      ref={canvasRef}
      className="visualizer-canvas"
    />
  )
}
