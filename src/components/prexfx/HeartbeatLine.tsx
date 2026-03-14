import { useEffect, useRef } from "react";

const HeartbeatLine = ({ active = false }: { active?: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = active ? "hsl(0, 0%, 75%)" : "hsl(0, 0%, 25%)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = active ? "hsl(0, 0%, 85%)" : "transparent";
      ctx.shadowBlur = active ? 6 : 0;
      ctx.beginPath();

      for (let x = 0; x < w; x++) {
        const pos = (x + offsetRef.current) % 80;
        let y = midY;
        if (active) {
          if (pos > 30 && pos < 35) y = midY - 8;
          else if (pos > 35 && pos < 38) y = midY + 12;
          else if (pos > 38 && pos < 42) y = midY - 4;
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (active) offsetRef.current += 0.8;
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [active]);

  return <canvas ref={canvasRef} width={80} height={24} className="opacity-80" />;
};

export default HeartbeatLine;
